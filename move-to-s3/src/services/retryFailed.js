const fs = require("fs");

const { db, markUploaded } = require("../database");

const { uploadFile, checkObject } = require("./s3");

const config = require("../config");

// =====================================================
// FAILED FILES
// =====================================================

const getFailedFiles = db.prepare(`
SELECT *
FROM uploads
WHERE status = 'failed'
ORDER BY id
`);

// Keeps status = 'failed' so the normal workers never pick these rows up
const updateFailedError = db.prepare(`
UPDATE uploads
SET
    last_error = ?,
    retries = retries + 1
WHERE id = ?
`);

// =====================================================
// SLEEP
// =====================================================

function sleep(ms) {
  return new Promise((resolve) => {
    setTimeout(resolve, ms);
  });
}

// =====================================================
// RETRY ONE FILE (sequential, own attempt counter)
// =====================================================

async function retryOne(file, maxAttempts) {
  if (!fs.existsSync(file.file_path)) {
    updateFailedError.run("Local file does not exist", file.id);

    return { ok: false, error: "Local file does not exist" };
  }

  let lastError = null;

  for (let attempt = 1; attempt <= maxAttempts; attempt++) {
    try {
      const existingObject = await checkObject(file.s3_key, file.file_size);

      if (existingObject.exists && existingObject.valid) {
        markUploaded.run(
          existingObject.etag || null,
          new Date().toISOString(),
          file.id,
        );

        return { ok: true, how: "already in S3" };
      }

      const result = await uploadFile(file.file_path, file.s3_key);

      if (result.success) {
        markUploaded.run(
          result.etag || null,
          new Date().toISOString(),
          file.id,
        );

        return { ok: true, how: "uploaded" };
      }

      lastError = result.error;
    } catch (error) {
      lastError = error.message;
    }

    console.log(`  attempt ${attempt}/${maxAttempts} failed: ${lastError}`);

    if (attempt < maxAttempts) {
      await sleep(Math.pow(2, attempt) * 1000);
    }
  }

  updateFailedError.run(lastError, file.id);

  return { ok: false, error: lastError };
}

// =====================================================
// RETRY ALL FAILED FILES
// =====================================================

async function retryFailedFiles({ dryRun = false } = {}) {
  const files = getFailedFiles.all();

  console.log("");
  console.log("========================================");
  console.log(`Failed files: ${files.length}${dryRun ? " (dry run)" : ""}`);
  console.log("========================================");

  if (files.length === 0) {
    return;
  }

  if (dryRun) {
    for (const file of files) {
      console.log(`#${file.id}  ${file.file_size} bytes  ${file.s3_key}`);
      console.log(`  last error: ${file.last_error}`);
    }

    return;
  }

  let succeeded = 0;
  let stillFailed = 0;

  for (const [index, file] of files.entries()) {
    console.log("");
    console.log(`[${index + 1}/${files.length}] #${file.id} ${file.s3_key}`);

    const result = await retryOne(file, config.retries);

    if (result.ok) {
      succeeded++;

      console.log(`  OK (${result.how})`);
    } else {
      stillFailed++;

      console.log(`  STILL FAILED: ${result.error}`);
    }
  }

  console.log("");
  console.log("========================================");
  console.log("Retry Completed");
  console.log("========================================");
  console.log("Succeeded    :", succeeded);
  console.log("Still failed :", stillFailed);
  console.log("");
}

module.exports = {
  retryFailedFiles,
};
