// Bidirectional offline <-> online data sync engine.
// - Works on raw MongoDB collections (bypasses Mongoose) so the documents'
//   createdAt/updatedAt values are copied exactly (no timestamp rewrites).
// - Last-write-wins conflict resolution based on the `updatedAt` field.
// - Deletions are propagated using tombstones recorded by db/syncPlugin.js.
// - Per-collection progress is stored in the sync_states collection of the
//   active (online) database, so an interrupted sync resumes where it stopped.
import Mark from "../models/Mark.js";
import SchoolClass from "../models/SchoolClass.js";
import Student from "../models/Students.js";
import StudentAttendance from "../models/StudentAttendance.js";
import Subject from "../models/Subject.js";
import TeacherAttendance from "../models/TeacherAttendance.js";
import TeacherSalary from "../models/TeacherSalary.js";
import Timetable from "../models/Timetable.js";
import User from "../models/User.js";
// NOTE: TOMBSTONE_COLLECTION import removed — deletion propagation is disabled
// (see applyDeletions below); sync only copies creates/updates now.

export const STATE_COLLECTION = 'sync_states';
const OVERLAP_MS = 2000; // re-check window so boundary updates are never missed
const BATCH_SIZE = 500;  // documents per bulk write

// All collections that participate in the sync
export const SYNC_MODELS = [
    Mark, SchoolClass, Student, StudentAttendance, Subject, TeacherAttendance, TeacherSalary, Timetable, User
].map((model) => ({ name: model.modelName, collection: model.collection.name }));

const getTime = (value) => (value ? new Date(value).getTime() : 0);

// Copy documents into a target collection with last-write-wins protection
const upsertDocs = async (targetCol, docs) => {
    let written = 0;
    for (let i = 0; i < docs.length; i += BATCH_SIZE) {
        const batch = docs.slice(i, i + BATCH_SIZE);
        const ids = batch.map((d) => d._id);
        const existing = await targetCol.find({ _id: { $in: ids } }, { projection: { updatedAt: 1 } }).toArray();
        const times = new Map(existing.map((d) => [String(d._id), getTime(d.updatedAt)]));

        const ops = [];
        for (const doc of batch) {
            const docTime = getTime(doc.updatedAt);
            const existingTime = times.get(String(doc._id));
            // Skip when the target already has an equal or newer version
            if (existingTime !== undefined && existingTime >= docTime) continue;
            ops.push({ replaceOne: { filter: { _id: doc._id }, replacement: doc, upsert: true } });
        }
        if (ops.length) {
            await targetCol.bulkWrite(ops, { ordered: false });
            written += ops.length;
        }
    }
    return written;
};

// Stream changed documents in bounded batches so a first sync of large
// collections does not load the whole collection into server memory.
const syncChangedDocs = async (sourceCol, targetCol, since) => {
    const filter = since ? { updatedAt: { $gt: new Date(since.getTime() - OVERLAP_MS) } } : {};
    const cursor = sourceCol.find(filter).batchSize(BATCH_SIZE);
    let batch = [];
    let written = 0;

    try {
        for await (const doc of cursor) {
            batch.push(doc);
            if (batch.length >= BATCH_SIZE) {
                written += await upsertDocs(targetCol, batch);
                batch = [];
            }
        }
        if (batch.length) written += await upsertDocs(targetCol, batch);
    } finally {
        await cursor.close().catch(() => { });
    }

    return written;
};

// Replay tombstones recorded on `fromConn` against `toConn`
// DELETION PROPAGATION DISABLED (2026-10-07): the offline/online sync used to
// replay every recorded deletion onto the mirror database, so a single delete
// (or a stale tombstone) could wipe the same collection on the other side on
// every automatic switch. Deletions are now local-only; this function is kept
// as a no-op so existing call sites keep working.
const applyDeletions = async (/* fromConn, toConn, collection, modelName */) => {
    return 0;
};

// Sync one collection between the active connection and the other side
const syncOneCollection = async (activeConn, otherConn, { name, collection }, syncStart) => {
    const activeCol = activeConn.db.collection(collection);
    const otherCol = otherConn.db.collection(collection);
    const stateCol = activeConn.db.collection(STATE_COLLECTION);
    const stateId = `${otherConn.name}:${collection}`;

    const state = await stateCol.findOne({ _id: stateId });
    const since = state && state.lastSyncAt ? new Date(state.lastSyncAt) : null;

    const result = { collection, model: name, pushed: 0, pulled: 0, deletionsApplied: 0 };

    // 1) deletions recorded on the other side -> apply here
    result.deletionsApplied += await applyDeletions(otherConn, activeConn, collection, name);
    // 2) deletions recorded here -> apply on the other side
    result.deletionsApplied += await applyDeletions(activeConn, otherConn, collection, name);

    // 3) push changes made on this side
    result.pushed = await syncChangedDocs(activeCol, otherCol, since);

    // 4) pull changes made on the other side
    result.pulled = await syncChangedDocs(otherCol, activeCol, since);

    // 5) remember progress (only saved for collections that completed)
    await stateCol.updateOne(
        { _id: stateId },
        { $set: { model: name, collection, mirrorDatabase: otherConn.name, lastSyncAt: syncStart, lastSyncFinishedAt: new Date() } },
        { upsert: true }
    );

    return result;
};

// Full bidirectional sync. activeConn = the database the app is currently
// using, otherConn = the mirror database.
export const runSync = async (activeConn, otherConn) => {
    const syncStart = new Date();
    const startedAt = Date.now();
    const results = [];
    for (const entry of SYNC_MODELS) {
        const r = await syncOneCollection(activeConn, otherConn, entry, syncStart);
        console.log(`🔄 Sync [${entry.name}]: pushed ${r.pushed}, pulled ${r.pulled}, deletions ${r.deletionsApplied}`);
        results.push(r);
    }
    return {
        startedAt: syncStart.toISOString(),
        durationMs: Date.now() - startedAt,
        collections: results
    };
};
