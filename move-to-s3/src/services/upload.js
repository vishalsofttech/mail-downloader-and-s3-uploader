const fs = require("fs");

const {
  markUploading,
  markUploaded,
  markFailed,
  claimNextFile,
} = require("../database");

const { uploadFile } = require("./s3");

// =====================================================
// UPLOAD ONE FILE
// =====================================================

async function uploadOneFile() {
  // -----------------------------------------------
  // 1. Get next pending file
  // -----------------------------------------------

  const file = claimNextFile();

  if (!file) {
    console.log("No pending files found.");

    return;
  }

  console.log("");
  console.log("========================================");
  console.log("Starting Upload");
  console.log("========================================");

  console.log("File :", file.relative_path);
  console.log("Size :", file.file_size, "bytes");
  console.log("");

  // -----------------------------------------------
  // 2. Check local file exists
  // -----------------------------------------------

  if (!fs.existsSync(file.file_path)) {
    console.log("Local file does not exist:");

    console.log(file.file_path);

    return;
  }

  // -----------------------------------------------
  // 3. Mark as uploading
  // -----------------------------------------------

  markUploading.run(file.id);

  console.log("Status: uploading");

  try {
    // -------------------------------------------
    // 4. Upload to S3
    // -------------------------------------------

    const result = await uploadFile(file.file_path, file.s3_key);

    // -------------------------------------------
    // 5. Check result
    // -------------------------------------------

    if (!result.success) {
      markFailed.run(result.error, file.id);

      console.log("");
      console.log("Upload failed.");

      return;
    }

    // -------------------------------------------
    // 6. Mark uploaded
    // -------------------------------------------

    markUploaded.run(result.etag || null, new Date().toISOString(), file.id);

    console.log("");
    console.log("========================================");
    console.log("Upload Successful");
    console.log("========================================");

    console.log("File :", file.relative_path);

    console.log("S3   :", file.s3_key);

    console.log("Status: uploaded");

    console.log("");
  } catch (error) {
    console.error("");
    console.error("Unexpected upload error:");

    console.error(error);

    markFailed.run(error.message, file.id);
  }
}

module.exports = {
  uploadOneFile,
};
