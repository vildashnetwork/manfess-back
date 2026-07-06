import express from "express";
import mongoose from "mongoose";
import Subject from "../models/Subject.js"; // Adjust the path as needed

const router = express.Router();

// ==================== GET ROUTES ====================

// GET all subjects
router.get("/subjects", async (req, res) => {
    try {
        const subjects = await Subject.find().sort({ name: 1 });
        res.status(200).json({
            success: true,
            count: subjects.length,
            data: subjects
        });
    } catch (error) {
        res.status(500).json({
            success: false,
            message: "Error fetching subjects",
            error: error.message
        });
    }
});

// GET a single subject by ID
router.get("/subjects/:id", async (req, res) => {
    try {
        const { id } = req.params;

        if (!mongoose.Types.ObjectId.isValid(id)) {
            return res.status(400).json({
                success: false,
                message: "Invalid subject ID format"
            });
        }

        const subject = await Subject.findById(id);

        if (!subject) {
            return res.status(404).json({
                success: false,
                message: "Subject not found"
            });
        }

        res.status(200).json({
            success: true,
            data: subject
        });
    } catch (error) {
        res.status(500).json({
            success: false,
            message: "Error fetching subject",
            error: error.message
        });
    }
});

// GET subject by code
router.get("/subjects/code/:code", async (req, res) => {
    try {
        const { code } = req.params;
        const subject = await Subject.findOne({ code });

        if (!subject) {
            return res.status(404).json({
                success: false,
                message: "Subject not found with this code"
            });
        }

        res.status(200).json({
            success: true,
            data: subject
        });
    } catch (error) {
        res.status(500).json({
            success: false,
            message: "Error fetching subject by code",
            error: error.message
        });
    }
});

// GET subjects by cycle
router.get("/subjects/cycle/:cycle", async (req, res) => {
    try {
        const { cycle } = req.params;
        const subjects = await Subject.find({ cycle }).sort({ name: 1 });

        res.status(200).json({
            success: true,
            count: subjects.length,
            data: subjects
        });
    } catch (error) {
        res.status(500).json({
            success: false,
            message: "Error fetching subjects by cycle",
            error: error.message
        });
    }
});

// GET subjects by class ID
router.get("/subjects/class/:classId", async (req, res) => {
    try {
        const { classId } = req.params;
        const subjects = await Subject.find({ classIds: classId }).sort({ name: 1 });

        res.status(200).json({
            success: true,
            count: subjects.length,
            data: subjects
        });
    } catch (error) {
        res.status(500).json({
            success: false,
            message: "Error fetching subjects by class",
            error: error.message
        });
    }
});

// GET subjects by teacher ID
router.get("/subjects/teacher/:teacherId", async (req, res) => {
    try {
        const { teacherId } = req.params;
        const subjects = await Subject.find({ teacherIds: teacherId }).sort({ name: 1 });

        res.status(200).json({
            success: true,
            count: subjects.length,
            data: subjects
        });
    } catch (error) {
        res.status(500).json({
            success: false,
            message: "Error fetching subjects by teacher",
            error: error.message
        });
    }
});

// GET subjects with high coefficient (e.g., coefficient >= 3)
router.get("/subjects/high-coefficient/:minCoefficient", async (req, res) => {
    try {
        const { minCoefficient } = req.params;
        const subjects = await Subject.find({
            coefficient: { $gte: parseInt(minCoefficient) }
        }).sort({ coefficient: -1 });

        res.status(200).json({
            success: true,
            count: subjects.length,
            data: subjects
        });
    } catch (error) {
        res.status(500).json({
            success: false,
            message: "Error fetching subjects by coefficient",
            error: error.message
        });
    }
});

// GET subjects by multiple class IDs (bulk query)
router.post("/subjects/classes", async (req, res) => {
    try {
        const { classIds } = req.body;

        if (!classIds || !Array.isArray(classIds) || classIds.length === 0) {
            return res.status(400).json({
                success: false,
                message: "Please provide an array of class IDs"
            });
        }

        const subjects = await Subject.find({
            classIds: { $in: classIds }
        }).sort({ name: 1 });

        res.status(200).json({
            success: true,
            count: subjects.length,
            data: subjects
        });
    } catch (error) {
        res.status(500).json({
            success: false,
            message: "Error fetching subjects for classes",
            error: error.message
        });
    }
});

