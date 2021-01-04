const fs = require("fs");
const getUrlMetadata = require('../src/getUrlMetadata.js');
const getAirtable = require('./getDataAirTable');

(async () => {
    await getAirtable('skills');
    await getAirtable('recommendations');
    skills = JSON.parse(await fs.promises.readFile('_data/skills.json', 'utf8'));
    await processUrls(skills)
})();

async function processUrls(items, urlProperty = "url") {
    for (item of items) {
        if (item.autoUpdate) {
            await getUrlMetadata.getUrlMetadata(
                item[urlProperty],
                `_data/external/${item.id}`,
                `img/external/${item.id}`
            );
        }
    }
}

