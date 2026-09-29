const http = require("http");
const fs = require("fs");
const path = require("path");
const Database = require("better-sqlite3");
const { parseMail, getAttachment, fetchMailBuffer, S3_BASE_URL } = require("./src/services/mailService");

const PORT = parseInt(process.env.WEB_PORT || process.env.PORT || "4500", 10);
const PUBLIC_DIR = path.join(__dirname, "public");
const COMPLETED_DIR = path.join(__dirname, "completed-uploaded-dbs");
const ACTIVE_DB_PATH = path.join(__dirname, "uploads.db");

// Connection cache: dbKey -> Database instance
const dbCache = new Map();

function getDbInstance(dbKey) {
  if (dbCache.has(dbKey)) {
    return dbCache.get(dbKey);
  }

  let dbPath = null;
  if (dbKey === "uploads.db" || dbKey === "active") {
    if (fs.existsSync(ACTIVE_DB_PATH)) {
      dbPath = ACTIVE_DB_PATH;
    }
  } else {
    // Look inside completed-uploaded-dbs
    const safeName = path.basename(dbKey);
    const candidatePath = path.join(COMPLETED_DIR, safeName);
    if (fs.existsSync(candidatePath)) {
      dbPath = candidatePath;
    }
  }

  if (!dbPath) {
    return null;
  }

  try {
    const db = new Database(dbPath, { readonly: true, fileMustExist: true });
    try {
      db.pragma("query_only = ON");
    } catch {}
    dbCache.set(dbKey, db);
    return db;
  } catch (err) {
    console.error(`Failed to open database [${dbKey}] at ${dbPath}:`, err.message);
    return null;
  }
}

function discoverDatabases() {
  const databases = [];

  // 1. Check active database
  if (fs.existsSync(ACTIVE_DB_PATH)) {
    const stat = fs.statSync(ACTIVE_DB_PATH);
    let totalRecords = 0;
    try {
      const db = getDbInstance("uploads.db");
      if (db) {
        const row = db.prepare("SELECT count(*) as count FROM uploads").get();
        totalRecords = row ? row.count : 0;
      }
    } catch {}

    databases.push({
      id: "uploads.db",
      name: "uploads.db (Active Queue)",
      filename: "uploads.db",
      type: "active",
      sizeBytes: stat.size,
      totalRecords,
      isDefault: true,
    });
  }

  // 2. Discover completed databases
  if (fs.existsSync(COMPLETED_DIR)) {
    const entries = fs.readdirSync(COMPLETED_DIR, { withFileTypes: true });
    for (const entry of entries) {
      if (entry.isFile() && entry.name.endsWith(".db")) {
        const fullPath = path.join(COMPLETED_DIR, entry.name);
        const stat = fs.statSync(fullPath);
        let totalRecords = 0;
        try {
          const db = getDbInstance(entry.name);
          if (db) {
            const row = db.prepare("SELECT count(*) as count FROM uploads").get();
            totalRecords = row ? row.count : 0;
          }
        } catch {}

        databases.push({
          id: entry.name,
          name: `${entry.name} (Archived)`,
          filename: entry.name,
          type: "completed",
          sizeBytes: stat.size,
          totalRecords,
          isDefault: databases.length === 0,
        });
      }
    }
  }

  return databases;
}

function sendJson(res, statusCode, data) {
  res.writeHead(statusCode, {
    "Content-Type": "application/json; charset=utf-8",
    "Cache-Control": "no-cache, no-store, must-revalidate",
    "Access-Control-Allow-Origin": "*",
  });
  res.end(JSON.stringify(data));
}

function sendError(res, statusCode, message) {
  sendJson(res, statusCode, { error: message });
}

function handleApiDatabases(req, res) {
  try {
    const databases = discoverDatabases();
    sendJson(res, 200, { databases });
  } catch (err) {
    sendError(res, 500, err.message);
  }
}

function handleApiStats(req, res, url) {
  const dbKey = url.searchParams.get("db") || "uploads.db";
  const db = getDbInstance(dbKey);
  if (!db) {
    return sendError(res, 404, `Database '${dbKey}' not found.`);
  }

  try {
    const query = `
      SELECT
        COUNT(*) AS total,
        COALESCE(SUM(file_size), 0) AS total_bytes,
        COALESCE(SUM(CASE WHEN status = 'pending' THEN 1 ELSE 0 END), 0) AS pending,
        COALESCE(SUM(CASE WHEN status = 'uploading' THEN 1 ELSE 0 END), 0) AS uploading,
        COALESCE(SUM(CASE WHEN status = 'uploaded' THEN 1 ELSE 0 END), 0) AS uploaded,
        COALESCE(SUM(CASE WHEN status = 'uploaded' THEN file_size ELSE 0 END), 0) AS uploaded_bytes,
        COALESCE(SUM(CASE WHEN status = 'failed' THEN 1 ELSE 0 END), 0) AS failed
      FROM uploads
    `;
    const stats = db.prepare(query).get();
    const progressPercent = stats.total_bytes > 0
      ? (stats.uploaded_bytes / stats.total_bytes) * 100
      : (stats.total > 0 ? (stats.uploaded / stats.total) * 100 : 0);

    sendJson(res, 200, {
      ...stats,
      progress_percent: parseFloat(progressPercent.toFixed(2)),
    });
  } catch (err) {
    sendError(res, 500, err.message);
  }
}

