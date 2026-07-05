import express from "express";
import mongoose from "mongoose";
import Mark from "../models/Mark.js"; // Adjust the path as needed

const router = express.Router();

// ==================== GET ROUTES ====================

// GET all marks
router.get("/marks", async (req, res) => {
    try {
        const marks = await Mark.find().sort({ createdAt: -1 });
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

        const mark = await Mark.findById(id);

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
        const marks = await Mark.find({ studentId }).sort({ sequence: 1 });

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
        const marks = await Mark.find({ subjectId }).sort({ studentId: 1 });

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
        const marks = await Mark.find({ classId }).sort({ studentId: 1, sequence: 1 });

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
        const marks = await Mark.find({ academicyear });

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
        const marks = await Mark.find({ studentId, subjectId }).sort({ sequence: 1 });

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
        const mark = await Mark.findOne({ studentId, subjectId, sequence });

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
        const marks = await Mark.find({ recordedBy });

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
        const marks = await Mark.find({ studentId });

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
        const markData = req.body;

        // Check if mark already exists for this student, subject, and sequence
        const existingMark = await Mark.findOne({
            studentId: markData.studentId,
            subjectId: markData.subjectId,
            sequence: markData.sequence,
            academicyear: markData.academicyear
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
        const marksData = req.body;

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
            const key = `${mark.studentId}_${mark.subjectId}_${mark.sequence}_${mark.academicyear}`;
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
                academicyear: mark.academicyear
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

// DELETE - Delete all marks for a student
router.delete("/marks/student/:studentId", async (req, res) => {
    try {
        const { studentId } = req.params;
        const result = await Mark.deleteMany({ studentId });

        if (result.deletedCount === 0) {
            return res.status(404).json({
                success: false,
                message: "No marks found for this student"
            });
        }

        res.status(200).json({
            success: true,
            message: `${result.deletedCount} marks deleted for student ${studentId}`,
            deletedCount: result.deletedCount
        });
    } catch (error) {
        res.status(500).json({
            success: false,
            message: "Error deleting student marks",
            error: error.message
        });
    }
});

// DELETE - Delete all marks for a subject
router.delete("/marks/subject/:subjectId", async (req, res) => {
    try {
        const { subjectId } = req.params;
        const result = await Mark.deleteMany({ subjectId });

        if (result.deletedCount === 0) {
            return res.status(404).json({
                success: false,
                message: "No marks found for this subject"
            });
        }

        res.status(200).json({
            success: true,
            message: `${result.deletedCount} marks deleted for subject ${subjectId}`,
            deletedCount: result.deletedCount
        });
    } catch (error) {
        res.status(500).json({
            success: false,
            message: "Error deleting subject marks",
            error: error.message
        });
    }
});

// DELETE - Delete all marks for a class
router.delete("/marks/class/:classId", async (req, res) => {
    try {
        const { classId } = req.params;
        const result = await Mark.deleteMany({ classId });

        if (result.deletedCount === 0) {
            return res.status(404).json({
                success: false,
                message: "No marks found for this class"
            });
        }

        res.status(200).json({
            success: true,
            message: `${result.deletedCount} marks deleted for class ${classId}`,
            deletedCount: result.deletedCount
        });
    } catch (error) {
        res.status(500).json({
            success: false,
            message: "Error deleting class marks",
            error: error.message
        });
    }
});

// DELETE - Delete all marks for a specific sequence
router.delete("/marks/sequence/:sequence/academic-year/:academicyear", async (req, res) => {
    try {
        const { sequence, academicyear } = req.params;
        const result = await Mark.deleteMany({ sequence, academicyear });

        if (result.deletedCount === 0) {
            return res.status(404).json({
                success: false,
                message: "No marks found for this sequence and academic year"
            });
        }

        res.status(200).json({
            success: true,
            message: `${result.deletedCount} marks deleted for sequence ${sequence} in ${academicyear}`,
            deletedCount: result.deletedCount
        });
    } catch (error) {
        res.status(500).json({
            success: false,
            message: "Error deleting sequence marks",
            error: error.message
        });
    }
});

// DELETE - Delete all marks (use with extreme caution)
router.delete("/marks", async (req, res) => {
    try {
        // Add authorization check in production
        const result = await Mark.deleteMany({});

        res.status(200).json({
            success: true,
            message: `${result.deletedCount} marks deleted successfully`,
            deletedCount: result.deletedCount
        });
    } catch (error) {
        res.status(500).json({
            success: false,
            message: "Error deleting all marks",
            error: error.message
        });
    }
});

export default router;