const fs = require("fs");
const path = require("path");

const { addFile } = require("../database");

let scanned = 0;
let added = 0;
let skipped = 0;
let progressTimer = null;

// userEmail/file.eml -> domain/userEmail/file.eml
// e.g. arjun@bfccapital.com/1.eml -> bfccapital.com/arjun@bfccapital.com/1.eml
function buildS3Key(relativePath) {
    const [userEmail, ...rest] = relativePath.split("/");
    const domain = userEmail.includes("@")
        ? userEmail.split("@").pop().toLowerCase()
        : "unknown-domain";

    return [domain, userEmail, ...rest].join("/");
}

function scanDirectory(rootFolder, currentFolder = rootFolder) {
 
    const items = fs.readdirSync(currentFolder, {
        withFileTypes: true,
    });

    for (const item of items) {
        const fullPath = path.join(currentFolder, item.name);
        if (item.isDirectory()) {
            scanDirectory(rootFolder, fullPath);
            continue;
        }

        if (!item.name.toLowerCase().endsWith(".eml")) {
            continue;
        }

        scanned++;

        const stats = fs.statSync(fullPath);

        const relativePath = path
            .relative(rootFolder, fullPath)
            .replace(/\\/g, "/");
        
        const s3Key = buildS3Key(relativePath);

        const result = addFile.run({
            file_path: fullPath,
            relative_path: relativePath,
            s3_key: s3Key,
            file_size: stats.size,
            created_at: new Date().toISOString(),
        });

        if (result.changes > 0) {
            added++;
        } else {
            skipped++;
        }
    }
}

function startScan(rootFolder) {
    progressTimer = setInterval(() => {
        process.stdout.write(
            `\rScanned: ${scanned.toLocaleString()} | Added: ${added.toLocaleString()} | Skipped: ${skipped.toLocaleString()}`
        );
    }, 1000);

    scanDirectory(rootFolder);
    
    if (progressTimer) clearInterval(progressTimer);

    console.log("\n\nScan Completed");
    console.log("------------------------");
    console.log("Scanned :", scanned.toLocaleString());
    console.log("Added   :", added.toLocaleString());
    console.log("Skipped :", skipped.toLocaleString());
}

module.exports = startScan;