function handleApiFiles(req, res, url) {
  const dbKey = url.searchParams.get("db") || "uploads.db";
  const search = (url.searchParams.get("search") || "").trim();
  const status = (url.searchParams.get("status") || "all").trim().toLowerCase();
  let page = parseInt(url.searchParams.get("page") || "1", 10);
  let limit = parseInt(url.searchParams.get("limit") || "25", 10);

  if (isNaN(page) || page < 1) page = 1;
  if (isNaN(limit) || limit < 1) limit = 25;
  if (limit > 100) limit = 100;

  const db = getDbInstance(dbKey);
  if (!db) {
    return sendError(res, 404, `Database '${dbKey}' not found.`);
  }

  try {
    const whereConditions = [];
    const params = [];

    if (status && status !== "all") {
      whereConditions.push("status = ?");
      params.push(status);
    }

    if (search) {
      whereConditions.push("(relative_path LIKE ? OR s3_key LIKE ? OR file_path LIKE ?)");
      const searchPattern = `%${search}%`;
      params.push(searchPattern, searchPattern, searchPattern);
    }

    const whereClause = whereConditions.length > 0 ? `WHERE ${whereConditions.join(" AND ")}` : "";

    // Count total matching
    const countSql = `SELECT COUNT(*) AS total FROM uploads ${whereClause}`;
    const totalRow = db.prepare(countSql).get(...params);
    const total = totalRow ? totalRow.total : 0;
    const totalPages = Math.ceil(total / limit) || 1;

    const offset = (page - 1) * limit;

    // Fetch paginated records
    const dataSql = `
      SELECT
        id,
        file_path,
        relative_path,
        s3_key,
        file_size,
        status,
        retries,
        etag,
        uploaded_at,
        last_error,
        created_at
      FROM uploads
      ${whereClause}
      ORDER BY id DESC
      LIMIT ? OFFSET ?
    `;
    const files = db.prepare(dataSql).all(...params, limit, offset);

    sendJson(res, 200, {
      page,
      limit,
      total,
      totalPages,
      files,
    });
  } catch (err) {
    sendError(res, 500, err.message);
  }
}

async function handleApiMail(req, res, url) {
  const dbKey = url.searchParams.get("db") || "uploads.db";
  const id = parseInt(url.searchParams.get("id"), 10);

  if (isNaN(id)) {
    return sendError(res, 400, "Invalid or missing 'id' parameter.");
  }

  const db = getDbInstance(dbKey);
  if (!db) {
    return sendError(res, 404, `Database '${dbKey}' not found.`);
  }

  try {
    const record = db.prepare("SELECT * FROM uploads WHERE id = ?").get(id);
    if (!record) {
      return sendError(res, 404, `Record #${id} not found in database '${dbKey}'.`);
    }

    const mailData = await parseMail(record);
    sendJson(res, 200, mailData);
  } catch (err) {
    console.error(`Error parsing mail #${id} from ${dbKey}:`, err);
    sendError(res, 500, `Failed to load email: ${err.message}`);
  }
}

async function handleApiMailAttachment(req, res, url) {
  const dbKey = url.searchParams.get("db") || "uploads.db";
  const id = parseInt(url.searchParams.get("id"), 10);
  const index = parseInt(url.searchParams.get("index"), 10);

  if (isNaN(id) || isNaN(index)) {
    return sendError(res, 400, "Invalid or missing 'id' or 'index' parameter.");
  }

  const db = getDbInstance(dbKey);
  if (!db) {
    return sendError(res, 404, `Database '${dbKey}' not found.`);
  }

  try {
    const record = db.prepare("SELECT * FROM uploads WHERE id = ?").get(id);
    if (!record) {
      return sendError(res, 404, `Record #${id} not found in database '${dbKey}'.`);
    }

    const { filename, contentType, content } = await getAttachment(record, index);

    res.writeHead(200, {
      "Content-Type": contentType || "application/octet-stream",
      "Content-Disposition": `attachment; filename*=UTF-8''${encodeURIComponent(filename)}`,
      "Content-Length": content.length,
      "Access-Control-Allow-Origin": "*",
    });
    res.end(content);
  } catch (err) {
    console.error(`Error loading attachment index ${index} for mail #${id}:`, err);
    sendError(res, 500, `Failed to get attachment: ${err.message}`);
  }
}

