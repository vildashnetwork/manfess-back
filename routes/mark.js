import express from "express";
import mongoose from "mongoose";
import Mark from "../models/Mark.js"; // Adjust the path as needed
import Subject from "../models/Subject.js";
import SchoolClass from "../models/SchoolClass.js";
import Student from "../models/Students.js";
import User from "../models/User.js";
import { buildInclusiveSectionFilter, normalizeSchoolSection } from "../utils/schoolSection.js";

const router = express.Router();
const sectionFilter = (req) => buildInclusiveSectionFilter(req, "section");
const inclusiveOr = (req, fieldName) => {
    const filter = buildInclusiveSectionFilter(req, fieldName);
    return Object.keys(filter).length ? [filter] : [];
};

// ==================== GET ROUTES ====================

// GET marks, optionally scoped to the selected class/student/subject/year.
router.get("/marks", async (req, res) => {
    try {
        const { classId, studentId, subjectId, academicyear, academicYear, sequence } = req.query;
        const filter = sectionFilter(req);
        if (classId) filter.classId = String(classId);
        if (studentId) filter.studentId = String(studentId);
        if (subjectId) filter.subjectId = String(subjectId);
        if (academicyear || academicYear) filter.academicyear = String(academicyear || academicYear);
        if (sequence) filter.sequence = String(sequence);

        const marks = await Mark.find(filter)
            .sort({ createdAt: -1 })
            .lean();
        res.status(200).json({
            success: true,
            count: marks.length,
            data: marks
        });
    } catch (error) {
        res.status(500).json({
            success: false,
            message: "Error fetching marks",
            error: error.message
        });
    }
});

