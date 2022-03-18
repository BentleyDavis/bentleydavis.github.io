import fs from 'fs';
import got from 'got';
import Path from "path";

export async function getAttachments(table, attributeName: string, destDirPath: string) {
    for (const record of table) {
        for (const attachment of record[attributeName]) {
            getAttachment(attachment, destDirPath);
            if (attachment.thumbnails) {
                const extension = attachment.filename.split;
                // for (const index in attachment.thumbnails) {
                //     const thumbnail = attachment.thumbnails[index];
                //     getAttachment(thumbnail, destDirPath);
                // }
            }
        }
    }
}
function getAttachment(attachment: any, destDirPath: string) {
    const oldUrl = attachment.url;
    const newFilePath = oldUrl.replace('https://dl.airtable.com/', destDirPath).replace("/.attachments/","/attachments/");
    attachment.newFilePath = newFilePath;
    fs.mkdirSync(Path.dirname(newFilePath), { recursive: true });
    got.stream(oldUrl).pipe(
        fs.createWriteStream(newFilePath)
    );
}
