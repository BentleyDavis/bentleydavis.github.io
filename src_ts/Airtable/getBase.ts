import { getTable } from './getTable';
import { promises as fsp } from 'fs';
import { getAttachments } from './getAttachments';

export async function getBase(dataDir: string, airTables: ({ name: string; attachmentFields: string[]; } | { name: string; attachmentFields?: undefined; })[]) {
    await fsp.mkdir(dataDir, { recursive: true });
    const resultData: any = {};
    for (const table of airTables) {
        const tableData = await getTable(table.name);
        resultData[table.name] = tableData;
        if (table.attachmentFields) {
            for (const attachmentField of table.attachmentFields) {
                getAttachments(tableData, attachmentField, dataDir);
            }
        }
    }

    //downloadAttachments(resultData.Content, 'Images', dataDir)
    await fsp.writeFile(dataDir + 'data.json',
        JSON.stringify(resultData)
    );
}