// GET subjects by multiple teacher IDs
router.post("/subjects/teachers", async (req, res) => {
    try {
        const { teacherIds } = req.body;

        if (!teacherIds || !Array.isArray(teacherIds) || teacherIds.length === 0) {
            return res.status(400).json({
                success: false,
                message: "Please provide an array of teacher IDs"
            });
        }

        const subjects = await Subject.find({
            teacherIds: { $in: teacherIds }
        }).sort({ name: 1 });

        res.status(200).json({
            success: true,
            count: subjects.length,
            data: subjects
        });
    } catch (error) {
        res.status(500).json({
            success: false,
            message: "Error fetching subjects for teachers",
            error: error.message
        });
    }
});

// GET search subjects by name
router.get("/subjects/search/:name", async (req, res) => {
    try {
        const { name } = req.params;
        const subjects = await Subject.find({
            name: { $regex: name, $options: 'i' } // Case-insensitive search
        }).sort({ name: 1 });

        res.status(200).json({
            success: true,
            count: subjects.length,
            data: subjects
        });
    } catch (error) {
        res.status(500).json({
            success: false,
            message: "Error searching subjects",
            error: error.message
        });
    }
});

// GET summary statistics for subjects
router.get("/subjects/stats/summary", async (req, res) => {
    try {
        const subjects = await Subject.find();

        // Count by cycle
        const cycleCount = {};
        subjects.forEach(subject => {
            cycleCount[subject.cycle] = (cycleCount[subject.cycle] || 0) + 1;
        });

        // Average coefficient
        const totalCoefficient = subjects.reduce((sum, subject) => sum + subject.coefficient, 0);
        const avgCoefficient = subjects.length > 0 ? totalCoefficient / subjects.length : 0;

        // Count total classes assigned
        const totalClassAssignments = subjects.reduce((sum, subject) => sum + subject.classIds.length, 0);
        const totalTeacherAssignments = subjects.reduce((sum, subject) => sum + subject.teacherIds.length, 0);

        // Subjects with most classes
        const sortedByClasses = [...subjects].sort((a, b) => b.classIds.length - a.classIds.length);
        const topSubjects = sortedByClasses.slice(0, 5).map(s => ({
            name: s.name,
            code: s.code,
            classCount: s.classIds.length
        }));

        res.status(200).json({
            success: true,
            data: {
                totalSubjects: subjects.length,
                cycleDistribution: cycleCount,
                averageCoefficient: avgCoefficient,
                totalClassAssignments,
                totalTeacherAssignments,
                subjectsWithMostClasses: topSubjects
            }
        });
    } catch (error) {
        res.status(500).json({
            success: false,
            message: "Error fetching subject statistics",
            error: error.message
        });
    }
});

// ==================== POST ROUTES ====================

// POST - Create a new subject
router.post("/subjects", async (req, res) => {
    try {
        const subjectData = req.body;

        // Check if subject code already exists
        const existingSubject = await Subject.findOne({ code: subjectData.code });
        if (existingSubject) {
            return res.status(400).json({
                success: false,
                message: "Subject with this code already exists"
            });
        }


        const subject = new Subject(subjectData);
        await subject.save();

        res.status(201).json({
            success: true,
            message: "Subject created successfully",
            data: subject
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
            message: "Error creating subject",
            error: error.message
        });
    }
});

