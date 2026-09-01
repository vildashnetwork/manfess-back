// Self-test for the bidirectional sync engine (db/syncService.js).
// Runs ENTIRELY against two throwaway LOCAL databases
// (MANFESS_SYNC_A = active side, MANFESS_SYNC_B = mirror side),
// so production data is never touched.
// Usage: node scripts/sync-selftest.mjs
import mongoose from "mongoose";
import Student from "../models/Students.js";
import { runSync, SYNC_MODELS } from "../db/syncService.js";

const ACTIVE_URI = 'mongodb://127.0.0.1:27017/MANFESS_SYNC_A';
const OTHER_URI = 'mongodb://127.0.0.1:27017/MANFESS_SYNC_B';

const results = [];
const check = (name, cond) => {
    results.push({ name, ok: !!cond });
    console.log(`${cond ? 'PASS' : 'FAIL'} - ${name}`);
};

const run = async () => {
    // active side = default connection (where the models live), other = mirror
    await mongoose.connect(ACTIVE_URI, { serverSelectionTimeoutMS: 5000 });
    const otherConn = await mongoose.createConnection(OTHER_URI, { serverSelectionTimeoutMS: 5000 }).asPromise();

    // clean both databases
    for (const { collection } of SYNC_MODELS) {
        await mongoose.connection.db.collection(collection).deleteMany({});
        await otherConn.db.collection(collection).deleteMany({});
    }
    await mongoose.connection.db.collection('sync_states').deleteMany({});
    await mongoose.connection.db.collection('sync_deletions').deleteMany({});
    await otherConn.db.collection('sync_deletions').deleteMany({});

    // 1) create on the active side -> sync -> exists on the mirror
    const student = await Student.create({
        fullName: 'SYNC TEST STUDENT',
        dob: '2010-01-01',
        classId: 'class-a',
        department: 'Science',
        parentName: 'Test Parent',
        parentPhone: '0000000000',
        address: 'Test Address',
        registrationDate: '2024-09-01',
        feesPaid: 100,
        feesDue: 200
    });
    await runSync(mongoose.connection, otherConn);
    const copied = await otherConn.db.collection('students').findOne({ _id: student._id });
    check('push: created doc reached the mirror side', copied && copied.fullName === 'SYNC TEST STUDENT');

    // 2) newer update on the mirror -> sync -> active side gets it
    // (raw update, so we set updatedAt ourselves; "now" is naturally newer
    //  than the creation timestamp from step 1)
    await otherConn.db.collection('students').updateOne(
        { _id: student._id },
        { $set: { fullName: 'UPDATED ON OTHER SIDE', updatedAt: new Date() } }
    );
    await runSync(mongoose.connection, otherConn);
    const pulledBack = await Student.findById(student._id).lean();
    check('pull: newer mirror update won (last-write-wins)', pulledBack && pulledBack.fullName === 'UPDATED ON OTHER SIDE');

    // 3) a stale write on the active side must NOT overwrite the newer mirror version
    await Student.updateOne(
        { _id: student._id },
        { $set: { fullName: 'STALE LOCAL WRITE', updatedAt: new Date(Date.now() - 1000) } },
        { timestamps: false }
    );
    await runSync(mongoose.connection, otherConn);
    const afterLww = await otherConn.db.collection('students').findOne({ _id: student._id });
    check('LWW: stale write did not overwrite the newer version', afterLww && afterLww.fullName === 'UPDATED ON OTHER SIDE');

    // 4) delete on the active side -> tombstone -> sync -> deleted on the mirror
    await Student.findByIdAndDelete(student._id);
    const tombs = await mongoose.connection.db.collection('sync_deletions').find({ model: 'Student' }).toArray();
    check('tombstone recorded for findByIdAndDelete', tombs.length === 1);
    await runSync(mongoose.connection, otherConn);
    const goneOnOther = await otherConn.db.collection('students').findOne({ _id: student._id });
    const tombsAfter = await mongoose.connection.db.collection('sync_deletions').find({ model: 'Student' }).toArray();
    check('delete propagated to the mirror side', !goneOnOther);
    check('tombstone cleared after sync', tombsAfter.length === 0);

    // 5) delete on the mirror side -> sync -> deleted on the active side
    const s2 = await Student.create({
        fullName: 'SYNC TEST STUDENT 2',
        dob: '2011-01-01',
        classId: 'class-b',
        department: 'Arts',
        parentName: 'Test Parent 2',
        parentPhone: '1111111111',
        address: 'Test Address 2',
        registrationDate: '2024-09-02',
        feesPaid: 10,
        feesDue: 20
    });
    await runSync(mongoose.connection, otherConn); // push it to the mirror first
    await otherConn.db.collection('students').deleteOne({ _id: s2._id });
    await otherConn.db.collection('sync_deletions').insertOne({
        model: 'Student',
        docId: s2._id,
        deletedAt: new Date()
    });
    await runSync(mongoose.connection, otherConn);
    const goneOnActive = await Student.findById(s2._id).lean();
    check('mirror-side delete propagated back to the active side', !goneOnActive);

    await otherConn.close();
    await mongoose.disconnect();

    const failed = results.filter((r) => !r.ok);
    console.log(`\n${results.length - failed.length}/${results.length} checks passed`);
    process.exit(failed.length ? 1 : 0);
};

run().catch((err) => {
    console.error('self-test crashed:', err);
    process.exit(1);
});