router.get("/marks/dashboard-summary", async (req, res) => {
    try {
        const section = normalizeSchoolSection(req.query.section || "englophone", "englophone");
        const markSectionClause = inclusiveOr(req, "section");
        const matchStage = markSectionClause.length ? { $and: markSectionClause } : {};
        const andFilter = (extra) => {
            const clauses = [...inclusiveOr(req, "section"), ...(extra ? [extra] : [])];
            return clauses.length === 1 ? clauses[0] : clauses.length ? { $and: clauses } : {};
        };
        const classFilter = (() => {
            const clauses = inclusiveOr(req, "schoolSection");
            return clauses.length === 1 ? clauses[0] : clauses.length ? { $and: clauses } : {};
        })();
        const [aggregateRows, subjects, classes, students, totalTeachers] = await Promise.all([
            Mark.aggregate([{ $match: matchStage }, {
                $facet: {
                    studentSubjects: [{
                        $group: {
                            _id: { studentId: "$studentId", subjectId: "$subjectId" },
                            scoreTotal: { $sum: "$score" },
                            markCount: { $sum: 1 },
                        },
                    }],
                    subjects: [{
                        $group: {
                            _id: "$subjectId",
                            scoreTotal: { $sum: "$score" },
                            markCount: { $sum: 1 },
                        },
                    }],
                    sequences: [{
                        $group: {
                            _id: "$sequence",
                            scoreTotal: { $sum: "$score" },
                            markCount: { $sum: 1 },
                        },
                    }],
                },
            }]).allowDiskUse(true),
            Subject.find(andFilter()).select("_id name code coefficient").lean(),
            SchoolClass.find(classFilter).select("_id className department").lean(),
            Student.find(andFilter()).select("_id fullName matricule classId department feesPaid feesDue").lean(),
            User.countDocuments(andFilter({ role: "teacher" })),
        ]);

        const aggregate = aggregateRows[0] || { studentSubjects: [], subjects: [], sequences: [] };
        const subjectMap = new Map(subjects.map((subject) => [String(subject._id), subject]));
        const studentTotals = new Map();
        for (const groupedMark of aggregate.studentSubjects) {
            const subject = subjectMap.get(String(groupedMark._id.subjectId));
            if (!subject) continue;

            const coefficient = Number(subject.coefficient) || 1;
            const studentId = String(groupedMark._id.studentId);
            const studentTotal = studentTotals.get(studentId) || { weightedScore: 0, coefficientTotal: 0 };
            studentTotal.weightedScore += groupedMark.scoreTotal * coefficient;
            studentTotal.coefficientTotal += groupedMark.markCount * coefficient;
            studentTotals.set(studentId, studentTotal);
        }

        const studentLookup = new Map(students.map((student) => [String(student._id), student]));
        const studentAverages = Array.from(studentTotals, ([id, total]) => ({
            id,
            avg: total.coefficientTotal ? total.weightedScore / total.coefficientTotal : 0,
        }));

        const averageByStudent = new Map(studentAverages.map((student) => [student.id, student.avg]));
        const rankedStudents = [...studentAverages].sort((first, second) => second.avg - first.avg);
        const topStudents = [];
        let previousAverage = Number.POSITIVE_INFINITY;
        let previousRank = 0;
        rankedStudents.forEach((entry, index) => {
            if (entry.avg < previousAverage) {
                previousRank = index + 1;
                previousAverage = entry.avg;
            }
            if (index < 7) {
                const student = studentLookup.get(entry.id);
                if (student) {
                    topStudents.push({
                        id: entry.id,
                        avg: entry.avg,
                        rank: previousRank,
                        student: {
                            id: entry.id,
                            fullName: student.fullName,
                            department: student.department,
                            matricule: student.matricule || "",
                        },
                    });
                }
            }
        });

        const classTotals = new Map();
        for (const student of students) {
            const classId = String(student.classId);
            const classTotal = classTotals.get(classId) || { total: 0, count: 0 };
            classTotal.total += averageByStudent.get(String(student._id)) || 0;
            classTotal.count += 1;
            classTotals.set(classId, classTotal);
        }
        const classAverages = classes.map((schoolClass) => {
            const total = classTotals.get(String(schoolClass._id)) || { total: 0, count: 0 };
            return {
                name: `${schoolClass.className.replace("Form ", "F")} ${schoolClass.department || ""}`.trim(),
                avg: total.count ? Math.round((total.total / total.count) * 10) / 10 : 0,
            };
        });

        const subjectAverages = aggregate.subjects.flatMap((total) => {
            const subject = subjectMap.get(String(total._id));
            return subject && total.markCount ? [{
                subjectId: String(subject._id),
                name: `${subject.name} (${subject.code})`,
                average: Math.round((total.scoreTotal / total.markCount) * 10) / 10,
                markCount: total.markCount,
            }] : [];
        });

        const sequenceNumbers = ["1st seq", "2nd seq", "3rd seq", "4th seq", "5th seq", "6th seq"];
        const sequenceMap = new Map(
            aggregate.sequences.map((sequence) => [String(sequence._id), sequence])
        );
        const sequenceAverages = sequenceNumbers.map((sequenceLabel, index) => {
            const key = String(index + 1);
            const total = sequenceMap.get(key) || sequenceMap.get(sequenceLabel);
            return {
                sequence: `Seq ${index + 1}`,
                average: total?.markCount ? Math.round((total.scoreTotal / total.markCount) * 10) / 10 : null,
            };
        });

        const bestClass = [...classAverages].sort((first, second) => second.avg - first.avg)[0] || null;
        const bestSubject = [...subjectAverages].sort((first, second) => second.average - first.average)[0] || null;
        const passRate = studentAverages.length
            ? (studentAverages.filter((student) => student.avg >= 10).length / studentAverages.length) * 100
            : 0;
        const totalFeesPaid = students.reduce((total, student) => total + (Number(student.feesPaid) || 0), 0);
        const totalFeesDue = students.reduce((total, student) => total + (Number(student.feesDue) || 0), 0);

        let aiInsight = "Monitor student performance regularly for the best results.";
        const lowestClass = [...classAverages].sort((first, second) => first.avg - second.avg)[0];
        if (lowestClass?.avg < 10) {
            aiInsight = `${lowestClass.name} shows a low average of ${lowestClass.avg}. Consider remedial classes for this class.`;
        } else if (sequenceAverages.length > 1) {
            const latest = sequenceAverages[sequenceAverages.length - 1].average;
            const previous = sequenceAverages[sequenceAverages.length - 2].average;
            if (latest !== null && previous !== null) {
                aiInsight = latest < previous
                    ? `There's a ${(previous - latest).toFixed(1)} point drop in the latest sequence. Schedule review sessions.`
                    : `Overall performance is trending ${latest > previous ? "upward" : "stable"}. Keep up the good work!`;
            }
        }

        res.status(200).json({
            success: true,
            data: {
                totalStudents: students.length,
                totalTeachers,
                totalClasses: classes.length,
                totalFeesPaid,
                totalFeesDue,
                passRate,
                classAvgs: classAverages,
                bestClass,
                subjectAvgs: subjectAverages.map(({ name, average }) => ({ name, avg: average })),
                bestSubject: bestSubject ? { name: bestSubject.name, avg: bestSubject.average } : null,
                top: topStudents,
                trend: sequenceAverages,
                aiInsight,
            },
        });
    } catch (error) {
        res.status(500).json({
            success: false,
            message: "Error generating dashboard mark summary",
            error: error.message,
        });
    }
});

