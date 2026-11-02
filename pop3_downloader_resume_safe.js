const Pop3Command = require("node-pop3");
const fs = require("fs");
const path = require("path");
require("dotenv").config();

// ======================================================
// CONFIG
// ======================================================
console.log(process.env.REDIFFMAIL_USERNAME);
console.log(process.env.REDIFFMAIL_PASSWORD);

const user = process.env.REDIFFMAIL_USERNAME;
const password = process.env.REDIFFMAIL_PASSWORD;
const host = process.env.REDIFFMAIL_HOST;
const port = parseInt(process.env.REDIFFMAIL_PORT, 10);
const tls = process.env.REDIFFMAIL_TLS === "true";

const timeout = 120000;
const SAVE_INTERVAL = 100;

// ======================================================
// GLOBAL STATE
// ======================================================

let uidls = [];

let downloadedCount = 0;
let skippedCount = 0;
let failedCount = 0;

let lastProcessedUID = null;
let lastProcessedMsgNum = null;

let targetDir;
let metadataFile;
let progressFile;
let failedFile;
let uidFile;
let uidLoaded = false;
let downloadedUIDs = new Set();

// ======================================================
// HELPERS
// ======================================================

async function appendLog(message) {
  const line = `[${new Date().toISOString()}] ${message}\n`;

  await fs.promises.appendFile(progressFile, line);
}

async function logFailure(uid, error) {
  await fs.promises.appendFile(
    failedFile,
    `[${new Date().toISOString()}] ${uid} | ${error}\n`,
  );
}

async function saveMetadata() {
  try {
    if (downloadedUIDs.size > 0 && (!uidls || uidls.length === 0)) {
      console.warn("UIDL list unavailable. Skipping metadata overwrite.");
      return;
    }

    const downloaded = downloadedUIDs.size;
    const totalMessages = uidls?.length || downloaded;
    const processed = downloaded + skippedCount + failedCount;

    const metadata = {
      updatedAt: new Date().toISOString(),
      totalMessages,
      downloaded,
      skipped: skippedCount,
      failed: failedCount,
      remaining: Math.max(totalMessages - processed, 0),
      lastProcessedUID,
      lastProcessedMsgNum,
    };

    const tempFile = metadataFile + ".tmp";
    await fs.promises.writeFile(tempFile, JSON.stringify(metadata, null, 2));
    await fs.promises.rename(tempFile, metadataFile);
  } catch (err) {
    console.error("Failed saving metadata:", err.message);
  }
}

async function saveUID(uid) {
  await fs.promises.appendFile(uidFile, uid + "\n");
}

function loadDownloadedUIDs() {
  try {
    if (!fs.existsSync(uidFile)) {
      return new Set();
    }

    const content = fs.readFileSync(uidFile, "utf8");

    return new Set(
      content
        .split("\n")
        .map((v) => v.trim())
        .filter(Boolean),
    );
  } catch (err) {
    console.error("Unable to load UID file:", err.message);
    return new Set();
  }
}

function safeFilename(uid) {
  return uid.replace(/[^a-zA-Z0-9._-]/g, "_");
}

// function printProgress() {
//   const processed = downloadedUIDs.size + skippedCount + failedCount;

//   const remaining = uidls.length - processed;

//   process.stdout.write(
//     `\rDownloaded: ${downloadedCount} | Skipped: ${skippedCount} | Failed: ${failedCount} | Remaining: ${remaining}      `,
//   );
// }

function printProgress(currentIndex) {
  const remaining = Math.max(uidls.length - (currentIndex + 1), 0);

  process.stdout.write(
    `\rAlready: ${alreadyDownloaded} | ` +
    `Downloaded: ${downloadedThisRun} | ` +
    `Skipped: ${skippedThisRun} | ` +
    `Failed: ${failedThisRun} | ` +
    `Remaining: ${remaining}      `
  );
}

// ======================================================
// SHUTDOWN HANDLER
// ======================================================

async function shutdown(signal) {
  console.log(`\n\nReceived ${signal}`);
  await saveMetadata();
  process.exit(0);
}

process.on("SIGINT", () => shutdown("SIGINT"));
process.on("SIGTERM", () => shutdown("SIGTERM"));
process.on("exit", (code) => {
  console.log("Process exited with code:", code);
});

