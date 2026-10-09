import express from "express";
import mongoose from "mongoose";
import StudentAttendance, { ATTENDANCE_STATUSES, ATTENDANCE_TERMS } from "../models/StudentAttendance.js";
import Student from "../models/Students.js";

const router = express.Router();

// ==================== STUDENT ATTENDANCE ====================
// /api/attendance/students... (the staff register lives in routes/teacherAttendance.js
// under /api/attendance, so every route here is namespaced under /attendance/students)

/**
 * Validate + normalize one attendance record coming from the API.
 * @returns {{record?: object, error?: string}}
 */
const normalizeRecord = (raw = {}, activeSection) => {
    const studentId = raw.studentId ? String(raw.studentId).trim() : "";
    const classId = raw.classId ? String(raw.classId).trim() : "";
    if (!studentId) return { error: "studentId is required" };
    if (!classId) return { error: "classId is required" };

    const date = StudentAttendance.normalizeDate(raw.date || new Date());
    if (!date) return { error: `Invalid date: ${raw.date}` };

    const status = String(raw.status || "present").trim().toLowerCase();
    if (!ATTENDANCE_STATUSES.includes(status)) return { error: `Invalid status: ${raw.status}` };

    const period = String(raw.period || "day").trim().toLowerCase();
    if (!/^(day|p([1-9]|1[0-2]))$/.test(period)) return { error: `Invalid period: ${raw.period}` };

    const term = raw.term && ATTENDANCE_TERMS.includes(raw.term)
        ? raw.term
        : StudentAttendance.termForDate(date);

    return {
        record: {
            studentId,
            classId,
            date,
            period,
            status,
            academicYear: (raw.academicYear && String(raw.academicYear).trim())
                || StudentAttendance.academicYearForDate(date),
            term,
            section: activeSection || raw.section || "englophone",
            recordedBy: raw.recordedBy ? String(raw.recordedBy).trim() : "",
            notes: raw.notes ? String(raw.notes).trim() : ""
        }
    };
};

/** Upsert a list of already normalized records. */
const upsertRecords = async (records) => {
    if (!records.length) return { created: 0, updated: 0 };

    const ops = records.map((record) => ({
        updateOne: {
            filter: { studentId: record.studentId, date: record.date, period: record.period },
            update: {
                $set: {
                    classId: record.classId,
                    status: record.status,
                    section: record.section,
                    academicYear: record.academicYear,
                    term: record.term,
                    recordedBy: record.recordedBy,
                    notes: record.notes
                }
            },
            upsert: true
        }
    }));

    const result = await StudentAttendance.bulkWrite(ops, { ordered: false });
    return {
        created: result.upsertedCount || 0,
        updated: result.modifiedCount || 0
    };
};

// Shared handler for POST /attendance/students and /attendance/students/bulk
const saveAttendance = async (req, res) => {
    try {
        const payload = Array.isArray(req.body) ? req.body : (req.body?.records ?? req.body);
        const incoming = Array.isArray(payload) ? payload : [payload];

        if (!incoming.length) {
            return res.status(400).json({ success: false, message: "No attendance record provided" });
        }

        const records = [];
        const errors = [];
        incoming.forEach((raw, index) => {
            const { record, error } = normalizeRecord(raw, "englophone");
            if (error) errors.push({ index, error });
            else records.push(record);
        });

        if (errors.length && !records.length) {
            return res.status(400).json({ success: false, message: "Invalid attendance record(s)", errors });
        }

        const saved = await upsertRecords(records);

        res.status(201).json({
            success: true,
            message: `Attendance saved (${records.length} record${records.length === 1 ? "" : "s"})`,
            data: saved,
            ...(errors.length ? { errors } : {})
        });
    } catch (error) {
        console.error("Error saving student attendance:", error);
        res.status(500).json({ success: false, message: "Error saving student attendance", error: error.message });
    }
};

router.post("/attendance/students", saveAttendance);
// Alias kept for symmetry with the other modules (POST /marks/bulk, /attendance/bulk)
router.post("/attendance/students/bulk", saveAttendance);

