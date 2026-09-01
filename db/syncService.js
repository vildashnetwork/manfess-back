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
import Subject from "../models/Subject.js";
import TeacherAttendance from "../models/TeacherAttendance.js";
import TeacherSalary from "../models/TeacherSalary.js";
import Timetable from "../models/Timetable.js";
import User from "../models/User.js";
import { TOMBSTONE_COLLECTION } from "./syncPlugin.js";

export const STATE_COLLECTION = 'sync_states';
const OVERLAP_MS = 2000; // re-check window so boundary updates are never missed
const BATCH_SIZE = 500;  // documents per bulk write

// All collections that participate in the sync
export const SYNC_MODELS = [
    Mark, SchoolClass, Student, Subject, TeacherAttendance, TeacherSalary, Timetable, User
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

// Read the documents changed since `since` (everything when null = first sync)
const readChanged = (col, since) => {
    const filter = since ? { updatedAt: { $gt: new Date(since.getTime() - OVERLAP_MS) } } : {};
    return col.find(filter).toArray();
};

// Replay tombstones recorded on `fromConn` against `toConn`
const applyDeletions = async (fromConn, toConn, collection, modelName) => {
    const tombCol = fromConn.db.collection(TOMBSTONE_COLLECTION);
    const tombstones = await tombCol.find({ model: modelName }).toArray();
    if (!tombstones.length) return 0;

    const targetCol = toConn.db.collection(collection);
    let applied = 0;
    for (const tomb of tombstones) {
        const existing = await targetCol.findOne({ _id: tomb.docId }, { projection: { updatedAt: 1 } });
        if (existing && getTime(existing.updatedAt) > getTime(tomb.deletedAt)) {
            // The target version is newer than the delete -> keep it and drop
            // the tombstone (the newer version is pulled back to the source).
            await tombCol.deleteOne({ _id: tomb._id });
            continue;
        }
        await targetCol.deleteOne({ _id: tomb.docId });
        await tombCol.deleteOne({ _id: tomb._id });
        applied += 1;
    }
    return applied;
};

// Sync one collection between the active connection and the other side
const syncOneCollection = async (activeConn, otherConn, { name, collection }, syncStart) => {
    const activeCol = activeConn.db.collection(collection);
    const otherCol = otherConn.db.collection(collection);
    const stateCol = activeConn.db.collection(STATE_COLLECTION);

    const state = await stateCol.findOne({ _id: collection });
    const since = state && state.lastSyncAt ? new Date(state.lastSyncAt) : null;

    const result = { collection, model: name, pushed: 0, pulled: 0, deletionsApplied: 0 };

    // 1) deletions recorded on the other side -> apply here
    result.deletionsApplied += await applyDeletions(otherConn, activeConn, collection, name);
    // 2) deletions recorded here -> apply on the other side
    result.deletionsApplied += await applyDeletions(activeConn, otherConn, collection, name);

    // 3) push changes made on this side
    result.pushed = await upsertDocs(otherCol, await readChanged(activeCol, since));

    // 4) pull changes made on the other side
    result.pulled = await upsertDocs(activeCol, await readChanged(otherCol, since));

    // 5) remember progress (only saved for collections that completed)
    await stateCol.updateOne(
        { _id: collection },
        { $set: { model: name, lastSyncAt: syncStart, lastSyncFinishedAt: new Date() } },
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
