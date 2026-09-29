require("dotenv").config();
const { getStats } = require("./src/database");
const { uploadOneFile } = require("./src/services/upload");
const { uploadWorker } = require("./src/workers/uploadWorker");
const { startWorkers, shutdown } = require("./src/workers");
const scanner = require("./src/scanner")
const command = process.argv[2];


process.on("SIGINT", async () => {
  await shutdown();
});

async function main() {
  switch (command) {
    // =========================================
    // SHOW STATS
    // =========================================

    case "scanner": {
      scanner(process.env.ROOT_FOLDER)
      break;
    }

    case "stats": {
      const stats = getStats.get();

      console.log("");

      console.log("==============================");
      console.log("       UPLOAD STATISTICS");
      console.log("==============================");

      console.log("");

      console.log("Total     :", stats.total);

      console.log("Pending   :", stats.pending);

      console.log("Uploading :", stats.uploading);

      console.log("Uploaded  :", stats.uploaded);

      console.log("Failed    :", stats.failed);

      console.log("");

      break;
    }

    // =========================================
    // Workerss
    // =========================================

    case "workers":
      await startWorkers(5);
      break;

    // =========================================
    // Worker One
    // =========================================

    case "worker-one":
      await uploadWorker(1);

      break;

    // =========================================
    // UPLOAD ONE FILE
    // =========================================

    case "upload-one":
      await uploadOneFile();
      break;

    // =========================================
    // WEB DASHBOARD VIEWER
    // =========================================

    case "web": {
      const { startWebServer } = require("./web-server");
      startWebServer();
      break;
    }

    default:
      console.log(`
Commands:

node app.js web
node app.js stats
node app.js workers
node app.js scanner
node app.js upload-one
`);
  }
}

main();
