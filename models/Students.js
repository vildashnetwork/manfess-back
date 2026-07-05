import mongoose from "mongoose"

const studentschema = new mongoose.Schema({
    fullName: {
        type: String,
        required: true
    },
    gender: {
        type: String,
        enum: ["male", "female"],

    },
    dob: {
        type: String,
        required: true
    },
    classId: {
        type: String,
        required: true
    },
    department: {
        type: String,
        required: true
    },
    parentName: {
        type: String,
        required: true
    },
    parentPhone: {
        type: String,
        required: true
    },
    address: {
        type: String,
        required: true
    },
    photoUrl: {
        type: String,
        default: ""
    },
    registrationDate: {
        type: String,
        required: true
    },
    feesPaid: {
        type: Number,
        required: true
    },
    feesDue: {
        type: Number,
        required: true
    }

}, { timestamps: true })

const Student = mongoose.model("Student", studentschema)

export default Student;