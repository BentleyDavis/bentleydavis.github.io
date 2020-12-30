#!/usr/bin/env node
const got = require('got');
const Path = require("path");
const Url = require("url");
const metascraper = require('metascraper')([
  require('metascraper-logo-favicon')(),
])
const fs = require("fs");

const getUrlMetadata = async function (targetUrl, dataDestination, imageDestination) {
  const imageFileDestination = Path.join('static-root',imageDestination);
  await fs.promises.mkdir(dataDestination, { recursive: true });
  await fs.promises.mkdir(imageFileDestination, { recursive: true });
  const metaDataFilePath = Path.join(dataDestination, 'sourceMetaData.json');
  let oldMetaData;
  if (fs.existsSync(metaDataFilePath)){
    oldMetaData = await fs.promises.readFile(metaDataFilePath, 'utf8');
  }

  const { body: html, url } = await got(targetUrl)
  const newMetadata = await metascraper({ html, url })
  if (JSON.stringify(newMetadata) !== oldMetaData) {
    await fs.promises.writeFile(metaDataFilePath, JSON.stringify(newMetadata));
    const extension = Path.extname(Url.parse(newMetadata.logo).pathname);
    got.stream(newMetadata.logo).pipe(fs.createWriteStream(
      Path.join(imageFileDestination, `logo${extension}`)
    ));
    const newData = {logo: Path.join(`/`,imageDestination,`logo${extension}`)}
    await fs.promises.writeFile(Path.join(dataDestination, 'data.json'), JSON.stringify(newData));
  }
}

exports.getUrlMetadata = getUrlMetadata;
