import mongoose from "mongoose"
import { syncTombstonePlugin } from "../db/syncPlugin.js";

const userschema = new mongoose.Schema({
    name: {
        type: String,
        required: true
    },
    username: {
        type: String,
        required: true,
        unique: true
    },
    phone: {
        type: String,
        required: true,
        unique: true
    },
    role: {
        type: String,
        enum: ["teacher", "admin", "bursar"]
    },
    isActive: {
        type: Boolean,
        default: true
    },
    qualification: {
        type: String,
        default: ""
    },
    subjectIds: {
        type: [String],
        default: []
    },
    classIds: {
        type: [String],
        default: []
    },
    section: {
        type: String,
        enum: ["englophone"],
        default: "englophone",
        required: true,
        trim: true
    },
    isPermanent: {
        type: Boolean,
        default: false
    },
    monthlySalary: {
        type: Number,
        min: [0, "Monthly salary cannot be negative"],
        default: 0
    },
    availableDays: {
        type: [String],
        default: []
    },
    acedemicYear: {
        type: String,
        required: true
    }

}, { timestamps: true });

// Record deletions for the offline/online sync
userschema.plugin(syncTombstonePlugin);

userschema.index({ section: 1 });

const User = mongoose.model("User", userschema);

export default User;