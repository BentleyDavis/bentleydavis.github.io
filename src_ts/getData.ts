const airTables = [
    { name: "Content", attachmentFields: ["Images"] },
    { name: "Skills" },
    { name: "Recommendations", attachmentFields: ["image"]  }
]

import Config from './config'
import { getBase } from './Airtable/getBase';
import fs from 'fs';

export default async function getData(config = Config) {
    fs.rmdirSync(config.dataDir, { recursive: true });
    fs.mkdirSync(config.dataDir, { recursive: true });
    await getBase(config.dataDir, airTables);
}

getData();



