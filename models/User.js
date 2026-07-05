import mongoose from "mongoose"

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
    acedemicYear: {
        type: String,
        required: true
    }

}, { timestamps: true });

const User = mongoose.model("User", userschema);

export default User;