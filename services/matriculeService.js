import Counter from "../models/Counter.js";

// ==================== MATRICULE (student admission number) ====================
// Format: <PREFIX>-<ENROLMENT YEAR>-<0001>  e.g. MFS-2025-0001
// The prefix can be changed with the MATRICULE_PREFIX environment variable.
// Numbers come from the Counter collection so two students can never share a
// matricule, and are repaired automatically when a matricule already exists
// (for example after an offline -> online merge).

const DEFAULT_PREFIX = process.env.MATRICULE_PREFIX || "MFS";
const SEQ_WIDTH = Number(process.env.MATRICULE_SEQ_WIDTH || 4);
const MAX_RETRIES = 50;

const pad = (value, width = SEQ_WIDTH) => String(value).padStart(width, "0");

/** School code used as matricule prefix. */
export const getMatriculePrefix = () =>
    (process.env.MATRICULE_PREFIX || DEFAULT_PREFIX).trim().toUpperCase().replace(/\s+/g, "") || "MFS";

/** Compose a matricule from its parts. */
export const buildMatricule = (prefix, year, seq) => `${prefix}-${year}-${pad(seq)}`;

/** Counter key for a given prefix + enrolment year. */
const counterKey = (prefix, year) => `matricule:${prefix}-${year}`;

/** Escape a string so it can be safely used inside a RegExp. */
const escapeRegex = (value) => String(value).replace(/[.*+?^${}()|[\]\\]/g, "\\$&");

/**
 * Highest sequence already used in a series (0 when the series is empty).
 * Needed because students imported from a previous system may already carry a
 * matricule that this counter never issued.
 */
const highestUsedSequence = async (prefix, year) => {
    const Student = (await import("../models/Students.js")).default;
    const pattern = new RegExp(`^${escapeRegex(prefix)}-${year}-(\\d+)$`, "i");

    const last = await Student
        .find({ matricule: pattern })
        .select("matricule")
        .sort({ matricule: -1 })
        .limit(1)
        .lean();

    if (!last.length) return 0;
    const digits = String(last[0].matricule).match(/(\d+)\s*$/);
    return digits ? Number(digits[1]) : 0;
};

/**
 * Bring a counter up to the highest matricule already stored for its series,
 * so a counter reset (or a fresh database) can never re-issue a number that
 * is in use. Returns that highest sequence.
 */
const alignCounter = async (key, prefix, year) => {
    const highest = await highestUsedSequence(prefix, year);
    if (highest > 0) await Counter.atLeast(key, highest);
    return highest;
};

/**
 * Enrolment year of a student: explicit enrollmentYear, then the year of
 * registrationDate (accepts "YYYY-MM-DD" or a Date), then the current year.
 */
export const enrollmentYearOf = (student = {}) => {
    const explicit = Number(student.enrollmentYear);
    if (explicit && explicit > 1900) return explicit;

    const raw = student.registrationDate;
    if (raw) {
        const parsed = raw instanceof Date ? raw : new Date(raw);
        if (!Number.isNaN(parsed.getTime()) && parsed.getFullYear() > 1900) {
            return parsed.getFullYear();
        }
    }
    return new Date().getFullYear();
};

/** Reserve and return a unique matricule for a student-like object. */
export const generateMatricule = async (student = {}) => {
    const prefix = getMatriculePrefix();
    const year = enrollmentYearOf(student);
    const key = counterKey(prefix, year);
    const Student = (await import("../models/Students.js")).default;

    // A counter that runs behind the students already stored (fresh database,
    // imported register, offline -> online merge) is brought up to date first.
    await alignCounter(key, prefix, year);

    for (let attempt = 0; attempt < MAX_RETRIES; attempt += 1) {
        // eslint-disable-next-line no-await-in-loop
        const seq = await Counter.next(key);
        const candidate = buildMatricule(prefix, year, seq);
        // eslint-disable-next-line no-await-in-loop
        const taken = await Student.exists({ matricule: candidate });
        if (!taken) return candidate;
    }
    throw new Error(`Unable to allocate a unique matricule for the ${year} series after ${MAX_RETRIES} attempts`);
};

