const getUrlMetadata = require('../src/getUrlMetadata.js');


async function processUrls(items, urlProperty = "url") {
    for (item of items) {
        if (item.autoUpdate) {
            await getUrlMetadata.getUrlMetadata(
                item[urlProperty],
                `_data/external/${item.id}`,
                `img/external/${item.id}`
            );
        }
    }
}

exports.processUrls = processUrls;
