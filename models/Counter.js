import mongoose from "mongoose";

// Atomic sequence counters (currently used for student matricules).
// One document per counter key, e.g. { key: "matricule:MFS-2025", seq: 42 }.
// NOTE: this collection is intentionally NOT part of the offline/online sync:
// every database keeps its own counter and matriculeService.js repairs a
// counter that falls behind an already existing matricule.
const counterSchema = new mongoose.Schema({
    key: {
        type: String,
        required: true,
        unique: true,
        trim: true
    },
    section: {
        type: String,
        enum: ["englophone"],
        default: "englophone",
        trim: true
    },
    seq: {
        type: Number,
        required: true,
        default: 0,
        min: [0, "Counter cannot be negative"]
    },
    description: {
        type: String,
        trim: true
    }
}, { timestamps: true });

counterSchema.index({ section: 1, key: 1 }, { unique: true });

/**
 * Atomically reserve the next value of a counter.
 * @param {string} key counter key
 * @param {number} [by] step (default 1)
 * @returns {Promise<number>} the reserved value
 */
counterSchema.statics.next = async function (key, by = 1) {
    const doc = await this.findOneAndUpdate(
        { key },
        { $inc: { seq: by } },
        { new: true, upsert: true, setDefaultsOnInsert: true }
    );
    return doc.seq;
};

/**
 * Make sure the counter is at least `value` (used to repair a counter that
 * is behind the highest matricule already stored in the database).
 * @param {string} key counter key
 * @param {number} value minimum value
 */
counterSchema.statics.atLeast = async function (key, value) {
    await this.updateOne(
        { key, seq: { $lt: value } },
        { $set: { seq: value } },
        { upsert: true }
    );
    return value;
};

const Counter = mongoose.model("Counter", counterSchema);

export default Counter;