// POST - Create multiple subjects (bulk insert)
router.post("/subjects/bulk", async (req, res) => {
    try {
        const subjectsData = req.body;

        if (!Array.isArray(subjectsData)) {
            return res.status(400).json({
                success: false,
                message: "Expected an array of subjects"
            });
        }

        // Validate each subject
        const validationErrors = [];
        const validSubjects = [];
        const codes = [];

        subjectsData.forEach((subject, index) => {
            const requiredFields = ['name', 'code', 'coefficient', 'cycle', 'classIds', 'teacherIds'];
            const missingFields = requiredFields.filter(field => !subject[field]);

            if (missingFields.length > 0) {
                validationErrors.push({
                    index,
                    subject,
                    error: `Missing required fields: ${missingFields.join(', ')}`
                });
            } else {
                validSubjects.push(subject);
                codes.push(subject.code);
            }
        });

        if (validationErrors.length > 0) {
            return res.status(400).json({
                success: false,
                message: "Validation errors in some subjects",
                errors: validationErrors
            });
        }

        // Check for duplicate codes within the bulk data
        const codeSet = new Set();
        const duplicateCodes = [];
        codes.forEach((code, index) => {
            if (codeSet.has(code)) {
                duplicateCodes.push({
                    index,
                    code,
                    duplicate: true
                });
            } else {
                codeSet.add(code);
            }
        });

        if (duplicateCodes.length > 0) {
            return res.status(400).json({
                success: false,
                message: "Duplicate subject codes found in bulk data",
                duplicates: duplicateCodes
            });
        }

        // Check for existing codes in database
        const existingSubjects = await Subject.find({
            code: { $in: codes }
        });

        if (existingSubjects.length > 0) {
            return res.status(400).json({
                success: false,
                message: "Some subject codes already exist in the database",
                existingCodes: existingSubjects.map(s => s.code)
            });
        }

        const createdSubjects = await Subject.insertMany(validSubjects);

        res.status(201).json({
            success: true,
            message: `${createdSubjects.length} subjects created successfully`,
            data: createdSubjects
        });
    } catch (error) {
        res.status(500).json({
            success: false,
            message: "Error creating subjects in bulk",
            error: error.message
        });
    }
});

// POST - Add classes to a subject
router.post("/subjects/:id/add-classes", async (req, res) => {
    try {
        const { id } = req.params;
        const { classIds } = req.body;

        if (!mongoose.Types.ObjectId.isValid(id)) {
            return res.status(400).json({
                success: false,
                message: "Invalid subject ID format"
            });
        }

        if (!classIds || !Array.isArray(classIds) || classIds.length === 0) {
            return res.status(400).json({
                success: false,
                message: "Please provide an array of class IDs"
            });
        }

        const subject = await Subject.findById(id);
        if (!subject) {
            return res.status(404).json({
                success: false,
                message: "Subject not found"
            });
        }

        // Add classes without duplicates
        const newClassIds = classIds.filter(classId => !subject.classIds.includes(classId));

        if (newClassIds.length === 0) {
            return res.status(400).json({
                success: false,
                message: "All provided classes are already assigned to this subject"
            });
        }

        subject.classIds = [...subject.classIds, ...newClassIds];
        await subject.save();

        res.status(200).json({
            success: true,
            message: `${newClassIds.length} classes added to subject`,
            data: subject
        });
    } catch (error) {
        res.status(500).json({
            success: false,
            message: "Error adding classes to subject",
            error: error.message
        });
    }
});

// POST - Add teachers to a subject
router.post("/subjects/:id/add-teachers", async (req, res) => {
    try {
        const { id } = req.params;
        const { teacherIds } = req.body;

        if (!mongoose.Types.ObjectId.isValid(id)) {
            return res.status(400).json({
                success: false,
                message: "Invalid subject ID format"
            });
        }

        if (!teacherIds || !Array.isArray(teacherIds) || teacherIds.length === 0) {
            return res.status(400).json({
                success: false,
                message: "Please provide an array of teacher IDs"
            });
        }

        const subject = await Subject.findById(id);
        if (!subject) {
            return res.status(404).json({
                success: false,
                message: "Subject not found"
            });
        }

        // Add teachers without duplicates
        const newTeacherIds = teacherIds.filter(teacherId => !subject.teacherIds.includes(teacherId));

        if (newTeacherIds.length === 0) {
            return res.status(400).json({
                success: false,
                message: "All provided teachers are already assigned to this subject"
            });
        }

        subject.teacherIds = [...subject.teacherIds, ...newTeacherIds];
        await subject.save();

        res.status(200).json({
            success: true,
            message: `${newTeacherIds.length} teachers added to subject`,
            data: subject
        });
    } catch (error) {
        res.status(500).json({
            success: false,
            message: "Error adding teachers to subject",
            error: error.message
        });
    }
});

// ==================== PUT ROUTES ====================

