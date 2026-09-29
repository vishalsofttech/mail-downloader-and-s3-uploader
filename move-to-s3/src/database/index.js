const Database = require("better-sqlite3");
const path = require("path");

const db = new Database(path.join(process.cwd(), "uploads.db"));

// =====================================================
// CREATE TABLE
// =====================================================

db.exec(`
CREATE TABLE IF NOT EXISTS uploads (

    id INTEGER PRIMARY KEY AUTOINCREMENT,

    file_path TEXT UNIQUE,

    relative_path TEXT,

    s3_key TEXT,

    file_size INTEGER,

    status TEXT DEFAULT 'pending',

    retries INTEGER DEFAULT 0,

    etag TEXT,

    uploaded_at TEXT,

    last_error TEXT,

    created_at TEXT

);
`);

// =====================================================
// RESET INTERRUPTED UPLOADS
// =====================================================

db.exec(`
UPDATE uploads

SET status = 'pending'

WHERE status = 'uploading';
`);

// =====================================================
// ADD FILE
// =====================================================

const addFile = db.prepare(`
INSERT OR IGNORE INTO uploads (

    file_path,
    relative_path,
    s3_key,
    file_size,
    created_at

)

VALUES (

    @file_path,
    @relative_path,
    @s3_key,
    @file_size,
    @created_at

)
`);

// =====================================================
// GET NEXT PENDING FILE
// =====================================================

const claimNextFile = db.transaction(() => {

    const file = db.prepare(`
        SELECT *
        FROM uploads
        WHERE status = 'pending'
        ORDER BY id
        LIMIT 1
    `).get();

    if (!file) {
        return null;
    }

    db.prepare(`
        UPDATE uploads
        SET status = 'uploading'
        WHERE id = ?
    `).run(file.id);

    return file;
});

// =====================================================
// MARK FILE AS UPLOADING
// =====================================================

const markUploading = db.prepare(`
UPDATE uploads

SET status = 'uploading'

WHERE id = ?
`);

// =====================================================
// MARK FILE AS UPLOADED
// =====================================================

const markUploaded = db.prepare(`
UPDATE uploads

SET

    status = 'uploaded',

    etag = ?,

    uploaded_at = ?,

    last_error = NULL

WHERE id = ?
`);


// =====================================================
// RETRY 
// =====================================================


const retryFile = db.prepare(`
UPDATE uploads
SET
    status = 'pending',
    last_error = ?,
    retries = retries + 1
WHERE id = ?
`);

// =====================================================
// MARK FILE AS FAILED
// =====================================================

const markFailed = db.prepare(`
UPDATE uploads
SET
    status = 'failed',
    last_error = ?,
    retries = retries + 1
WHERE id = ?
`);

// =====================================================
// GET STATISTICS
// =====================================================

const getStats = db.prepare(`
SELECT

    COUNT(*) AS total,

    COALESCE(SUM(file_size), 0) AS total_bytes,

    COALESCE(
        SUM(
            CASE
                WHEN status = 'pending'
                THEN 1
                ELSE 0
            END
        ),
        0
    ) AS pending,

    COALESCE(
        SUM(
            CASE
                WHEN status = 'uploading'
                THEN 1
                ELSE 0
            END
        ),
        0
    ) AS uploading,

    COALESCE(
        SUM(
            CASE
                WHEN status = 'uploaded'
                THEN 1
                ELSE 0
            END
        ),
        0
    ) AS uploaded,

    COALESCE(
        SUM(
            CASE
                WHEN status = 'uploaded'
                THEN file_size
                ELSE 0
            END
        ),
        0
    ) AS uploaded_bytes,

    COALESCE(
        SUM(
            CASE
                WHEN status = 'failed'
                THEN 1
                ELSE 0
            END
        ),
        0
    ) AS failed

FROM uploads
`);

module.exports = {
  db,
  addFile,
  claimNextFile,
  markUploading,
  markUploaded,
  retryFile,
  markFailed,
  getStats,
};


