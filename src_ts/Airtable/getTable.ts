import Airtable from 'airtable';
import * as airtableConfig from '../HIDE.airtableConfig.json';

export const getTable = function (tableName) {
    return new Promise((resolve, reject) => {
        const base = new Airtable({ apiKey: airtableConfig.key }).base(airtableConfig.baseBase);
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
