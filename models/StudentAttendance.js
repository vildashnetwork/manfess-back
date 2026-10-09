import mongoose from "mongoose";
import { syncTombstonePlugin } from "../db/syncPlugin.js";

// ==================== STUDENT ATTENDANCE ====================
// One document per student, per school day and per "period".
// period = "day"  -> the daily register (one mark for the whole day)
// period = "p1".."p12" -> a single lesson/period of that day
// The compound unique index makes "save the register" an idempotent upsert:
// re-marking the same day/period updates the existing record instead of
// creating a duplicate.

export const ATTENDANCE_STATUSES = ["present", "absent", "late", "excused"];
export const ATTENDANCE_TERMS = ["first", "second", "third"];

const studentAttendanceSchema = new mongoose.Schema({
    studentId: {
        type: String,
        required: [true, "studentId is required"],
        trim: true
    },
    classId: {
        type: String,
        required: [true, "classId is required"],
        trim: true
    },
    section: {
        type: String,
        enum: ["englophone"],
        default: "englophone",
        trim: true
    },
    date: {
        type: Date,
        required: [true, "date is required"]
    },
    period: {
        type: String,
        trim: true,
        lowercase: true,
        default: "day",
        validate: {
            validator: (v) => /^(day|p([1-9]|1[0-2]))$/.test(v || ""),
            message: (props) => `${props.value} is not a valid period. Use "day" or "p1".."p12"`
        }
    },
    status: {
        type: String,
        enum: ATTENDANCE_STATUSES,
        required: [true, "status is required"],
        default: "present"
    },
    academicYear: {
        type: String,
        required: [true, "academicYear is required"],
        trim: true
    },
    term: {
        type: String,
        enum: ATTENDANCE_TERMS,
        required: [true, "term is required"],
        default: "first"
    },
    recordedBy: {
        type: String,
        trim: true,
        default: ""
    },
    notes: {
        type: String,
        trim: true,
        default: ""
    }
}, { timestamps: true });

// A student can only have one mark per day and per period
studentAttendanceSchema.index({ studentId: 1, date: 1, period: 1 }, { unique: true });
studentAttendanceSchema.index({ classId: 1, date: 1 });
studentAttendanceSchema.index({ academicYear: 1, term: 1 });
studentAttendanceSchema.index({ studentId: 1, academicYear: 1, term: 1 });
studentAttendanceSchema.index({ section: 1 });

// ==================== HELPERS ====================

/** Normalize any date-ish value to UTC midnight so a "school day" is one key. */
studentAttendanceSchema.statics.normalizeDate = function (value) {
    const d = value instanceof Date ? new Date(value.getTime()) : new Date(value);
    if (Number.isNaN(d.getTime())) return null;
    return new Date(Date.UTC(d.getUTCFullYear(), d.getUTCMonth(), d.getUTCDate()));
};

/** Cameroon school calendar: Sep-Dec = first, Jan-Apr = second, May-Aug = third. */
studentAttendanceSchema.statics.termForDate = function (value) {
    const d = value instanceof Date ? value : new Date(value);
    const month = d.getUTCMonth(); // 0 = January
    if (month >= 8) return "first";
    if (month >= 0 && month <= 3) return "second";
    return "third";
};

/** Academic year ("YYYY-YYYY") a date belongs to (school starts in September). */
studentAttendanceSchema.statics.academicYearForDate = function (value) {
    const d = value instanceof Date ? value : new Date(value);
    const year = d.getUTCFullYear();
    return d.getUTCMonth() >= 8 ? `${year}-${year + 1}` : `${year - 1}-${year}`;
};

/** Mongo match built from the common query filters. */
studentAttendanceSchema.statics.buildMatch = function ({
    studentIds, classId, academicYear, term, from, to, status, period, section
} = {}) {
    const match = {};
    if (section) match.section = "englophone";
    if (studentIds) match.studentId = { $in: Array.isArray(studentIds) ? studentIds : [studentIds] };
    if (classId) match.classId = classId;
    if (academicYear && academicYear !== "all") match.academicYear = academicYear;
    // term "annual"/"all" means "the whole academic year"
    if (term && term !== "annual" && term !== "all") match.term = term;
    if (period) match.period = period;
    if (status) match.status = status;
    if (from || to) {
        match.date = {};
        if (from) match.date.$gte = this.normalizeDate(from);
        if (to) match.date.$lte = this.normalizeDate(to);
    }
    return match;
};

/**
 * Attendance summary per student (what the report card prints).
 * @returns {Promise<Array<{studentId:string,days:number,sessions:number,present:number,
 *   absent:number,late:number,excused:number,attendanceRate:number,
 *   firstRecorded:string,lastRecorded:string}>>}
 */
studentAttendanceSchema.statics.summarize = async function (filters = {}) {
    const match = this.buildMatch(filters);
    const rows = await this.aggregate([
        { $match: match },
        {
            $group: {
                _id: "$studentId",
                sessions: { $sum: 1 },
                present: { $sum: { $cond: [{ $eq: ["$status", "present"] }, 1, 0] } },
                absent: { $sum: { $cond: [{ $eq: ["$status", "absent"] }, 1, 0] } },
                late: { $sum: { $cond: [{ $eq: ["$status", "late"] }, 1, 0] } },
                excused: { $sum: { $cond: [{ $eq: ["$status", "excused"] }, 1, 0] } },
                days: { $addToSet: "$date" },
                firstRecorded: { $min: "$date" },
                lastRecorded: { $max: "$date" }
            }
        },
        { $sort: { _id: 1 } }
    ]);

    return rows.map((row) => {
        const attended = row.present + row.late;
        return {
            studentId: row._id,
            sessions: row.sessions,
            schoolDays: row.days.length,
            present: row.present,
            absent: row.absent,
            late: row.late,
            excused: row.excused,
            // Excused absences are not counted against the student.
            attendanceRate: row.sessions > 0 ? Math.round((attended / row.sessions) * 1000) / 10 : 0,
            firstRecorded: row.firstRecorded,
            lastRecorded: row.lastRecorded
        };
    });
};

/** Same summary, keyed by studentId (handy for the report card screens). */
studentAttendanceSchema.statics.summaryMap = async function (filters = {}) {
    const rows = await this.summarize(filters);
    return rows.reduce((acc, row) => {
        acc[row.studentId] = row;
        return acc;
    }, {});
};

// Record deletions for the offline/online sync
studentAttendanceSchema.plugin(syncTombstonePlugin);

const StudentAttendance = mongoose.model("StudentAttendance", studentAttendanceSchema);

export default StudentAttendance;