// GET a single mark by ID
router.get("/marks/:id", async (req, res) => {
    try {
        const { id } = req.params;

        if (!mongoose.Types.ObjectId.isValid(id)) {
            return res.status(400).json({
                success: false,
                message: "Invalid mark ID format"
            });
        }

        const mark = await Mark.findOne({ _id: id, ...sectionFilter(req) });

        if (!mark) {
            return res.status(404).json({
                success: false,
                message: "Mark not found"
            });
        }

        res.status(200).json({
            success: true,
            data: mark
        });
    } catch (error) {
        res.status(500).json({
            success: false,
            message: "Error fetching mark",
            error: error.message
        });
    }
});

// GET marks by student ID
router.get("/marks/student/:studentId", async (req, res) => {
    try {
        const { studentId } = req.params;
        const marks = await Mark.find({ studentId, ...sectionFilter(req) }).sort({ sequence: 1 });

        res.status(200).json({
            success: true,
            count: marks.length,
            data: marks
        });
    } catch (error) {
        res.status(500).json({
            success: false,
            message: "Error fetching marks for student",
            error: error.message
        });
    }
});

// GET marks by subject ID
router.get("/marks/subject/:subjectId", async (req, res) => {
    try {
        const { subjectId } = req.params;
        const marks = await Mark.find({ subjectId, ...sectionFilter(req) }).sort({ studentId: 1 });

        res.status(200).json({
            success: true,
            count: marks.length,
            data: marks
        });
    } catch (error) {
        res.status(500).json({
            success: false,
            message: "Error fetching marks for subject",
            error: error.message
        });
    }
});

// GET marks by class ID
router.get("/marks/class/:classId", async (req, res) => {
    try {
        const { classId } = req.params;
        const marks = await Mark.find({ classId, ...sectionFilter(req) }).sort({ studentId: 1, sequence: 1 });

        res.status(200).json({
            success: true,
            count: marks.length,
            data: marks
        });
    } catch (error) {
        res.status(500).json({
            success: false,
            message: "Error fetching marks for class",
            error: error.message
        });
    }
});

// GET marks by academic year
router.get("/marks/academic-year/:academicyear", async (req, res) => {
    try {
        const { academicyear } = req.params;
        const marks = await Mark.find({ academicyear, ...sectionFilter(req) });

        res.status(200).json({
            success: true,
            count: marks.length,
            data: marks
        });
    } catch (error) {
        res.status(500).json({
            success: false,
            message: "Error fetching marks by academic year",
            error: error.message
        });
    }
});

// GET marks by student and subject (for a specific student's performance in a subject)
router.get("/marks/student/:studentId/subject/:subjectId", async (req, res) => {
    try {
        const { studentId, subjectId } = req.params;
        const marks = await Mark.find({ studentId, subjectId, ...sectionFilter(req) }).sort({ sequence: 1 });

        res.status(200).json({
            success: true,
            count: marks.length,
            data: marks
        });
    } catch (error) {
        res.status(500).json({
            success: false,
            message: "Error fetching marks",
            error: error.message
        });
    }
});

