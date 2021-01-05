const AirtablePlus = require('airtable-plus');
const airtableKey = require('./hide_AirtableKey');
const Path = require("path");
const fs = require("fs");
const Url = require("url");
const got = require('got');

module.exports = async function (tableName) {
    const airtable = new AirtablePlus({
        baseID: 'appIb2HsxDrkvwTVs',
        apiKey: airtableKey,
        tableName: tableName,

    });
    const data = await airtable.read({ view: "Grid view" });
    const data2 = [];
    for (item of data) {
        const newItem = item.fields
        data2.push(newItem);
        if (newItem.image) {
            const imgUrl = newItem.image[0].url;
            const newUrl = Path.join(`static-root\\img\\${tableName}\\${newItem.id}${Path.extname(Url.parse(imgUrl).pathname)}`);
            got.stream(imgUrl)
                .pipe(fs.createWriteStream(newUrl));
            delete newItem.image;
        }
    }

    await fs.promises.writeFile(
        `./_data/${tableName}.json`,
        JSON.stringify(data2)
    );
};
