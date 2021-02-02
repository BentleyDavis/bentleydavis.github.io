const typeText = [
    { id: "ht-01", text: "I increase your" },
    { id: "ht-02", text: "profit" },
    { id: "ht-03", text: "and" },
    { id: "ht-04", text: "time" },
    { id: "ht-05", text: "through technology" },
    { id: "ht-06", text: "and training." },
    { id: "ht-07", text: "- Interactive Websites" },
    { id: "ht-08", text: "- Mobile Apps" },
    { id: "ht-09", text: "- Automation" },
    { id: "ht-10", text: "- Fractional CTO" },
]
// const e = document.getElementById('bd-hero-dynamic');

// e.innerHTML = `
// <span id="ht-1"></span>
// <span id="ht-2" style="font-size: 200%;"></span>
// <span id="ht-3"></span>
// <span id="ht-4" style="font-size: 200%;"></span>
// `
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