async function handleApiMailRaw(req, res, url) {
  const dbKey = url.searchParams.get("db") || "uploads.db";
  const id = parseInt(url.searchParams.get("id"), 10);

  if (isNaN(id)) {
    return sendError(res, 400, "Invalid or missing 'id' parameter.");
  }

  const db = getDbInstance(dbKey);
  if (!db) {
    return sendError(res, 404, `Database '${dbKey}' not found.`);
  }

  try {
    const record = db.prepare("SELECT * FROM uploads WHERE id = ?").get(id);
    if (!record) {
      return sendError(res, 404, `Record #${id} not found in database '${dbKey}'.`);
    }

    const { buffer } = await fetchMailBuffer(record);
    const filename = path.basename(record.s3_key || record.relative_path || `email-${id}.eml`);

    res.writeHead(200, {
      "Content-Type": "message/rfc822",
      "Content-Disposition": `attachment; filename*=UTF-8''${encodeURIComponent(filename)}`,
      "Content-Length": buffer.length,
      "Access-Control-Allow-Origin": "*",
    });
    res.end(buffer);
  } catch (err) {
    console.error(`Error loading raw .eml for #${id}:`, err);
    sendError(res, 500, `Failed to load raw email: ${err.message}`);
  }
}

// Static file server
const MIME_TYPES = {
  ".html": "text/html; charset=utf-8",
  ".css": "text/css; charset=utf-8",
  ".js": "application/javascript; charset=utf-8",
  ".json": "application/json; charset=utf-8",
  ".svg": "image/svg+xml",
  ".ico": "image/x-icon",
  ".png": "image/png",
};

function serveStaticFile(res, reqPath) {
  let relativePath = reqPath === "/" ? "index.html" : reqPath.replace(/^\/+/, "");
  const filePath = path.join(PUBLIC_DIR, relativePath);

  // Security: prevent directory traversal outside of PUBLIC_DIR
  if (!filePath.startsWith(PUBLIC_DIR)) {
    return sendError(res, 403, "Access denied");
  }

  fs.stat(filePath, (err, stats) => {
    if (err || !stats.isFile()) {
      return sendError(res, 404, "File not found");
    }

    const ext = path.extname(filePath).toLowerCase();
    const contentType = MIME_TYPES[ext] || "application/octet-stream";

    res.writeHead(200, {
      "Content-Type": contentType,
      "Content-Length": stats.size,
      "Cache-Control": "public, max-age=300",
    });

    const stream = fs.createReadStream(filePath);
    stream.pipe(res);
  });
}

function startWebServer(port = PORT) {
  const server = http.createServer((req, res) => {
    // Handle CORS preflight
    if (req.method === "OPTIONS") {
      res.writeHead(204, {
        "Access-Control-Allow-Origin": "*",
        "Access-Control-Allow-Methods": "GET, OPTIONS",
        "Access-Control-Allow-Headers": "Content-Type",
      });
      return res.end();
    }

    if (req.method !== "GET") {
      return sendError(res, 405, "Method not allowed");
    }

    const parsedUrl = new URL(req.url, `http://${req.headers.host || "localhost"}`);
    const pathname = parsedUrl.pathname;

    if (pathname === "/api/databases") {
      return handleApiDatabases(req, res);
    } else if (pathname === "/api/stats") {
      return handleApiStats(req, res, parsedUrl);
    } else if (pathname === "/api/files") {
      return handleApiFiles(req, res, parsedUrl);
    } else if (pathname === "/api/mail") {
      return handleApiMail(req, res, parsedUrl);
    } else if (pathname === "/api/mail/attachment") {
      return handleApiMailAttachment(req, res, parsedUrl);
    } else if (pathname === "/api/mail/raw") {
      return handleApiMailRaw(req, res, parsedUrl);
    } else {
      return serveStaticFile(res, pathname);
    }
  });

  server.listen(port, () => {
    console.log("");
    console.log("============================================================");
    console.log("             MOVE-TO-S3 DATABASE WEB VIEWER                 ");
    console.log("============================================================");
    console.log(` Web Dashboard: http://localhost:${port}`);
    console.log(` Active DB    : ${ACTIVE_DB_PATH}`);
    console.log(` Completed DBs: ${COMPLETED_DIR}`);
    console.log("============================================================");
    console.log("");
  });

  return server;
}

if (require.main === module) {
  startWebServer();
}

module.exports = { startWebServer };
