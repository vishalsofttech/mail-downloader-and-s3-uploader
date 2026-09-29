const fs = require("fs");

const {
  S3Client,
  HeadBucketCommand,
  PutObjectCommand,
  HeadObjectCommand
} = require("@aws-sdk/client-s3");

const config = require("../config");

const s3 = new S3Client({
  region: config.aws.region,
  credentials: {
    accessKeyId: config.aws.accessKeyId,
    secretAccessKey: config.aws.secretAccessKey,
  },
});

async function testConnection() {
  try {
    await s3.send(
      new HeadBucketCommand({
        Bucket: config.aws.bucket,
      }),
    );

    console.log("S3 connection successful!");
    console.log("Bucket:", config.aws.bucket);

    return true;
  } catch (error) {
    console.error("S3 connection failed!");

    console.error("Name:", error.name);
    console.error("Message:", error.message);
    console.error("Code:", error.Code);
    console.error("Status:", error.$metadata?.httpStatusCode);
    console.error("Request ID:", error.$metadata?.requestId);

    return false;
  }
}

async function checkObject(s3Key, localFileSize) {

    try {

        const result = await s3.send(
            new HeadObjectCommand({
                Bucket: config.aws.bucket,
                Key: s3Key,
            })
        );

        const s3FileSize = Number(
            result.ContentLength || 0
        );

        if (s3FileSize !== Number(localFileSize)) {

            return {
                exists: true,
                valid: false,
                reason: "size-mismatch",
            };
        }

        return {
            exists: true,
            valid: true,
            etag: result.ETag,
        };

    } catch (error) {

        const status =
            error.$metadata?.httpStatusCode;

        // Object does not exist
        if (status === 404) {

            return {
                exists: false,
                valid: false,
            };
        }

        // Some S3 configurations return 403
        // instead of 404 when the object cannot
        // be checked.
        if (status === 403) {

            throw new Error(
                `Cannot check S3 object permission: ${s3Key}`
            );
        }

        throw error;
    }
}

async function uploadFile(localFile, s3Key) {
  try {
    // console.log("Uploading:");
    // console.log("Local :", localFile);
    // console.log("S3 Key:", s3Key);

    const fileStream = fs.createReadStream(localFile);

    const result = await s3.send(
      new PutObjectCommand({
        Bucket: config.aws.bucket,
        Key: s3Key,
        Body: fileStream,
      }),
    );

    // console.log("Upload successful!");

    return {
      success: true,
      etag: result.ETag,
    };
  } catch (error) {
    console.error("Upload failed!");

    console.error("Name:", error.name);
    console.error("Message:", error.message);
    console.error("Code:", error.Code);
    console.error("Status:", error.$metadata?.httpStatusCode);

    return {
      success: false,
      error: error.message,
    };
  }
}

module.exports = {
  s3,
  testConnection,
  uploadFile,
  checkObject
};
