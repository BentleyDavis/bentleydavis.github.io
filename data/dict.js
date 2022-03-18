const fsp = require("fs").promises;

module.exports = async function() {
    const dict = {};
  
    const skills = JSON.parse( await fsp.readFile('_data/skills.json', 'utf8'));

    for (skill of skills){
        dict[skill.id] = skill;
    }

    return dict;
  };