// GET marks by student, subject, and sequence (specific mark)
router.get("/marks/student/:studentId/subject/:subjectId/sequence/:sequence", async (req, res) => {
    try {
        const { studentId, subjectId, sequence } = req.params;
        const mark = await Mark.findOne({ studentId, subjectId, sequence, ...sectionFilter(req) });

        if (!mark) {
            return res.status(404).json({
                success: false,
                message: "Mark not found for this student, subject, and sequence"
            });
        }

        res.status(200).json({
            success: true,
            data: mark
        });
    } catch (error) {
        res.status(500).json({
            success: false,
            message: "Error fetching mark",
            error: error.message
        });
    }
});

// GET marks by recorded by (teacher/admin)
router.get("/marks/recorded-by/:recordedBy", async (req, res) => {
    try {
        const { recordedBy } = req.params;
        const marks = await Mark.find({ recordedBy, ...sectionFilter(req) });

        res.status(200).json({
            success: true,
            count: marks.length,
            data: marks
        });
    } catch (error) {
        res.status(500).json({
            success: false,
            message: "Error fetching marks recorded by user",
            error: error.message
        });
    }
});

// GET summary statistics for a student
router.get("/marks/student/:studentId/summary", async (req, res) => {
    try {
        const { studentId } = req.params;
        const marks = await Mark.find({ studentId, ...sectionFilter(req) });

        if (marks.length === 0) {
            return res.status(404).json({
                success: false,
                message: "No marks found for this student"
            });
        }

        // Calculate statistics
        const scores = marks.map(m => m.score);
        const average = scores.reduce((a, b) => a + b, 0) / scores.length;
        const highest = Math.max(...scores);
        const lowest = Math.min(...scores);

        // Group by subject
        const subjects = {};
        marks.forEach(mark => {
            if (!subjects[mark.subjectId]) {
                subjects[mark.subjectId] = {
                    subjectId: mark.subjectId,
                    scores: [],
                    sequences: []
                };
            }
            subjects[mark.subjectId].scores.push(mark.score);
            subjects[mark.subjectId].sequences.push(mark.sequence);
        });

        // Calculate subject averages
        const subjectAverages = {};
        Object.keys(subjects).forEach(subjectId => {
            const subjectData = subjects[subjectId];
            subjectAverages[subjectId] = {
                subjectId: subjectId,
                average: subjectData.scores.reduce((a, b) => a + b, 0) / subjectData.scores.length,
                highest: Math.max(...subjectData.scores),
                lowest: Math.min(...subjectData.scores),
                count: subjectData.scores.length,
                sequences: subjectData.sequences
            };
        });

        res.status(200).json({
            success: true,
            data: {
                studentId,
                totalMarks: marks.length,
                overallAverage: average,
                overallHighest: highest,
                overallLowest: lowest,
                subjects: subjectAverages,
                allMarks: marks
            }
        });
    } catch (error) {
        res.status(500).json({
            success: false,
            message: "Error generating student summary",
            error: error.message
        });
    }
});

// ==================== POST ROUTES ====================

// POST - Create a new mark (single)
router.post("/marks", async (req, res) => {
    try {
        const activeSection = normalizeSchoolSection(req.get("x-school-section") || req.body.section || "englophone", "englophone");
        const markData = { ...req.body, section: activeSection };

        // Check if mark already exists for this student, subject, and sequence
        const existingMark = await Mark.findOne({
            studentId: markData.studentId,
            subjectId: markData.subjectId,
            sequence: markData.sequence,
            academicyear: markData.academicyear,
            section: activeSection
        });

        if (existingMark) {
            return res.status(400).json({
                success: false,
                message: "Mark already exists for this student, subject, and sequence in the academic year"
            });
        }

        const mark = new Mark(markData);
        await mark.save();

        res.status(201).json({
            success: true,
            message: "Mark created successfully",
            data: mark
        });
    } catch (error) {
        if (error.name === "ValidationError") {
            const errors = Object.values(error.errors).map(err => err.message);
            return res.status(400).json({
                success: false,
                message: "Validation error",
                errors: errors
            });
        }

        res.status(500).json({
            success: false,
            message: "Error creating mark",
            error: error.message
        });
    }
});

