#!/usr/bin/env node
const got = require('got');
const Path = require("path");
const Url = require("url");
const metascraper = require('metascraper')([
  require('metascraper-logo-favicon')(),
])
const fs = require("fs");

const checkUrlMetadata = async function (targetUrl, destinationDir) {
  await fs.promises.mkdir(destinationDir, { recursive: true });
  const metaDataFilePath = Path.join(destinationDir, 'meta.json');
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
      Path.join(destinationDir, `logo${extension}`)
    ));
  }
}

checkUrlMetadata(
  'https://reactjs.org/',
  '_data/_external/react'
);