process.on("uncaughtException", async (err) => {
  console.error("\nUncaught Exception:", err);
  await saveMetadata();
  process.exit(1);
});

process.on("unhandledRejection", async (err) => {
  console.error("\nUnhandled Rejection:", err);
  await saveMetadata();
  process.exit(1);
});

// ======================================================
// MAIN
// ======================================================

async function downloadMails() {
  try {
    console.log(`Starting POP3d download for ${user}`);

    const parts = user.split("@");

    if (parts.length !== 2) {
      throw new Error("Invalid REDIFFMAIL_USERNAME format");
    }

    const domain = parts[1];

    targetDir = path.join(__dirname, domain, user);

    await fs.promises.mkdir(targetDir, {
      recursive: true,
    });

    metadataFile = path.join(targetDir, "metadata.json");

    progressFile = path.join(targetDir, "progress.log");

    failedFile = path.join(targetDir, "failed.txt");

    uidFile = path.join(targetDir, "downloaded_uids.txt");

    downloadedUIDs = loadDownloadedUIDs();

    downloadedCount = downloadedUIDs.size;

    console.log(`Already downloaded: ${downloadedUIDs.size}`);

    const pop3 = new Pop3Command({
      user,
      password,
      host,
      port,
      tls,
      timeout,
    });

    pop3.on?.("error", (err) => {
      console.error("POP3 Error:", err);
    });

    pop3.on?.("close", () => {
      console.log("POP3 Connection Closed");
    });

    pop3.on?.("end", () => {
      console.log("POP3 Connection Ended");
    });

    console.log("Fetching UIDL list...");
    uidLoaded = false;
    uidls = await pop3.UIDL();
     
    uidLoaded = true;

    console.log(`Total messages on server: ${uidls.length}`);
    const startTime = Date.now();

    for (let i = 0; i < uidls.length; i++) {
      const [msgNum, uid] = uidls[i];
      console.log(msgNum) 

      if(msgNum == 8627 || msgNum == 8095 || msgNum == 6894 || msgNum == 5149 || msgNum == 4632 || msgNum == 4747 || msgNum == 4770 || msgNum == 4914 || msgNum == 5130 || msgNum == 5137 || msgNum == 5148) 
        continue;
      
      lastProcessedUID = uid;
      lastProcessedMsgNum = msgNum;
      console.log(msgNum) 

      if (downloadedUIDs.has(uid)) {
        skippedCount++;
        continue;
      }
     
      const fileName = safeFilename(uid) + ".eml";

      const filePath = path.join(targetDir, fileName);

      try {
        // console.log("Downloading", msgNum);

        // const size = await pop3.LIST(msgNum);

        const rawMessage = await pop3.RETR(msgNum);
        
        await fs.promises.writeFile(filePath, rawMessage, "utf8");

        downloadedUIDs.add(uid);

        downloadedCount = downloadedUIDs.size;

        await saveUID(uid);

        await appendLog(`SUCCESS | ${uid}`);
      } catch (err) {
        console.log(err);
        failedCount++;

        console.error(`\nFailed: ${uid}`, err.message);

        await appendLog(`FAILED | ${uid} | ${err.message}`);

        await logFailure(uid, err.message);
      }

      // printProgress(i);

      const processed = downloadedUIDs.size + skippedCount + failedCount;

      if (processed % SAVE_INTERVAL === 0) {
        await saveMetadata();
      }
    }

    await saveMetadata();

    try {
      await pop3.QUIT();
    } catch {}

    const duration = ((Date.now() - startTime) / 1000).toFixed(2);

    console.log("\n\n================================");
    console.log("DOWNLOAD COMPLETED");
    console.log("================================");
    console.log("Total Messages :", uidls.length);
    console.log("Downloaded     :", downloadedUIDs.size);
    console.log("Skipped        :", skippedCount);
    console.log("Failed         :", failedCount);
    console.log("Duration       :", duration, "seconds");
    console.log("Folder         :", targetDir);
    console.log("================================");
  } catch (err) {
    console.error("\nFatal Error:", err.message);
    if (uidLoaded) {
      await saveMetadata();
    }
  }
}

// ======================================================
// START
// ======================================================

downloadMails();
