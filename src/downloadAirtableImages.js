const Path = require("path");
const fs = require("fs");
const Url = require("url");
const got = require('got');

module.exports = async function (items,tableName) {
    for (item of items) {
        if (item.image) {
            const imgUrl = item.image[0].url;
            const newUrl = Path.join(`static-root\\img\\${tableName}\\${item.id}${Path.extname(Url.parse(imgUrl).pathname)}`);
            got.stream(imgUrl)
                .pipe(fs.createWriteStream(newUrl));
            delete item.image;
        }
    }
    return items;
}