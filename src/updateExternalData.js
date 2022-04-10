const fs = require("fs").promises;
//const getAirtable = require('./getDataAirTable');
const { processUrls } = require("./processUrls");
//const downloadAirtableImages = require("./downloadAirtableImages");

(async () => {

    // Skills
    //const skills = await getAirtable('skills');
    const skills = (JSON.parse(await fs.readFile('data/content/data.json', 'utf8'))).Skills;

    await processUrls(skills)

})();