// PUT - Update an entire subject
router.put("/subjects/:id", async (req, res) => {
    try {
        const { id } = req.params;
        const subjectData = req.body;

        if (!mongoose.Types.ObjectId.isValid(id)) {
            return res.status(400).json({
                success: false,
                message: "Invalid subject ID format"
            });
        }

        const existingSubject = await Subject.findById(id);
        if (!existingSubject) {
            return res.status(404).json({
                success: false,
                message: "Subject not found"
            });
        }

        // Check for duplicate code (excluding current subject)
        if (subjectData.code && subjectData.code !== existingSubject.code) {
            const duplicateCode = await Subject.findOne({
                code: subjectData.code,
                _id: { $ne: id }
            });
            if (duplicateCode) {
                return res.status(400).json({
                    success: false,
                    message: "Another subject with this code already exists"
                });
            }
        }

        // Check for duplicate name (excluding current subject)
        if (subjectData.name && subjectData.name !== existingSubject.name) {
            const duplicateName = await Subject.findOne({
                name: subjectData.name,
                _id: { $ne: id }
            });
            if (duplicateName) {
                return res.status(400).json({
                    success: false,
                    message: "Another subject with this name already exists"
                });
            }
        }

        const updatedSubject = await Subject.findByIdAndUpdate(
            id,
            subjectData,
            {
                new: true,
                runValidators: true
            }
        );

        res.status(200).json({
            success: true,
            message: "Subject updated successfully",
            data: updatedSubject
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
            message: "Error updating subject",
            error: error.message
        });
    }
});

// ==================== PATCH ROUTES ====================

// PATCH - Partially update a subject
router.patch("/subjects/:id", async (req, res) => {
    try {
        const { id } = req.params;
        const subjectData = req.body;

        if (!mongoose.Types.ObjectId.isValid(id)) {
            return res.status(400).json({
                success: false,
                message: "Invalid subject ID format"
            });
        }

        const existingSubject = await Subject.findById(id);
        if (!existingSubject) {
            return res.status(404).json({
                success: false,
                message: "Subject not found"
            });
        }

        // Check for duplicate code if code is being updated
        if (subjectData.code && subjectData.code !== existingSubject.code) {
            const duplicateCode = await Subject.findOne({
                code: subjectData.code,
                _id: { $ne: id }
            });
            if (duplicateCode) {
                return res.status(400).json({
                    success: false,
                    message: "Another subject with this code already exists"
                });
            }
        }

        // Check for duplicate name if name is being updated
        if (subjectData.name && subjectData.name !== existingSubject.name) {
            const duplicateName = await Subject.findOne({
                name: subjectData.name,
                _id: { $ne: id }
            });
            if (duplicateName) {
                return res.status(400).json({
                    success: false,
                    message: "Another subject with this name already exists"
                });
            }
        }

        const updatedSubject = await Subject.findByIdAndUpdate(
            id,
            subjectData,
            {
                new: true,
                runValidators: true
            }
        );

        res.status(200).json({
            success: true,
            message: "Subject updated successfully",
            data: updatedSubject
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
            message: "Error updating subject",
            error: error.message
        });
    }
});

// PATCH - Remove classes from a subject
router.patch("/subjects/:id/remove-classes", async (req, res) => {
    try {
        const { id } = req.params;
        const { classIds } = req.body;

        if (!mongoose.Types.ObjectId.isValid(id)) {
            return res.status(400).json({
                success: false,
                message: "Invalid subject ID format"
            });
        }

        if (!classIds || !Array.isArray(classIds) || classIds.length === 0) {
            return res.status(400).json({
                success: false,
                message: "Please provide an array of class IDs to remove"
            });
        }

        const subject = await Subject.findById(id);
        if (!subject) {
            return res.status(404).json({
                success: false,
                message: "Subject not found"
            });
        }

        // Remove the specified classes
        subject.classIds = subject.classIds.filter(
            classId => !classIds.includes(classId)
        );

        await subject.save();

        res.status(200).json({
            success: true,
            message: `${classIds.length} classes removed from subject`,
            data: subject
        });
    } catch (error) {
        res.status(500).json({
            success: false,
            message: "Error removing classes from subject",
            error: error.message
        });
    }
});