// POST - Create multiple marks (bulk insert)
router.post("/marks/bulk", async (req, res) => {
    try {
        const activeSection = normalizeSchoolSection(req.get("x-school-section") || "englophone", "englophone");
        const marksData = Array.isArray(req.body)
            ? req.body.map((mark) => ({ ...mark, section: activeSection }))
            : req.body;

        if (!Array.isArray(marksData)) {
            return res.status(400).json({
                success: false,
                message: "Expected an array of marks"
            });
        }

        // Validate each mark
        const validationErrors = [];
        const validMarks = [];

        marksData.forEach((mark, index) => {
            // Check for required fields
            const requiredFields = ['studentId', 'subjectId', 'classId', 'sequence', 'academicyear', 'score', 'recordedBy'];
            const missingFields = requiredFields.filter(field => !mark[field]);

            if (missingFields.length > 0) {
                validationErrors.push({
                    index,
                    mark,
                    error: `Missing required fields: ${missingFields.join(', ')}`
                });
            } else {
                validMarks.push(mark);
            }
        });

        if (validationErrors.length > 0) {
            return res.status(400).json({
                success: false,
                message: "Validation errors in some marks",
                errors: validationErrors
            });
        }

        // Check for duplicates within the bulk data
        const duplicateCheck = {};
        const duplicates = [];
        validMarks.forEach((mark, index) => {
            const key = `${mark.studentId}_${mark.subjectId}_${mark.sequence}_${mark.academicyear}_${activeSection}`;
            if (duplicateCheck[key] !== undefined) {
                duplicates.push({
                    index,
                    mark,
                    duplicateWith: duplicateCheck[key]
                });
            } else {
                duplicateCheck[key] = index;
            }
        });

        if (duplicates.length > 0) {
            return res.status(400).json({
                success: false,
                message: "Duplicate marks found in bulk data",
                duplicates
            });
        }

        // Check for existing marks in database
        const existingMarks = await Mark.find({
            $or: validMarks.map(mark => ({
                studentId: mark.studentId,
                subjectId: mark.subjectId,
                sequence: mark.sequence,
                academicyear: mark.academicyear,
                section: activeSection
            }))
        });

        if (existingMarks.length > 0) {
            return res.status(400).json({
                success: false,
                message: "Some marks already exist in the database",
                existingMarks: existingMarks.map(m => ({
                    studentId: m.studentId,
                    subjectId: m.subjectId,
                    sequence: m.sequence,
                    academicyear: m.academicyear
                }))
            });
        }

        const createdMarks = await Mark.insertMany(validMarks);

        res.status(201).json({
            success: true,
            message: `${createdMarks.length} marks created successfully`,
            data: createdMarks
        });
    } catch (error) {
        res.status(500).json({
            success: false,
            message: "Error creating marks in bulk",
            error: error.message
        });
    }
});

// ==================== PUT ROUTES ====================

// PUT - Update an entire mark
router.put("/marks/:id", async (req, res) => {
    try {
        const { id } = req.params;
        const markData = req.body;

        if (!mongoose.Types.ObjectId.isValid(id)) {
            return res.status(400).json({
                success: false,
                message: "Invalid mark ID format"
            });
        }

        const existingMark = await Mark.findById(id);
        if (!existingMark) {
            return res.status(404).json({
                success: false,
                message: "Mark not found"
            });
        }

        // Check for duplicate if studentId, subjectId, sequence, or academicyear is changing
        if (markData.studentId || markData.subjectId || markData.sequence || markData.academicyear) {
            const checkFields = {
                studentId: markData.studentId || existingMark.studentId,
                subjectId: markData.subjectId || existingMark.subjectId,
                sequence: markData.sequence || existingMark.sequence,
                academicyear: markData.academicyear || existingMark.academicyear
            };

            const duplicateCheck = await Mark.findOne({
                _id: { $ne: id },
                studentId: checkFields.studentId,
                subjectId: checkFields.subjectId,
                sequence: checkFields.sequence,
                academicyear: checkFields.academicyear
            });

            if (duplicateCheck) {
                return res.status(400).json({
                    success: false,
                    message: "Another mark already exists for this student, subject, sequence, and academic year"
                });
            }
        }

        const updatedMark = await Mark.findByIdAndUpdate(
            id,
            markData,
            {
                new: true,
                runValidators: true
            }
        );

        res.status(200).json({
            success: true,
            message: "Mark updated successfully",
            data: updatedMark
        });
    } catch (error) {
        if (error.name === "ValidationError") {
            const errors = Object.values(error.errors).map(err => err.message);
            return res.status(400).json({
                success: false,
                message: "Validation error",
                errors: errors
            });
        }

        res.status(500).json({
            success: false,
            message: "Error updating mark",
            error: error.message
        });
    }
});

