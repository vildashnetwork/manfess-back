// Records every deletion as a "tombstone" document in the sync_deletions
// collection of the ACTIVE database, so the offline/online sync service
// (db/syncService.js) can propagate deletions between the local and the
// online database. Applied to every model schema (see models/*.js).
export const TOMBSTONE_COLLECTION = 'sync_deletions';

const recordDeletions = async (model, ids) => {
    const cleanIds = (ids || []).filter(Boolean);
    if (!cleanIds.length) return;
    try {
        const col = model.db.collection(TOMBSTONE_COLLECTION);
        const ops = cleanIds.map((docId) => ({
            updateOne: {
                filter: { model: model.modelName, docId },
                update: { $set: { model: model.modelName, docId, deletedAt: new Date() } },
                upsert: true
            }
        }));
        await col.bulkWrite(ops, { ordered: false });
    } catch (err) {
        // Never fail the actual delete because a tombstone could not be written
        console.error(`⚠️ Sync: failed to record deletion for ${model.modelName}:`, err.message);
    }
};

export const syncTombstonePlugin = (schema) => {
    // Model.findByIdAndDelete() / Model.findOneAndDelete()
    schema.pre('findOneAndDelete', async function () {
        const doc = await this.model.findOne(this.getFilter()).select('_id').lean();
        if (doc) await recordDeletions(this.model, [doc._id]);
    });

    // Legacy alias findOneAndRemove()
    schema.pre('findOneAndRemove', async function () {
        const doc = await this.model.findOne(this.getFilter()).select('_id').lean();
        if (doc) await recordDeletions(this.model, [doc._id]);
    });

    // Model.deleteOne(filter)
    schema.pre('deleteOne', { document: false, query: true }, async function () {
        const doc = await this.model.findOne(this.getFilter()).select('_id').lean();
        if (doc) await recordDeletions(this.model, [doc._id]);
    });

    // document.deleteOne()
    schema.pre('deleteOne', { document: true, query: false }, async function () {
        await recordDeletions(this.constructor, [this._id]);
    });

    // Model.deleteMany(filter)
    schema.pre('deleteMany', { document: false, query: true }, async function () {
        const docs = await this.model.find(this.getFilter()).select('_id').lean();
        if (docs.length) await recordDeletions(this.model, docs.map((d) => d._id));
    });
};