/**
 * Return the matricule the next student of this series would get, without
 * reserving it (used by the UI to preview the number before saving).
 */
export const previewMatricule = async (student = {}) => {
    const prefix = getMatriculePrefix();
    const year = enrollmentYearOf(student);
    const key = counterKey(prefix, year);
    const Student = (await import("../models/Students.js")).default;

    await alignCounter(key, prefix, year);

    const counter = await Counter.findOne({ key }).lean();
    let seq = (counter?.seq || 0) + 1;
    for (let attempt = 0; attempt < MAX_RETRIES; attempt += 1) {
        const candidate = buildMatricule(prefix, year, seq);
        // eslint-disable-next-line no-await-in-loop
        const taken = await Student.exists({ matricule: candidate });
        if (!taken) return { matricule: candidate, prefix, year, sequence: seq, reserved: false };
        seq += 1;
    }
    return { matricule: buildMatricule(prefix, year, seq), prefix, year, sequence: seq, reserved: false };
};

/**
 * Assign matricules to the students that do not have one yet.
 * Existing matricules are never overwritten.
 * @param {{dryRun?: boolean}} options
 */
export const backfillMatricules = async ({ dryRun = false } = {}) => {
    const Student = (await import("../models/Students.js")).default;
    const pending = await Student
        .find({ $or: [{ matricule: null }, { matricule: "" }] })
        .sort({ registrationDate: 1, createdAt: 1 });

    const assigned = [];
    for (const student of pending) {
        // eslint-disable-next-line no-await-in-loop
        const matricule = await generateMatricule(student);
        assigned.push({ id: String(student._id), fullName: student.fullName, matricule });
        if (!dryRun) {
            student.matricule = matricule;
            // eslint-disable-next-line no-await-in-loop
            await student.save({ validateBeforeSave: false });
        }
    }

    return { dryRun, scanned: pending.length, assigned: assigned.length, students: assigned };
};

/**
 * Report the students without a matricule and the matricules used more than
 * once. With `fix: true` the oldest student of each duplicate group keeps its
 * matricule, the others receive a new one, and the students without a
 * matricule are filled in.
 * @param {{fix?: boolean}} options
 */
export const auditMatricules = async ({ fix = false } = {}) => {
    const Student = (await import("../models/Students.js")).default;

    const missing = await Student
        .find({ $or: [{ matricule: null }, { matricule: "" }] })
        .select("fullName classId registrationDate")
        .lean();

    const duplicates = await Student.aggregate([
        { $match: { matricule: { $ne: null } } },
        { $group: { _id: "$matricule", count: { $sum: 1 }, ids: { $push: { $toString: "$_id" } } } },
        { $match: { count: { $gt: 1 } } },
        { $sort: { _id: 1 } }
    ]);

    if (!fix) {
        return {
            fixed: false,
            missing: missing.map((s) => ({ id: String(s._id), fullName: s.fullName, classId: s.classId })),
            duplicates: duplicates.map((d) => ({ matricule: d._id, count: d.count, ids: d.ids }))
        };
    }

    const reassigned = [];
    for (const group of duplicates) {
        // Keep the first student of the group, re-issue the others.
        for (const id of group.ids.slice(1)) {
            // eslint-disable-next-line no-await-in-loop
            const student = await Student.findById(id);
            if (!student) continue;
            // eslint-disable-next-line no-await-in-loop
            student.matricule = await generateMatricule(student);
            // eslint-disable-next-line no-await-in-loop
            await student.save({ validateBeforeSave: false });
            reassigned.push({ id: String(student._id), fullName: student.fullName, matricule: student.matricule });
        }
    }

    const backfilled = await backfillMatricules({ dryRun: false });
    return {
        fixed: true,
        missingBefore: missing.length,
        duplicatesBefore: duplicates.length,
        reassigned,
        backfilled: backfilled.assigned
    };
};

export default {
    getMatriculePrefix,
    buildMatricule,
    enrollmentYearOf,
    generateMatricule,
    previewMatricule,
    backfillMatricules,
    auditMatricules
};
