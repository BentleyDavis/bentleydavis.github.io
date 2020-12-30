const e = document.getElementById('bd-hero-dynamic');
const typeText = `Fractional CTO
Full Stack Web &
Mobile Engineer
Startup Mentor &
Prototypes
Better Agreement`;
let counter = 0
const nIntervId = setInterval(function () {
    e.innerHTML = typeText.slice(0, counter++);
    if (counter > typeText.length)
        clearInterval(nIntervId)
}, 50);
