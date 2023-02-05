// noinspection SpellCheckingInspection

const https = require("https");
const {getProperty} = require("./properties");
let JIRAURL;
let JIRAUSERNAME;
let JIRAPASSWORD;

function getDateStrings(dateinput) {
    let previousMonday;
    let previousweek = true;
    if (!dateinput)
        previousMonday = new Date();
    else if (dateinput.toLowerCase() === "today") {
        previousMonday = new Date();
        previousweek = false;
    } else {
        previousMonday = new Date(`${dateinput}T00:00:00-07:00`);
        previousweek = false;
    }

    previousMonday.setDate(previousMonday.getDate() - ((previousMonday.getDay() + 6) % 7 + (previousweek ? 7 : 0)));
    const followingSunday = new Date(previousMonday);
    followingSunday.setDate(previousMonday.getDate() + 6);
    const formattedPreviousMonday = previousMonday.toISOString().split('T')[0];
    const formattedFollowingSunday = followingSunday.toISOString().split('T')[0];
    return {start: formattedPreviousMonday, end: formattedFollowingSunday};
}

async function loadProperties() {
    if (!!JIRAURL)
        return;
    JIRAURL = await getProperty("JIRAURL");
    JIRAUSERNAME = await getProperty("JIRAUSERNAME");
    JIRAPASSWORD = await getProperty("JIRAPASSWORD");
}

async function makeJiraCall(path) {
    await loadProperties();
    return new Promise((resolve, reject) => {
        const options = {
            hostname: `${JIRAURL}`,
            path: path,
            method: 'GET',
            timeout: 60000,
            rejectUnauthorized: false,
            headers: {
                'Authorization': `Basic ${Buffer.from(JIRAUSERNAME + ':' + JIRAPASSWORD).toString('base64')}`
            }
        }

        let json = "";
        https.request(options, resp => {
            resp.on("data", chunk => {
                json += chunk;
            });
            resp.on("end", () => {
                resolve(JSON.parse(json));
            });
        })
            .on("error", err => {
                reject(err);
            })
            .end();
    });
}

async function getWorkLogTicket(jirakey) {
    let startAt = 0;
    let done = false;
    const worklogs = [];
    while (!done) {
        const json = await makeJiraCall(`/rest/api/latest/issue/${jirakey}/worklog`);
        worklogs.push(...json.worklogs);
        if (json.startAt + json.maxResults < json.total) {
            startAt += json.maxResults;
        } else {
            done = true;
        }
    }
    worklogs.forEach(wl => {
        wl.jirakey = jirakey;
        wl.created = new Date(wl.created);
        wl.updated = new Date(wl.updated);
        wl.started = new Date(wl.started);
    });
    return worklogs;
}

async function getAllUpdatedTickets(dateinput) {
    const dates = getDateStrings(dateinput);
    const WORKLOGJQL = `worklogDate >= '${dates.start}' AND worklogDate <= '${dates.end}'`;
    let startAt = 0;
    let done = false;
    const issues = [];
    while (!done) {
        const json = await makeJiraCall(`/rest/api/latest/search?startAt=${startAt}&maxResults=1000&expand=changelog&jql=${encodeURI(WORKLOGJQL)}`);
        issues.push(...json.issues);
        if (json.startAt + json.maxResults < json.total) {
            startAt += json.maxResults;
        } else {
            done = true;
        }
    }
    return {issues,dates};
}

async function getAllWorklogTickets(updated_tickets) {
    const tickets = updated_tickets || await getAllUpdatedTickets();
    const worklogs1 = await Promise.all(tickets.map(async (ticket) => await getWorkLogTicket(ticket.key)));
    const worklogs = [];
    worklogs1.forEach(wl => worklogs.push(...wl));
    return worklogs;
}

async function getAllUsers(passed_worklogs) {
    const users = {};
    const worklogs = passed_worklogs || await getAllWorklogTickets();
    worklogs.forEach(worklog => {
        if (!users[worklog.author.accountId])
            users[worklog.author.accountId] = worklog.author.displayName;
    })
    return users;
}

async function getEpic(jirakey) {
    const ticket = await makeJiraCall(`/rest/api/latest/search?jql=${encodeURI(`key=${jirakey}`)}`);
    if (ticket.issues[0].fields.issuetype.name === "Epic") {
        return {jirakey, daptiv: ticket.issues[0].fields.customfield_10378};
    }
    const parent = ticket.issues[0].fields.parent;
    if (!parent) {
        return null;
    }
    return await getEpic(parent.key);
}

module.exports = {getAllUpdatedTickets, getAllWorklogTickets, getAllUsers, getEpic};