import mongoose from "mongoose";

const schoolClassSchema = new mongoose.Schema({
    className: {
        type: String,
        enum: ["Form 1", "Form 2", "Form 3", "Form 4", "Form 5", "Lower 6th", "Upper 6th", "Graduated"],
        required: [true, "Class name is required"],
        trim: true
    },
    department: {
        type: String,
        enum: ["Science", "Arts", "Commercial"],
        required: [true, "Department is required"],
        trim: true
    },
    cycle: {
        type: String,
        enum: ["1st Cycle", "2nd Cycle"],
        required: [true, "Cycle is required"],
        trim: true
    },
    acedemicYear: {
        type: String,
        required: [true, "Academic year is required"],
        trim: true,
        validate: {
            validator: function (v) {
                return /^\d{4}-\d{4}$/.test(v);
            },
            message: props => `${props.value} is not a valid academic year format. Use YYYY-YYYY`
        }
    },
    classMasterId: {
        type: String,
        trim: true
    },
    studentCount: {
        type: Number,
        default: 0,
        min: [0, "Student count cannot be negative"]
    },
    maxStudents: {
        type: Number,
        default: 50,
        min: [1, "Maximum students must be at least 1"]
    },
    isActive: {
        type: Boolean,
        default: true
    },
    section: {
        type: String,
        enum: ["A", "B", "C", "D"],
        default: "A"
    }
}, {
    timestamps: true,
    toJSON: { virtuals: true },
    toObject: { virtuals: true }
});

// Virtual for full class name (e.g., "Form 5 Science A")
schoolClassSchema.virtual('fullName').get(function () {
    let name = this.className;
    if (this.department) {
        name += ` ${this.department}`;
    }
    if (this.section) {
        name += ` ${this.section}`;
    }
    return name;
});

// Virtual for class level (numeric value for sorting)
schoolClassSchema.virtual('level').get(function () {
    const levels = {
        "Form 1": 1,
        "Form 2": 2,
        "Form 3": 3,
        "Form 4": 4,
        "Form 5": 5,
        "Lower 6th": 6,
        "Upper 6th": 7,
        "Graduated": 8
    };
    return levels[this.className] || 0;
});

// Index for faster queries - FIXED: use acedemicYear instead of academicYear
schoolClassSchema.index({ className: 1, department: 1, acedemicYear: 1 });
schoolClassSchema.index({ classMasterId: 1 });
schoolClassSchema.index({ acedemicYear: 1 });
schoolClassSchema.index({ isActive: 1 });

// ============ FIXED: Pre-save middleware ============
// Removed the problematic next parameter - using async/await instead
schoolClassSchema.pre('save', async function () {
    // Auto-set cycle based on className if not provided
    if (!this.cycle) {
        const lowerClasses = ["Form 1", "Form 2", "Form 3", "Form 4"];
        const upperClasses = ["Form 5", "Lower 6th", "Upper 6th"];

        if (lowerClasses.includes(this.className)) {
            this.cycle = "1st Cycle";
        } else if (upperClasses.includes(this.className)) {
            this.cycle = "2nd Cycle";
        } else {
            // For Graduated or other classes, default to "2nd Cycle"
            this.cycle = "2nd Cycle";
        }
    }
});

// ============ FIXED: Static Methods - use acedemicYear ============
schoolClassSchema.statics.findByAcademicYear = function (year) {
    return this.find({ acedemicYear: year }).sort({ className: 1, department: 1 });
};

schoolClassSchema.statics.findActive = function () {
    return this.find({ isActive: true }).sort({ className: 1, department: 1 });
};

schoolClassSchema.statics.getClassStats = async function () {
    const stats = await this.aggregate([
        {
            $group: {
                _id: {
                    className: "$className",
                    department: "$department"
                },
                count: { $sum: 1 },
                academicYears: { $addToSet: "$acedemicYear" }
            }
        },
        {
            $sort: {
                "_id.className": 1,
                "_id.department": 1
            }
        }
    ]);
    return stats;
};

// Instance methods
schoolClassSchema.methods.isFull = function () {
    return this.studentCount >= this.maxStudents;
};

schoolClassSchema.methods.getAvailableSlots = function () {
    return Math.max(0, this.maxStudents - this.studentCount);
};

const SchoolClass = mongoose.model("SchoolClass", schoolClassSchema);

export default SchoolClass;