// ==================== PATCH ROUTES ====================

// PATCH - Partially update a mark (e.g., update only score)
router.patch("/marks/:id", async (req, res) => {
    try {
        const { id } = req.params;
        const markData = req.body;

        if (!mongoose.Types.ObjectId.isValid(id)) {
            return res.status(400).json({
                success: false,
                message: "Invalid mark ID format"
            });
        }

        const existingMark = await Mark.findById(id);
        if (!existingMark) {
            return res.status(404).json({
                success: false,
                message: "Mark not found"
            });
        }

        // Check for duplicate if studentId, subjectId, sequence, or academicyear is changing
        if (markData.studentId || markData.subjectId || markData.sequence || markData.academicyear) {
            const checkFields = {
                studentId: markData.studentId || existingMark.studentId,
                subjectId: markData.subjectId || existingMark.subjectId,
                sequence: markData.sequence || existingMark.sequence,
                academicyear: markData.academicyear || existingMark.academicyear
            };

            const duplicateCheck = await Mark.findOne({
                _id: { $ne: id },
                studentId: checkFields.studentId,
                subjectId: checkFields.subjectId,
                sequence: checkFields.sequence,
                academicyear: checkFields.academicyear
            });

            if (duplicateCheck) {
                return res.status(400).json({
                    success: false,
                    message: "Another mark already exists for this student, subject, sequence, and academic year"
                });
            }
        }

        const updatedMark = await Mark.findByIdAndUpdate(
            id,
            markData,
            {
                new: true,
                runValidators: true
            }
        );

        res.status(200).json({
            success: true,
            message: "Mark updated successfully",
            data: updatedMark
        });
    } catch (error) {
        if (error.name === "ValidationError") {
            const errors = Object.values(error.errors).map(err => err.message);
            return res.status(400).json({
                success: false,
                message: "Validation error",
                errors: errors
            });
        }

        res.status(500).json({
            success: false,
            message: "Error updating mark",
            error: error.message
        });
    }
});

// ==================== DELETE ROUTES ====================

// DELETE - Delete a mark
router.delete("/marks/:id", async (req, res) => {
    try {
        const { id } = req.params;

        if (!mongoose.Types.ObjectId.isValid(id)) {
            return res.status(400).json({
                success: false,
                message: "Invalid mark ID format"
            });
        }

        const mark = await Mark.findById(id);
        if (!mark) {
            return res.status(404).json({
                success: false,
                message: "Mark not found"
            });
        }

        await Mark.findByIdAndDelete(id);

        res.status(200).json({
            success: true,
            message: "Mark deleted successfully",
            data: mark
        });
    } catch (error) {
        res.status(500).json({
            success: false,
            message: "Error deleting mark",
            error: error.message
        });
    }
});

// DELETE - Delete all marks for a student (DISABLED: bulk wipe removed to protect data)
// router.delete("/marks/student/:studentId", ...) has been removed.

// DELETE - Delete all marks for a subject (DISABLED: bulk wipe removed to protect data)
// router.delete("/marks/subject/:subjectId", ...) has been removed.

// DELETE - Delete all marks for a class (DISABLED: bulk wipe removed to protect data)
// router.delete("/marks/class/:classId", ...) has been removed.

// DELETE - Delete all marks for a specific sequence (DISABLED: bulk wipe removed to protect data)
// router.delete("/marks/sequence/:sequence/academic-year/:academicyear", ...) has been removed.

// DELETE - Delete all marks (DISABLED: bulk wipe removed to protect data)
// router.delete("/marks", ...) has been removed.

export default router;