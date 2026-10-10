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
 *
 * Retries on a transient duplicate-key error: when two requests create the
 * same counter at the same instant, MongoDB lets one upsert win and rejects
 * the other with E11000. Retrying re-runs the $inc on the now-existing doc.
 * @param {string} key counter key
 * @param {number} [by] step (default 1)
 * @returns {Promise<number>} the reserved value
 */
counterSchema.statics.next = async function (key, by = 1) {
    for (let attempt = 0; attempt < 8; attempt += 1) {
        try {
            // eslint-disable-next-line no-await-in-loop
            const doc = await this.findOneAndUpdate(
                { key },
                { $inc: { seq: by } },
                { new: true, upsert: true, setDefaultsOnInsert: true }
            );
            return doc.seq;
        } catch (err) {
            if (err && err.code === 11000 && attempt < 7) continue;
            throw err;
        }
    }
    // Unreachable: the loop either returns or rethrows.
    throw new Error(`Counter.next failed for key ${key}`);
};

/**
 * Make sure the counter is at least `value` (used to repair a counter that
 * is behind the highest matricule already stored in the database).
 *
 * The filter matches on `key` alone and uses `$max`, so:
 *   - an existing counter is raised in place (never lowered, never re-inserted),
 *   - a missing counter is created with `seq = value`.
 * The previous implementation filtered on `{ key, seq: { $lt: value } }` with an
 * upsert: when the counter was already ahead (the common case) the filter
 * matched nothing, MongoDB tried to INSERT a second document with the same
 * unique `key`, and threw E11000 -> surfaced to the user as an HTTP 500 when
 * registering a student. Matching on `key` only removes that failure mode.
 * @param {string} key counter key
 * @param {number} value minimum value
 */
counterSchema.statics.atLeast = async function (key, value) {
    await this.updateOne(
        { key },
        { $max: { seq: value } },
        { upsert: true }
    );
    return value;
};

const Counter = mongoose.model("Counter", counterSchema);

export default Counter;
