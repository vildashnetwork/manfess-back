import mongoose from "mongoose";

const schoolClassSchema = new mongoose.Schema({
    className: {
        type: String,
        enum: ["Form 1", "Form 2", "Form 3", "Form 4", "Form 5", "Lower 6th", "Upper 6th", "Graduated"],
        required: true
    },
    department: {
        type: String,
        required: true
    },
    cycle: {
        type: String,
        required: true
    },
    acedemicYear: {
        type: String,
        required: true
    },
    classMasterId: {
        type: String,
        required: true
    }
}, { timestamps: true });

const SchoolClass = mongoose.model("SchoolClass", schoolClassSchema);

export default SchoolClass