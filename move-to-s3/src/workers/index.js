const {
    uploadWorker,
    stopWorkers,
} = require("./uploadWorker");

const {
    startDashboard,
} = require("../progress/dashboard");


let dashboardTimer = null;

let shutdownRequested = false;


// =====================================================
// START WORKERS
// =====================================================

async function startWorkers(workerCount) {

    console.log(
        `Starting ${workerCount} workers...`
    );


    // =============================================
    // DASHBOARD
    // =============================================

    dashboardTimer =
        startDashboard(
            workerCount
        );


    // =============================================
    // CREATE WORKERS
    // =============================================

    const workers = [];


    for (
        let i = 1;
        i <= workerCount;
        i++
    ) {

        workers.push(
            uploadWorker(i)
        );

    }


    // =============================================
    // WAIT
    // =============================================

    await Promise.all(
        workers
    );


    // =============================================
    // STOP DASHBOARD
    // =============================================

    if (dashboardTimer) {

        clearInterval(
            dashboardTimer
        );

        dashboardTimer = null;

    }


    console.log("");

    console.log(
        "All workers stopped."
    );

}


// =====================================================
// GRACEFUL SHUTDOWN
// =====================================================

async function shutdown() {

    if (shutdownRequested) {

        return;

    }


    shutdownRequested = true;


    console.log("");

    console.log(
        "========================================"
    );

    console.log(
        "Shutdown requested..."
    );

    console.log(
        "Finishing active uploads..."
    );

    console.log(
        "========================================"
    );


    stopWorkers();

}


module.exports = {

    startWorkers,

    shutdown,

};