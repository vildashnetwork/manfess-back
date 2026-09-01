// End-to-end test of dbManager switching: boot ONLINE (simulated with a local
// database), switch OFFLINE, write data, switch ONLINE again and verify that
// the offline data synced up. Uses only throwaway local databases
// (MANFESS_SIM_ONLINE / MANFESS_SIM_OFFLINE) - production is never touched.
// Usage: node scripts/switch-selftest.mjs
process.env.MONGOURI = 'mongodb://127.0.0.1:27017/MANFESS_SIM_ONLINE';
process.env.MONGOURIOFFLINE = 'mongodb://127.0.0.1:27017/MANFESS_SIM_OFFLINE';

const mongoose = (await import('mongoose')).default;
const { dbManager } = await import('../db/dbManager.js');
const Student = (await import('../models/Students.js')).default;

const ONLINE_URI = 'mongodb://127.0.0.1:27017/MANFESS_SIM_ONLINE';
const OFFLINE_URI = 'mongodb://127.0.0.1:27017/MANFESS_SIM_OFFLINE';

const results = [];
const check = (name, cond) => {
    results.push({ name, ok: !!cond });
    console.log(`${cond ? 'PASS' : 'FAIL'} - ${name}`);
};

const cleanDb = async (uri) => {
    const conn = await mongoose.createConnection(uri, { serverSelectionTimeoutMS: 5000 }).asPromise();
    for (const c of ['students', 'sync_states', 'sync_deletions']) {
        await conn.db.collection(c).deleteMany({});
    }
    await conn.close();
};

const run = async () => {
    await cleanDb(ONLINE_URI);
    await cleanDb(OFFLINE_URI);

    // 1) boot online
    const status = await dbManager.init();
    check('init: mode is online', status.mode === 'online');

    // 2) create a document while online (models must be bound to the active db)
    const s = await Student.create({
        fullName: 'SWITCH TEST',
        dob: '2012-01-01',
        classId: 'c1',
        department: 'Science',
        parentName: 'P',
        parentPhone: '0',
        address: 'A',
        registrationDate: '2024-09-01',
        feesPaid: 1,
        feesDue: 2
    });
    check('create while online works', !!s._id);

    // 3) switch offline
    await dbManager.switchToOffline();
    check('switchToOffline: mode is offline', dbManager.getStatus().mode === 'offline');

    // 4) write while offline
    const s2 = await Student.create({
        fullName: 'OFFLINE WRITE',
        dob: '2013-01-01',
        classId: 'c2',
        department: 'Arts',
        parentName: 'P2',
        parentPhone: '1',
        address: 'A2',
        registrationDate: '2024-09-02',
        feesPaid: 3,
        feesDue: 4
    });
    check('create while offline works', !!s2._id);

    // 5) switch back online -> the offline write must sync up
    await dbManager.switchToOnline();
    check('switchToOnline: mode is online', dbManager.getStatus().mode === 'online');

    const onlineConn = await mongoose.createConnection(ONLINE_URI, { serverSelectionTimeoutMS: 5000 }).asPromise();
    const syncedDoc = await onlineConn.db.collection('students').findOne({ _id: s2._id });
    check('offline write synced up to the online database', !!syncedDoc);
    const originalDoc = await onlineConn.db.collection('students').findOne({ _id: s._id });
    check('online doc still present after round trip', !!originalDoc);
    await onlineConn.close();

    // 6) models are rebound to the online database after switching
    const count = await Student.countDocuments({});
    check('models rebound to the online database (2 docs visible)', count === 2);

    dbManager.stopMonitor();
    await mongoose.disconnect();

    const failed = results.filter((r) => !r.ok);
    console.log(`\n${results.length - failed.length}/${results.length} checks passed`);
    process.exit(failed.length ? 1 : 0);
};

run().catch((err) => {
    console.error('self-test crashed:', err);
    process.exit(1);
});