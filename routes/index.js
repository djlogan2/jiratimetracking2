// noinspection SpellCheckingInspection

const express = require('express');
const {getProperty, setProperty} = require("../properties");
const {getAllUsers, getAllWorklogTickets, getEpic, getAllUpdatedTickets} = require("../jira");
const router = express.Router();
const zeroarray = [0.0,0.0,0.0,0.0,0.0,0.0,0.0];

async function render(req, res) {
    const users = [];
    const {issues,dates} = await getAllUpdatedTickets(req.query.date);
    const startDate = new Date(`${dates.start}T00:00:00-07:00`);
    const endDate = new Date(`${dates.end}T00:00:00-07:00`);
    let worklogs = await getAllWorklogTickets(issues);
    const all_users = await getAllUsers(worklogs);
    const assigned_users = await getProperty(req.params.id) || [];

    const projects = {"Non-Project work": [8.0, 8.0, 8.0, 8.0, 8.0, 0.0, 0.0]};

    const issuetypes = {};

    issues.forEach(ticket => {
        issuetypes[ticket.key] = ticket.fields.issuetype.name;
    });

    Object.keys(all_users).forEach(user => {
        users.push({id: user, name: all_users[user], assigned: assigned_users.some(u => u === user)});
    });

    const epics = {};
    worklogs = worklogs.filter(wl => assigned_users.some(au => au === wl.updateAuthor.accountId && wl.started >= startDate && wl.started < endDate));
    worklogs.forEach(wl => epics[wl.jirakey] = null);
    const wait_for_epics = Object.keys(epics).map(async key =>{epics[key] = await getEpic(key);});
    await Promise.all(wait_for_epics);
    worklogs.forEach(wl => {
        wl.epic = epics[wl.jirakey];
        wl.issueType = issuetypes[wl.jirakey];
        // Sun Mon Tue Wed Thu Fri Sat
        //     Mon Tue Wed Thu Fri Sat Sun
        wl.day = wl.started.getDay() - 1;
        if(wl.day === -1) wl.day = 6;
        if(!wl.epic) wl.epic = {};
        if(!wl.epic.daptiv) {
            if(wl.issueType === "Bug")
                wl.epic.daptiv = '102 Bugs: AAS';
            else
                wl.epic.daptiv = '119 Enhancements: AAS';
        }
        if(!(wl.epic.daptiv in projects))
            projects[wl.epic.daptiv] = [...zeroarray];
        projects[wl.epic.daptiv][wl.day] += wl.timeSpentSeconds / 3600.0;
        projects['Non-Project work'][wl.day] -= wl.timeSpentSeconds / 3600.0;
        if(projects['Non-Project work'][wl.day] < 0.0)
            projects['Non-Project work'][wl.day] = 0.0;
    });

    const options = {
        user: req.params.id,
        users,
        projects,
        dates
    }
    res.render('user', options);
}

/* GET home page. */
router.post("/:id/updateusers", function (req, res) {
    setProperty(req.params.id, Object.keys(req.body));
    return render(req, res);
});

router.get('/:id', render)

router.get('/', function (req, res, next) {
    res.render('index', {title: 'Express'});
});

module.exports = router;