// PATCH - Remove teachers from a subject
router.patch("/subjects/:id/remove-teachers", async (req, res) => {
    try {
        const { id } = req.params;
        const { teacherIds } = req.body;

        if (!mongoose.Types.ObjectId.isValid(id)) {
            return res.status(400).json({
                success: false,
                message: "Invalid subject ID format"
            });
        }

        if (!teacherIds || !Array.isArray(teacherIds) || teacherIds.length === 0) {
            return res.status(400).json({
                success: false,
                message: "Please provide an array of teacher IDs to remove"
            });
        }

        const subject = await Subject.findById(id);
        if (!subject) {
            return res.status(404).json({
                success: false,
                message: "Subject not found"
            });
        }

        // Remove the specified teachers
        subject.teacherIds = subject.teacherIds.filter(
            teacherId => !teacherIds.includes(teacherId)
        );

        await subject.save();

        res.status(200).json({
            success: true,
            message: `${teacherIds.length} teachers removed from subject`,
            data: subject
        });
    } catch (error) {
        res.status(500).json({
            success: false,
            message: "Error removing teachers from subject",
            error: error.message
        });
    }
});

// ==================== DELETE ROUTES ====================

// DELETE - Delete a subject
router.delete("/subjects/:id", async (req, res) => {
    try {
        const { id } = req.params;

        if (!mongoose.Types.ObjectId.isValid(id)) {
            return res.status(400).json({
                success: false,
                message: "Invalid subject ID format"
            });
        }

        const subject = await Subject.findById(id);
        if (!subject) {
            return res.status(404).json({
                success: false,
                message: "Subject not found"
            });
        }

        await Subject.findByIdAndDelete(id);

        res.status(200).json({
            success: true,
            message: "Subject deleted successfully",
            data: subject
        });
    } catch (error) {
        res.status(500).json({
            success: false,
            message: "Error deleting subject",
            error: error.message
        });
    }
});

// DELETE - Delete all subjects for a cycle
router.delete("/subjects/cycle/:cycle", async (req, res) => {
    try {
        const { cycle } = req.params;
        const result = await Subject.deleteMany({ cycle });

        if (result.deletedCount === 0) {
            return res.status(404).json({
                success: false,
                message: "No subjects found for this cycle"
            });
        }

        res.status(200).json({
            success: true,
            message: `${result.deletedCount} subjects deleted for cycle ${cycle}`,
            deletedCount: result.deletedCount
        });
    } catch (error) {
        res.status(500).json({
            success: false,
            message: "Error deleting subjects by cycle",
            error: error.message
        });
    }
});

// DELETE - Remove a specific class from all subjects
router.delete("/subjects/class/:classId", async (req, res) => {
    try {
        const { classId } = req.params;
        const result = await Subject.updateMany(
            { classIds: classId },
            { $pull: { classIds: classId } }
        );

        res.status(200).json({
            success: true,
            message: `Class ${classId} removed from ${result.modifiedCount} subjects`,
            modifiedCount: result.modifiedCount
        });
    } catch (error) {
        res.status(500).json({
            success: false,
            message: "Error removing class from subjects",
            error: error.message
        });
    }
});

// DELETE - Remove a specific teacher from all subjects
router.delete("/subjects/teacher/:teacherId", async (req, res) => {
    try {
        const { teacherId } = req.params;
        const result = await Subject.updateMany(
            { teacherIds: teacherId },
            { $pull: { teacherIds: teacherId } }
        );

        res.status(200).json({
            success: true,
            message: `Teacher ${teacherId} removed from ${result.modifiedCount} subjects`,
            modifiedCount: result.modifiedCount
        });
    } catch (error) {
        res.status(500).json({
            success: false,
            message: "Error removing teacher from subjects",
            error: error.message
        });
    }
});

// DELETE - Delete all subjects (use with extreme caution)
router.delete("/subjects", async (req, res) => {
    try {
        // Add authorization check in production
        const result = await Subject.deleteMany({});

        res.status(200).json({
            success: true,
            message: `${result.deletedCount} subjects deleted successfully`,
            deletedCount: result.deletedCount
        });
    } catch (error) {
        res.status(500).json({
            success: false,
            message: "Error deleting all subjects",
            error: error.message
        });
    }
});

export default router;