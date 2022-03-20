const typeText = [
    { id: "ht-01", text: "more satisfaction for" },
    { id: "ht-015", text: "more people though technology" },
    { id: "ht-02", text: "think visually to work brilliantly" },
    { id: "ht-03", text: "solve big problems with small experiments" },
    { id: "ht-04", text: "interactive websites, mobile apps" },
    { id: "ht-05", text: "training you to use technology" },
    { id: "ht-06", text: "automating your boring work" },
    { id: "ht-07", text: "30 years creating software" },
    { id: "ht-08", text: "20 years managng teams" },
    { id: "ht-09", text: "5 years mentoring startups" },
    { id: "ht-10", text: "CTO of a successful startup exit" },
]

let sectionCounter = 0;
let characterCounter = 0;
let currentElement = document.getElementById(typeText[sectionCounter].id)
const nIntervId = setInterval(function () {
    currentElement.innerHTML = typeText[sectionCounter].text.slice(0, characterCounter++);
    if (characterCounter > typeText[sectionCounter].text.length) {
        sectionCounter++
        if (sectionCounter >= typeText.length) {
            clearInterval(nIntervId)
        } else {
        characterCounter = 0
            currentElement = document.getElementById(typeText[sectionCounter].id)
        }
    }
}, 50);
