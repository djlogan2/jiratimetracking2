// noinspection SpellCheckingInspection

const fs = require("fs");
const path = "jiratimetracking.json";
const status = {loading: true, waiting: [], writing: 0};
let properties;

fs.readFile(path, "utf8", (err, jsonString) => {
    status.loading = false;
    if (err) {
        console.error(err);
        return;
    }
    properties = JSON.parse(jsonString);
    status.waiting.forEach(fn =>  fn());
    status.waiting = [];
});

async function getProperty(propertyname) {
    if(!properties)
        properties = {};

    if(!status.loading)
        return Promise.resolve(properties[propertyname]);

    return new Promise((resolve) => {
        if(!status.loading) {
            resolve(properties[propertyname]);
            return;
        }
        status.waiting.push(() => {
            resolve(properties[propertyname]);
        });
    });
}

function recursiveWrite(err) {
    if(err)
        console.log(`Error writing properties file: ${err}`);
    if(!status.writing) return;
    const jsonString = JSON.stringify(properties);
    status.writing = 0;
    fs.writeFile(path, jsonString, recursiveWrite);
}

function setProperty(propertyname, propertyvalue) {
    if(!properties)
        properties = {};
    properties[propertyname] = propertyvalue;
    status.writing++;
    if(status.writing === 1) recursiveWrite();
}

module.exports = {getProperty, setProperty};