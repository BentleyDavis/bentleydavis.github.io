const fs = require("fs");
const Path = require("path");
const getUrlMetadata = require('../src/getUrlMetadata.js');

(async () => {
    skills = JSON.parse(await fs.promises.readFile('_data/skills.json', 'utf8'));
    for (skill of skills) {
        if (skill.autoUpdate) {
            await getUrlMetadata.getUrlMetadata(
                skill.url,
                `_data/external/${skill.id}`,
                `img/external/${skill.id}`
            );
        }
    }

})();

