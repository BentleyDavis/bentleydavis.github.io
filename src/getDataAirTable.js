const Airtable = require('airtable');
const airtableKey = require('./hide_AirtableKey');

module.exports = function (tableName) {
    return new Promise((resolve, reject) => {
        const base = new Airtable({ apiKey: airtableKey }).base('appIb2HsxDrkvwTVs');
        const result = [];
        base(tableName).select({
            view: "Grid view"

        }).eachPage(function page(records, fetchNextPage) {
            records.forEach(function (record) {
                result.push(record.fields);
            });
            fetchNextPage();

        }, function done(err) {
            if (err) { reject(err); return; }
            resolve(result);
        });
    });
};
