module.exports = async function () {

    const checkUrlMetadata = require('../src/PlayGetExternalData.js');

    let skills = [
        { "ID":"React", "Title":"React", "URL":"https://reactjs.org/", "Type":"Technology", "New":"FALSE", "Old":"FALSE"},
        { "ID":"Node", "Title":"Node", "URL":"https://nodejs.org", "Type":"Technology", "New":"FALSE", "Old":"FALSE"},
        { "ID":"Eleventy", "Title":"Eleventy (11ty)", "URL":"https://www.11ty.dev/", "Type":"Technology", "New":"FALSE", "Old":"FALSE"},
        { "ID":"Ionic", "Title":"Ionic", "URL":"https://ionicframework.com", "Type":"Technology", "New":"FALSE", "Old":"FALSE"},
        { "ID":"Firebase", "Title":"Firebase", "URL":"https://firebase.google.com", "Type":"Technology", "New":"FALSE", "Old":"FALSE"},
        { "ID":"Project Management", "Title":"Project Management", "Type":"Management", "New":"FALSE", "Old":"FALSE"},
        { "ID":"Product Management", "Title":"Product Management", "Type":"Management", "New":"FALSE", "Old":"FALSE"},
        { "ID":"Scrum", "Title":"Scrum", "Type":"Management", "New":"FALSE", "Old":"FALSE"},
        { "ID":"Agile", "Title":"Agile", "Type":"Management", "New":"FALSE", "Old":"FALSE"},
        { "ID":"Customer Service", "Title":"Customer Service", "Type":"Management", "New":"FALSE", "Old":"FALSE"},
        { "ID":"UX", "Title":"UX", "Type":"Technical", "New":"TRUE", "Old":"FALSE"},
        { "ID":"SEO", "Title":"SEO", "Type":"Technical", "New":"TRUE", "Old":"FALSE"},
        { "ID":"Growth Hacking", "Title":"Growth Hacking", "Type":"Technical", "New":"TRUE", "Old":"FALSE"},
        { "ID":"Svelt", "Title":"Svelt", "Type":"Tool", "New":"TRUE", "Old":"FALSE"},
        { "ID":"Mongo DB Realm", "Title":"Mongo DB Realm", "Type":"Technology", "New":"TRUE", "Old":"FALSE"},
        { "ID":"Microsoft Access", "Title":"Microsoft Access", "Type":"Tool", "New":"FALSE", "Old":"TRUE"},
        { "ID":"MS SQL", "Title":"MS SQL", "Type":"Tool", "New":"FALSE", "Old":"TRUE"},
        { "ID":"C#", "Title":"C#", "Type":"Language", "New":"FALSE", "Old":"TRUE"},
        { "ID":"Visual Basic", "Title":"Visual Basic", "Type":"Language", "New":"FALSE", "Old":"TRUE"},
        { "ID":"VBA", "Title":"VBA", "Type":"Language", "New":"FALSE", "Old":"TRUE"},
        { "ID":"Angular", "Title":"Angular", "URL":"https://angularjs.org/", "Type":"Technology", "New":"FALSE", "Old":"TRUE"},
        { "ID":"Knockout", "Title":"Knockout", "Type":"Technology", "New":"FALSE", "Old":"TRUE"},
        { "ID":"ASP.NET", "Title":"ASP.NET", "Type":"Technology", "New":"FALSE", "Old":"TRUE"},
        { "ID":"VBA", "Title":"VBA", "Type":"Language", "New":"FALSE", "Old":"TRUE"},
        { "ID":"Sybase", "Title":"Sybase", "Type":"Tool", "New":"FALSE", "Old":"TRUE"},
    ]

    for (skill of skills) {
        if (skill.URL) {
            await checkUrlMetadata.checkUrlMetadata(
                skill.URL,
                `_data/_external/${skill.ID}`,
                `static-root/img/external/${skill.ID}`
            );
            skill.logo = `/img/external/${skill.ID}/logo.png`;
        }
    }
    await checkUrlMetadata.checkUrlMetadata(
        'https://reactjs.org/',
        '_data/_external/react',
        'static-root/img/external/react'
    );

    return skills
};