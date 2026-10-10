import mongoose from "mongoose"
import { syncTombstonePlugin } from "../db/syncPlugin.js";
import { generateMatricule, enrollmentYearOf } from "../services/matriculeService.js";

const studentschema = new mongoose.Schema({
    fullName: {
        type: String,
        required: true
    },
    // School admission number (matricule). Generated automatically when the
    // student is created (see services/matriculeService.js). Stored as
    // uppercase text; the "admissionNumber" virtual exposes the same value to
    // the existing screens/report cards.
    matricule: {
        type: String,
        trim: true,
        uppercase: true,
        default: ""
    },
    // Calendar year the student was enrolled in (drives the matricule series)
    enrollmentYear: {
        type: Number,
        min: [1900, "Enrollment year looks invalid"],
        max: [2999, "Enrollment year looks invalid"]
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
    section: {
        type: String,
        enum: ["englophone"],
        default: "englophone",
        required: true,
        trim: true
    },
    department: {
        type: String,
        required: true
    },
    parentName: {
        type: String,
        default: ""
    },
    parentPhone: {
        type: String,
        required: true
    },
    address: {
        type: String,
        default: ""
    },
    photoUrl: {
        type: String,
        default: ""
    },
    photoCloudinaryUrl: {
        type: String,
        default: ""
    },
    photoLocalUrl: {
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
    },
    tuitionFee: {
        type: Number,
        min: [0, "Tuition fee cannot be negative"]
    },
    tuitionInstallments: {
        type: Number,
        min: [1, "At least one installment is required"],
        max: [12, "Tuition cannot exceed 12 installments"]
    },
    tuitionFeePaid: {
        type: Number,
        min: 0
    },
    tuitionInstallmentsPaid: {
        type: Number,
        min: 0
    },
    // ---- Installment payment amount fields (Task: add installment fields) ----
    firstInstallment: {
        type: Number,
        min: 0,
        default: null
    },
    secondInstallment: {
        type: Number,
        min: 0,
        default: null
    },
    thirdInstallment: {
        type: Number,
        min: 0,
        default: null
    },
    // Registration requirements: array of checkbox items that teachers can
    // select/checked on the student-add form.
    registrationRequirements: [{
        id: { type: String, required: true },
        label: { type: String, required: true },
        checked: { type: Boolean, default: false }
    }],
    registrationFeeRequired: {
        type: Boolean
    },
    registrationFeeAmount: {
        type: Number,
        min: 0
    },
    registrationFeePaid: {
        type: Number,
        min: 0
    },
    feePayments: [{
        _id: false,
        feeType: { type: String, enum: ["tuition", "registration"], required: true },
        amount: { type: Number, min: 1, required: true },
        installmentNumber: { type: Number, min: 1 },
        paidAt: { type: Date, default: Date.now },
        recordedBy: { type: String, default: "" }
    }]

}, {
    timestamps: true,
    // Expose the "admissionNumber" virtual in API responses (res.json)
    toJSON: { virtuals: true },
    toObject: { virtuals: true }
})

// ==================== MATRICULE (admission number) ====================
// "admissionNumber" is kept as an alias of "matricule" because the report
// cards and the mark entry screen already display that label.
studentschema.virtual("admissionNumber")
    .get(function () {
        return this.matricule || "";
    })
    // Allow the older screens to POST { admissionNumber: "MFS-2025-0001" }
    .set(function (value) {
        if (value) this.matricule = String(value).trim().toUpperCase();
    });

// Fast matricule lookups (search box, report cards, barcode scanning) AND a
// hard database-level guarantee that every real admission number is unique.
// It is a PARTIAL index (matricule > "") so the "" default and any legacy row
// without a matricule are not indexed — otherwise they would all collide on
// the empty string. The matricule counter (services/matriculeService.js) plus
// the pre-save duplicate check below already prevent collisions; this index is
// the final backstop so two students can never share a matricule.
studentschema.index(
    { matricule: 1 },
    { unique: true, partialFilterExpression: { matricule: { $gt: "" } }, name: "matricule_unique" }
);
studentschema.index({ enrollmentYear: 1 });
studentschema.index({ section: 1 });
// Sorted + paginated listings of the Students screen (section/class scoped)
studentschema.index({ section: 1, fullName: 1 });
studentschema.index({ section: 1, classId: 1, fullName: 1 });

// Generate the matricule automatically for every new student, and refuse a
// matricule that is already used by another student.
studentschema.pre("save", async function () {
    if (this.isNew && !this.matricule) {
        if (!this.enrollmentYear) this.enrollmentYear = enrollmentYearOf(this);
        this.matricule = await generateMatricule(this);
    }

    if (this.isModified("matricule") && this.matricule) {
        const taken = await mongoose.model("Student").findOne({
            matricule: this.matricule,
            _id: { $ne: this._id }
        }).select("_id fullName").lean();

        if (taken) {
            const error = new Error(`Matricule ${this.matricule} is already used by ${taken.fullName}`);
            error.name = "DuplicateMatricule";
            error.matricule = this.matricule;
            error.conflict = taken;
            throw error;
        }
    }
});

// Record deletions for the offline/online sync
studentschema.plugin(syncTombstonePlugin);

const Student = mongoose.model("Student", studentschema)

export default Student;