// GET - list attendance records (filters: classId, studentId, academicYear,
// term, date, from, to, status, period, limit)
router.get("/attendance/students", async (req, res) => {
    try {
        const { classId, studentId, academicYear, term, date, from, to, status, period, limit, section } = req.query;

        const filters = {
            classId,
            academicYear,
            term,
            status,
            period: period ? String(period).toLowerCase() : undefined,
            studentIds: studentId ? String(studentId).split(",") : undefined,
            section,
        };

        if (date) {
            filters.from = date;
            filters.to = date;
        } else {
            filters.from = from;
            filters.to = to;
        }

        const match = StudentAttendance.buildMatch(filters);
        let query = StudentAttendance.find(match).sort({ date: -1, period: 1 });

        const max = Number(limit);
        if (max > 0) query = query.limit(Math.min(max, 5000));

        const records = await query.lean();

        res.status(200).json({ success: true, count: records.length, data: records });
    } catch (error) {
        console.error("Error fetching student attendance:", error);
        res.status(500).json({ success: false, message: "Error fetching student attendance", error: error.message });
    }
});

// GET - attendance summary for one student (studentId query) or many
// (studentIds=a,b,c). Used by the report card screens.
router.get("/attendance/students/summary", async (req, res) => {
    try {
        const { classId, academicYear, term, studentId, studentIds, section } = req.query;
        const ids = studentIds
            ? String(studentIds).split(",").map((s) => s.trim()).filter(Boolean)
            : (studentId ? [studentId] : undefined);

        if (!ids && !classId) {
            return res.status(400).json({
                success: false,
                message: "Provide studentId, studentIds or classId to build an attendance summary"
            });
        }

        const summaries = await StudentAttendance.summarize({
            studentIds: ids,
            classId,
            academicYear,
            term: term || "annual",
            section,
        });

        res.status(200).json({ success: true, count: summaries.length, data: summaries });
    } catch (error) {
        console.error("Error summarising student attendance:", error);
        res.status(500).json({ success: false, message: "Error summarising student attendance", error: error.message });
    }
});


// GET - the class register: students of the class merged with the attendance
// recorded between `from` and `to` (or for one `date`). Renders the day x
// student grid of the attendance screen and the printable class sheet.
router.get("/attendance/students/register", async (req, res) => {
    try {
        const { classId, academicYear, term, date, from, to, section } = req.query;
        if (!classId) {
            return res.status(400).json({ success: false, message: "classId is required" });
        }

        const fromDate = date ? StudentAttendance.normalizeDate(date) : (from ? StudentAttendance.normalizeDate(from) : null);
        const toDate = date ? StudentAttendance.normalizeDate(date) : (to ? StudentAttendance.normalizeDate(to) : null);
        if (from && date && !fromDate) return res.status(400).json({ success: false, message: `Invalid date: ${date}` });

        const students = await Student.find({ classId, ...(section ? { section } : {}) })
            .select("fullName matricule gender department")
            .sort({ fullName: 1 })
            .lean();

        const match = StudentAttendance.buildMatch({
            classId,
            academicYear,
            term,
            section,
            from: fromDate,
            to: toDate
        });

        const records = await StudentAttendance.find(match)
            .select("studentId date period status notes recordedBy")
            .sort({ date: 1, period: 1 })
            .lean();

        // Index the records so the UI can render a day x student grid
        const byStudent = {};
        records.forEach((rec) => {
            const key = String(rec.studentId);
            if (!byStudent[key]) byStudent[key] = [];
            byStudent[key].push({
                id: String(rec._id),
                date: rec.date,
                dayKey: new Date(rec.date).toISOString().slice(0, 10),
                period: rec.period,
                status: rec.status,
                notes: rec.notes,
                recordedBy: rec.recordedBy
            });
        });

        const days = [...new Set(records.map((r) => new Date(r.date).toISOString().slice(0, 10)))].sort();

        res.status(200).json({
            success: true,
            count: students.length,
            data: {
                days,
                students: students.map((s) => ({
                    id: String(s._id),
                    matricule: s.matricule || "",
                    admissionNumber: s.matricule || "",
                    fullName: s.fullName,
                    gender: s.gender,
                    department: s.department,
                    records: byStudent[String(s._id)] || []
                }))
            }
        });
    } catch (error) {
        console.error("Error building attendance register:", error);
        res.status(500).json({ success: false, message: "Error building attendance register", error: error.message });
    }
});

// GET - one attendance record
router.get("/attendance/students/record/:id", async (req, res) => {
    try {
        const { id } = req.params;
        if (!mongoose.Types.ObjectId.isValid(id)) {
            return res.status(400).json({ success: false, message: "Invalid attendance record ID" });
        }
        const record = await StudentAttendance.findById(id).lean();
        if (!record) return res.status(404).json({ success: false, message: "Attendance record not found" });
        res.status(200).json({ success: true, data: record });
    } catch (error) {
        res.status(500).json({ success: false, message: "Error fetching attendance record", error: error.message });
    }
});


