const fs = require("fs");
const { simpleParser } = require("mailparser");
const { S3Client, GetObjectCommand } = require("@aws-sdk/client-s3");
const config = require("../config");

const DEFAULT_S3_BASE_URL = "https://bfc-mail-backups.s3.ap-southeast-1.amazonaws.com/";
const S3_BASE_URL = (process.env.S3_BASE_URL || DEFAULT_S3_BASE_URL).replace(/\/+$/, "") + "/";

// Optional AWS S3 Client for private / authenticated fallback
let s3Client = null;
if (config.aws && config.aws.bucket && config.aws.accessKeyId && config.aws.secretAccessKey) {
  try {
    s3Client = new S3Client({
      region: config.aws.region || "ap-southeast-1",
      credentials: {
        accessKeyId: config.aws.accessKeyId,
        secretAccessKey: config.aws.secretAccessKey,
      },
    });
  } catch (err) {
    console.error("Warning: Could not initialize S3Client in mailService:", err.message);
  }
}

/**
 * Builds the canonical public S3 URL for a given destination key
 */
function getS3DirectUrl(s3Key) {
  if (!s3Key) return "";
  const parts = s3Key.split("/").map((segment) => encodeURIComponent(segment));
  return S3_BASE_URL + parts.join("/");
}

/**
 * Fetches the raw .eml buffer for an upload record.
 * 1. Attempts direct HTTP fetch from S3 base URL
 * 2. Attempts authenticated S3 GetObjectCommand
 * 3. Falls back to local file on disk if available
 */
async function fetchMailBuffer(record) {
  if (!record) {
    throw new Error("No database record provided.");
  }

  const errors = [];

  // 1. Try public S3 URL fetch
  if (record.s3_key) {
    const s3Url = getS3DirectUrl(record.s3_key);
    try {
      const response = await fetch(s3Url);
      if (response.ok) {
        const arrayBuf = await response.arrayBuffer();
        return {
          buffer: Buffer.from(arrayBuf),
          source: "s3_url",
          url: s3Url,
        };
      } else {
        errors.push(`S3 URL HTTP ${response.status}: ${s3Url}`);
      }
    } catch (err) {
      errors.push(`S3 URL fetch failed: ${err.message}`);
    }
  }

  // 2. Try AWS SDK GetObject
  if (record.s3_key && s3Client && config.aws.bucket) {
    try {
      const result = await s3Client.send(
        new GetObjectCommand({
          Bucket: config.aws.bucket,
          Key: record.s3_key,
        })
      );
      const byteArr = await result.Body.transformToByteArray();
      return {
        buffer: Buffer.from(byteArr),
        source: "s3_sdk",
        url: getS3DirectUrl(record.s3_key),
      };
    } catch (err) {
      errors.push(`AWS S3 GetObject failed: ${err.message}`);
    }
  }

  // 3. Fallback to local file
  if (record.file_path && fs.existsSync(record.file_path)) {
    try {
      const buf = await fs.promises.readFile(record.file_path);
      return {
        buffer: buf,
        source: "local_disk",
        url: getS3DirectUrl(record.s3_key),
      };
    } catch (err) {
      errors.push(`Local file read failed: ${err.message}`);
    }
  }

  throw new Error(`Unable to retrieve mail file. Attempts: [${errors.join(" | ")}]`);
}

/**
 * Parses raw .eml buffer and returns formatted mail data
 */
async function parseMail(record) {
  const { buffer, source, url } = await fetchMailBuffer(record);
  const parsed = await simpleParser(buffer);

  let htmlContent = parsed.html || (parsed.textAsHtml ? parsed.textAsHtml : null);

  // In emails with embedded/inline images (cid:...), convert them to inline Base64 data URIs
  const attachmentsList = [];
  if (Array.isArray(parsed.attachments)) {
    parsed.attachments.forEach((att, idx) => {
      const filename = att.filename || `attachment_${idx + 1}${att.contentType ? "." + att.contentType.split("/")[1] : ""}`;
      const isInline = !!att.related || att.contentDisposition === "inline";

      // If inline and has cid, replace in HTML
      if (att.cid && att.content && htmlContent) {
        const dataUri = `data:${att.contentType || "application/octet-stream"};base64,${att.content.toString("base64")}`;
        // Replace cid:xxxx with dataUri
        htmlContent = htmlContent.split(`cid:${att.cid}`).join(dataUri);
      }

      attachmentsList.push({
        index: idx,
        filename,
        contentType: att.contentType || "application/octet-stream",
        size: att.size || (att.content ? att.content.length : 0),
        isInline,
        hasCid: !!att.cid,
      });
    });
  }

  // Gather email headers for inspection
  const headers = [];
  if (parsed.headers) {
    for (const [key, value] of parsed.headers) {
      if (typeof value === "string" || typeof value === "number") {
        headers.push({ key, value: String(value) });
      } else if (Array.isArray(value)) {
        headers.push({ key, value: value.map((v) => (typeof v === "object" ? JSON.stringify(v) : String(v))).join(", ") });
      } else if (value && typeof value === "object") {
        headers.push({ key, value: value.text || JSON.stringify(value) });
      }
    }
  }

  return {
    id: record.id,
    subject: parsed.subject || "(No Subject)",
    from: {
      text: parsed.from ? parsed.from.text : "Unknown Sender",
      value: parsed.from && parsed.from.value ? parsed.from.value : [],
    },
    to: {
      text: parsed.to ? parsed.to.text : "Unknown Recipient",
      value: parsed.to && parsed.to.value ? parsed.to.value : [],
    },
    cc: parsed.cc ? { text: parsed.cc.text, value: parsed.cc.value || [] } : null,
    bcc: parsed.bcc ? { text: parsed.bcc.text, value: parsed.bcc.value || [] } : null,
    replyTo: parsed.replyTo ? parsed.replyTo.text : null,
    date: parsed.date ? parsed.date.toISOString() : null,
    messageId: parsed.messageId || null,
    inReplyTo: parsed.inReplyTo || null,
    text: parsed.text || "",
    html: htmlContent,
    hasHtml: !!htmlContent,
    attachments: attachmentsList,
    headers: headers.slice(0, 30), // Limit top headers for UI display
    source,
    s3Url: url,
    s3Key: record.s3_key,
    relativePath: record.relative_path,
    fileSize: record.file_size,
    status: record.status,
    uploadedAt: record.uploaded_at,
  };
}

/**
 * Get a specific attachment Buffer from a record
 */
async function getAttachment(record, attachmentIndex) {
  const { buffer } = await fetchMailBuffer(record);
  const parsed = await simpleParser(buffer);

  if (!parsed.attachments || !parsed.attachments[attachmentIndex]) {
    throw new Error(`Attachment at index ${attachmentIndex} not found.`);
  }

  const att = parsed.attachments[attachmentIndex];
  const filename = att.filename || `attachment_${attachmentIndex + 1}`;

  return {
    filename,
    contentType: att.contentType || "application/octet-stream",
    content: att.content,
  };
}

module.exports = {
  S3_BASE_URL,
  getS3DirectUrl,
  fetchMailBuffer,
  parseMail,
  getAttachment,
};
