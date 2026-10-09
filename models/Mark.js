import mongoose from "mongoose"
import { syncTombstonePlugin } from "../db/syncPlugin.js";

const MarkSchema = new mongoose.Schema({
    studentId: {
        type: String,
        required: true
    },
    subjectId: {
        type: String,
        required: true
    },
    classId: {
        type: String,
        required: true
    },
    section: {
        type: String,
        enum: ["englophone"],
        default: "englophone",
        trim: true
    },
    sequence: {
        type: String,
        enum: ["1st seq", "2nd seq", "3rd seq", "4th seq", "5th seq", "6th seq"],
        required: true
    },
    academicyear: {
        type: String,
        required: true
    },
    score: {
        type: Number,
        required: true
    },
    recordedBy: {
        type: String,
        required: true
    }
}, { timestamps: true });

// Record deletions for the offline/online sync
MarkSchema.plugin(syncTombstonePlugin);

MarkSchema.index({ classId: 1, academicyear: 1, sequence: 1 });
MarkSchema.index({ studentId: 1, academicyear: 1 });
MarkSchema.index({ section: 1 });

const Mark = mongoose.model("Mark", MarkSchema);

export default Mark