require("dotenv").config();

module.exports = {
    aws: {
        region: process.env.AWS_REGION,
        bucket: process.env.S3_BUCKET,
        accessKeyId: process.env.AWS_ACCESS_KEY_ID,
        secretAccessKey: process.env.AWS_SECRET_ACCESS_KEY,
    },

    rootFolder: process.env.ROOT_FOLDER,

    concurrency: Number(process.env.CONCURRENCY || 5),

    retries: Number(process.env.MAX_RETRIES || 5),
};