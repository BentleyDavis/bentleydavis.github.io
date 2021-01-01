const fs = require("fs");
const Path = require("path");
const getUrlMetadata = require('../src/getUrlMetadata.js');

(async () => {
    // recomendations = JSON.parse(await fs.promises.readFile('_data/recomendations.json', 'utf8'));
    // await processUrls(recomendations, "linkedIn")
    //  //Linked in is blocking requests

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

