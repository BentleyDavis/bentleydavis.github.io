const fsp = require("fs").promises;

module.exports = async function() {
    const dict = {};
  
    const skills = (JSON.parse( await fsp.readFile('data/content/data.json', 'utf8'))).Skills;

    for (skill of skills){
        dict[skill.id] = skill;
    }

    return dict;
  };