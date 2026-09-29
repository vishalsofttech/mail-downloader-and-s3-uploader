const fs = require("fs");

const {
  claimNextFile,
  markUploaded,
  retryFile,
  markFailed,
} = require("../database");

const { uploadFile, checkObject } = require("../services/s3");

const config = require("../config");

// =====================================================
// GLOBAL SHUTDOWN FLAG
// =====================================================

let shuttingDown = false;

// =====================================================
// ENABLE SHUTDOWN
// =====================================================

function stopWorkers() {
  shuttingDown = true;
}

// =====================================================
// SLEEP
// =====================================================

function sleep(ms) {
  return new Promise((resolve) => {
    setTimeout(resolve, ms);
  });
}

// =====================================================
// WORKER
// =====================================================

async function uploadWorker(workerId) {
  while (true) {
    // =============================================
    // STOP BEFORE CLAIMING NEW FILE
    // =============================================

    if (shuttingDown) {
      break;
    }

    // =============================================
    // CLAIM FILE
    // =============================================

    const file = claimNextFile();

    if (!file) {
      break;
    }

    // =============================================
    // CHECK LOCAL FILE
    // =============================================

    if (!fs.existsSync(file.file_path)) {
      markFailed.run("Local file does not exist", file.id);

      continue;
    }

    // =============================================
    // UPLOAD
    // =============================================

    let uploaded = false;

    while (!uploaded) {
      const attempt = file.retries + 1;

      try {
        // =============================================
        // CHECK WHETHER OBJECT ALREADY EXISTS IN S3
        // =============================================

        const existingObject = await checkObject(file.s3_key, file.file_size);
        // console.log(existingObject)
        // =============================================
        // OBJECT ALREADY EXISTS AND IS VALID
        // =============================================

        if (existingObject.exists && existingObject.valid) {
          markUploaded.run(
            existingObject.etag || null,
            new Date().toISOString(),
            file.id,
          );

          uploaded = true;

          continue;
        }

        const result = await uploadFile(file.file_path, file.s3_key);

        // =====================================
        // SUCCESS
        // =====================================

        if (result.success) {
          markUploaded.run(
            result.etag || null,
            new Date().toISOString(),
            file.id,
          );

          uploaded = true;

          continue;
        }

        // =====================================
        // FAILURE
        // =====================================

        const nextRetry = file.retries + 1;

        if (nextRetry >= config.retries) {
          markFailed.run(result.error, file.id);

          break;
        }

        // =====================================
        // PUT BACK INTO QUEUE
        // =====================================

        retryFile.run(result.error, file.id);

        const delay = Math.pow(2, nextRetry) * 1000;

        await sleep(delay);

        file.retries = nextRetry;
      } catch (error) {
        const nextRetry = file.retries + 1;

        if (nextRetry >= config.retries) {
          markFailed.run(error.message, file.id);

          break;
        }

        retryFile.run(error.message, file.id);

        const delay = Math.pow(2, nextRetry) * 1000;

        await sleep(delay);

        file.retries = nextRetry;
      }
    }
  }
}

module.exports = {
  uploadWorker,

  stopWorkers,
};
