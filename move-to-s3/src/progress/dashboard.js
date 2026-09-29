const { getStats } = require("../database");

let startTime = Date.now();

let lastUploadedBytes = 0;
let lastTime = Date.now();


function formatBytes(bytes) {

    if (!bytes || bytes <= 0) {
        return "0 B";
    }

    const units = [
        "B",
        "KB",
        "MB",
        "GB",
        "TB",
    ];

    let index = 0;
    let value = bytes;

    while (
        value >= 1024 &&
        index < units.length - 1
    ) {
        value /= 1024;
        index++;
    }

    return `${value.toFixed(2)} ${units[index]}`;
}


function formatDuration(seconds) {

    if (
        !Number.isFinite(seconds) ||
        seconds < 0
    ) {
        return "--";
    }

    const hours =
        Math.floor(seconds / 3600);

    const minutes =
        Math.floor(
            (seconds % 3600) / 60
        );

    const secs =
        Math.floor(seconds % 60);


    if (hours > 0) {
        return `${hours}h ${minutes}m ${secs}s`;
    }

    if (minutes > 0) {
        return `${minutes}m ${secs}s`;
    }

    return `${secs}s`;
}


function clearScreen() {

    process.stdout.write("\x1b[2J");
    process.stdout.write("\x1b[0f");
}


function renderDashboard(workerCount) {

    const stats = getStats.get();


    const total =
        Number(stats.total || 0);

    const uploaded =
        Number(stats.uploaded || 0);

    const pending =
        Number(stats.pending || 0);

    const uploading =
        Number(stats.uploading || 0);

    const failed =
        Number(stats.failed || 0);


    const totalBytes =
        Number(stats.total_bytes || 0);

    const uploadedBytes =
        Number(stats.uploaded_bytes || 0);


    // =========================================
    // Progress
    // =========================================

    const progress =
        totalBytes > 0
            ? (
                uploadedBytes /
                totalBytes
            ) * 100
            : 0;


    // =========================================
    // Speed
    // =========================================

    const now = Date.now();

    const elapsedSeconds =
        (now - lastTime) / 1000;


    const bytesSinceLast =
        uploadedBytes -
        lastUploadedBytes;


    let bytesPerSecond = 0;


    if (elapsedSeconds > 0) {

        bytesPerSecond =
            bytesSinceLast /
            elapsedSeconds;
    }


    lastUploadedBytes =
        uploadedBytes;

    lastTime = now;


    // =========================================
    // ETA
    // =========================================

    const remainingBytes =
        totalBytes -
        uploadedBytes;


    let eta = "--";


    if (bytesPerSecond > 0) {

        eta = formatDuration(
            remainingBytes /
            bytesPerSecond
        );
    }


    // =========================================
    // Runtime
    // =========================================

    const runtime =
        formatDuration(
            (now - startTime) / 1000
        );


    // =========================================
    // Render
    // =========================================

    clearScreen();


    console.log(
        "============================================================"
    );

    console.log(
        "                 BFC MAIL S3 MIGRATION"
    );

    console.log(
        "============================================================"
    );

    console.log("");


    console.log(
        `Total Files : ${total.toLocaleString()}`
    );

    console.log(
        `Total Size  : ${formatBytes(totalBytes)}`
    );

    console.log("");


    console.log(
        `Uploaded    : ${uploaded.toLocaleString()}`
    );

    console.log(
        `Uploaded    : ${formatBytes(uploadedBytes)}`
    );

    console.log("");


    console.log(
        `Pending     : ${pending.toLocaleString()}`
    );

    console.log(
        `Uploading   : ${uploading.toLocaleString()}`
    );

    console.log(
        `Failed      : ${failed.toLocaleString()}`
    );

    console.log("");


    console.log(
        `Progress    : ${progress.toFixed(2)}%`
    );

    console.log(
        `Speed       : ${formatBytes(bytesPerSecond)}/s`
    );

    console.log(
        `ETA         : ${eta}`
    );

    console.log(
        `Workers     : ${workerCount}`
    );

    console.log(
        `Runtime     : ${runtime}`
    );


    console.log("");

    console.log(
        "============================================================"
    );
}


function startDashboard(workerCount) {

    startTime = Date.now();

    const stats =
        getStats.get();


    lastUploadedBytes =
        Number(
            stats.uploaded_bytes || 0
        );


    lastTime =
        Date.now();


    renderDashboard(workerCount);


    const timer =
        setInterval(() => {

            renderDashboard(
                workerCount
            );

        }, 1000);


    return timer;
}


module.exports = {
    startDashboard,
};