// PUT - update a single attendance record
router.put("/attendance/students/record/:id", async (req, res) => {
    try {
        const { id } = req.params;
        if (!mongoose.Types.ObjectId.isValid(id)) {
            return res.status(400).json({ success: false, message: "Invalid attendance record ID" });
        }

        const { record, error } = normalizeRecord({
            studentId: req.body.studentId,
            classId: req.body.classId,
            date: req.body.date,
            period: req.body.period,
            status: req.body.status,
            academicYear: req.body.academicYear,
            term: req.body.term,
            recordedBy: req.body.recordedBy,
            notes: req.body.notes
        }, "englophone");
        if (error) return res.status(400).json({ success: false, message: error });

        const updated = await StudentAttendance.findByIdAndUpdate(
            id,
            { $set: record },
            { new: true, runValidators: true, setDefaultsOnInsert: true }
        ).lean();

        if (!updated) return res.status(404).json({ success: false, message: "Attendance record not found" });

        res.status(200).json({ success: true, message: "Attendance record updated", data: updated });
    } catch (err) {
        console.error("Error updating attendance record:", err);
        res.status(500).json({ success: false, message: "Error updating attendance record", error: err.message });
    }
});

// DELETE - a single attendance record
router.delete("/attendance/students/record/:id", async (req, res) => {
    try {
        const { id } = req.params;
        if (!mongoose.Types.ObjectId.isValid(id)) {
            return res.status(400).json({ success: false, message: "Invalid attendance record ID" });
        }
        const deleted = await StudentAttendance.findByIdAndDelete(id);
        if (!deleted) return res.status(404).json({ success: false, message: "Attendance record not found" });
        res.status(200).json({ success: true, message: "Attendance record deleted", data: deleted });
    } catch (err) {
        console.error("Error deleting attendance record:", err);
        res.status(500).json({ success: false, message: "Error deleting attendance record", error: err.message });
    }
});

// DELETE - clear a whole register: ?classId=..&date=YYYY-MM-DD[&period=day]
router.delete("/attendance/students/register", async (req, res) => {
    try {
        const { classId, date, period } = req.query;
        if (!classId || !date) {
            return res.status(400).json({ success: false, message: "classId and date are required" });
        }
        const day = StudentAttendance.normalizeDate(date);
        if (!day) return res.status(400).json({ success: false, message: `Invalid date: ${date}` });

        const result = await StudentAttendance.deleteMany({
            classId,
            date: day,
            period: period ? String(period).toLowerCase() : { $in: ["day", "p1", "p2", "p3", "p4", "p5", "p6", "p7", "p8", "p9", "p10", "p11", "p12"] }
        });

        res.status(200).json({
            success: true,
            message: `${result.deletedCount} attendance record(s) deleted`,
            deletedCount: result.deletedCount
        });
    } catch (err) {
        console.error("Error clearing attendance register:", err);
        res.status(500).json({ success: false, message: "Error clearing attendance register", error: err.message });
    }
});

// GET - per-day counts for a class (calendar / printable term sheet)
router.get("/attendance/students/daily", async (req, res) => {
    try {
        const { classId, academicYear, term, period, section } = req.query;
        if (!classId) return res.status(400).json({ success: false, message: "classId is required" });

        const rows = await StudentAttendance.aggregate([
            { $match: StudentAttendance.buildMatch({ classId, academicYear, term, period, section }) },
            {
                $group: {
                    _id: "$date",
                    total: { $sum: 1 },
                    present: { $sum: { $cond: [{ $eq: ["$status", "present"] }, 1, 0] } },
                    absent: { $sum: { $cond: [{ $eq: ["$status", "absent"] }, 1, 0] } },
                    late: { $sum: { $cond: [{ $eq: ["$status", "late"] }, 1, 0] } },
                    excused: { $sum: { $cond: [{ $eq: ["$status", "excused"] }, 1, 0] } }
                }
            },
            { $sort: { _id: 1 } }
        ]);

        res.status(200).json({
            success: true,
            count: rows.length,
            data: rows.map((r) => ({ date: r._id, ...r, _id: undefined, dayKey: new Date(r._id).toISOString().slice(0, 10) }))
        });
    } catch (err) {
        console.error("Error building daily attendance:", err);
        res.status(500).json({ success: false, message: "Error building daily attendance", error: err.message });
    }
});

export default router;

