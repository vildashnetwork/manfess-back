import mongoose from "mongoose"

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
        required: true
    },
    teacherIds: {
        type: [String],
        required: true
    }
}, { timestamps: true })

const Subject = mongoose.model("Subject", SubjectSchema)

export default Subject