
const e = document.createElement('pre');
document.body.appendChild(e);
const typeText = `Web and Mobile Apps
Fractional CTO
Startup Prototypes`;
let counter = 0
const nIntervId = setInterval(function () {
    e.innerHTML = typeText.slice(0, counter++);
    if (counter > typeText.length)
        clearInterval(nIntervId)
}, 50);
