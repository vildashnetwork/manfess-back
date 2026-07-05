import mongoose from "mongoose"

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

const Mark = mongoose.model("Mark", MarkSchema);

export default Mark