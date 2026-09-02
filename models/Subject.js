import mongoose from "mongoose"
import { syncTombstonePlugin } from "../db/syncPlugin.js";

const SubjectSchema = new mongoose.Schema({
    name: {
        type: String,
        required: true
    },
    code: {
        type: String,
        required: true
    },
    coefficient: {
        type: Number,
        required: true
    },
    cycle: {
        type: String,
        required: true
    },
    classIds: {
        type: [String],
        default: []
    },
    teacherIds: {
        type: [String],
        default: []
    },
    periodsPerWeek: {
        type: Number,
        min: [1, "Periods per week must be at least 1"],
        max: [20, "Periods per week cannot exceed 20"],
        default: 4
    }
}, { timestamps: true })

// Record deletions for the offline/online sync
SubjectSchema.plugin(syncTombstonePlugin);

const Subject = mongoose.model("Subject", SubjectSchema)

export default Subject