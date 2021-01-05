const fs = require("fs").promises;
const getAirtable = require('./getDataAirTable');
const { processUrls } = require("./processUrls");
const downloadAirtableImages = require("./downloadAirtableImages");

(async () => {

    // Skills
    const skills = await getAirtable('skills');
    await processUrls(skills)
    await fs.writeFile(`./_data/skills.json`, JSON.stringify(skills));

    // Recommendations
    const recommendations = await getAirtable('recommendations');
    await downloadAirtableImages(recommendations,'recommendations')
    await fs.writeFile(`./_data/recommendations.json`, JSON.stringify(recommendations));
    
})();

