// noinspection SpellCheckingInspection

const https = require("https");
const {getProperty} = require("./properties");
const JIRAURL = "bofidev.atlassian.net";
const JIRAUSERNAME = "David.Logan@axosadvisorservices.com";
const JIRAPASSWORD = "y4Dpx23Z0Y41jQ627B2BC8CC";

const previousMonday = new Date();
previousMonday.setDate(previousMonday.getDate() - ((previousMonday.getDay() + 6) % 7 + 7));
const followingSunday = new Date(previousMonday);
followingSunday.setDate(previousMonday.getDate() + 6);

const formattedPreviousMonday = previousMonday.toISOString().split('T')[0];
const formattedFollowingSunday = followingSunday.toISOString().split('T')[0];

const WORKLOGJQL = `worklogDate >= '${formattedPreviousMonday}' AND worklogDate <= '${formattedFollowingSunday}'`;

const test = true;

async function makeJiraCall(path) {
    return new Promise((resolve, reject) => {
        const options = {
            hostname: `${JIRAURL}`,
            // port: 443,
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
    //"/rest/api/latest/issue/" + jiraKey + "/worklog"
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

async function getAllUpdatedTickets() {
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
    return issues;
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
    if(ticket.issues[0].fields.issuetype.name === "Epic") {
        return {jirakey, daptiv: ticket.issues[0].fields.customfield_10378};
    }
    const parent = ticket.issues[0].fields.parent;
    if(!parent) {
        return null;
    }
    return await getEpic(parent.key);
}

module.exports = {getAllUpdatedTickets, getAllWorklogTickets, getAllUsers, getEpic};