import express from "express";
import mongoose from "mongoose";
import SchoolClass from "../models/SchoolClass.js";
import { buildInclusiveSectionFilter } from "../utils/schoolSection.js";

const router = express.Router();

const sectionFilter = (req) => buildInclusiveSectionFilter(req, "schoolSection");
const isClassLevelAllowed = (className, section) => {
    void section;
    return ["Form 1", "Form 2", "Form 3", "Form 4", "Form 5", "Lower 6th", "Upper 6th", "Graduated"].includes(className);
};

// ==================== GET ROUTES ====================

// Get all classes
router.get("/classes", async (req, res) => {
    try {
        const filter = sectionFilter(req);
        const records = await SchoolClass.find(filter).sort({ className: 1 }).lean();
        const classes = records.map((schoolClass) => ({
            ...schoolClass,
            fullName: [schoolClass.className, schoolClass.department, schoolClass.section].filter(Boolean).join(" ")
        }));
        res.status(200).json({
            success: true,
            count: classes.length,
            data: classes
        });
    } catch (error) {
        console.error('Error:', error);
        res.status(500).json({
            success: false,
            message: error.message || 'Internal server error'
        });
    }
});

// Get single class
router.get("/classes/:id", async (req, res) => {
    try {
        const { id } = req.params;

        if (!mongoose.Types.ObjectId.isValid(id)) {
            return res.status(400).json({
                success: false,
                message: "Invalid ID format"
            });
        }

        const schoolClass = await SchoolClass.findOne({ _id: id, ...sectionFilter(req) });
        if (!schoolClass) {
            return res.status(404).json({
                success: false,
                message: "Class not found"
            });
        }

        res.status(200).json({
            success: true,
            data: schoolClass
        });
    } catch (error) {
        console.error('Error:', error);
        res.status(500).json({
            success: false,
            message: error.message || 'Internal server error'
        });
    }
});

// Get classes by department
router.get("/classes/department/:department", async (req, res) => {
    try {
        const classes = await SchoolClass.find({ department: req.params.department, ...sectionFilter(req) });
        res.status(200).json({
            success: true,
            count: classes.length,
            data: classes
        });
    } catch (error) {
        console.error('Error:', error);
        res.status(500).json({
            success: false,
            message: error.message || 'Internal server error'
        });
    }
});

// Get classes by cycle
router.get("/classes/cycle/:cycle", async (req, res) => {
    try {
        const classes = await SchoolClass.find({ cycle: req.params.cycle, ...sectionFilter(req) });
        res.status(200).json({
            success: true,
            count: classes.length,
            data: classes
        });
    } catch (error) {
        console.error('Error:', error);
        res.status(500).json({
            success: false,
            message: error.message || 'Internal server error'
        });
    }
});

// Get classes by academic year
router.get("/classes/academic-year/:acedemicYear", async (req, res) => {
    try {
        const classes = await SchoolClass.find({ acedemicYear: req.params.acedemicYear, ...sectionFilter(req) });
        res.status(200).json({
            success: true,
            count: classes.length,
            data: classes
        });
    } catch (error) {
        console.error('Error:', error);
        res.status(500).json({
            success: false,
            message: error.message || 'Internal server error'
        });
    }
});

// Get classes by class master
router.get("/classes/master/:classMasterId", async (req, res) => {
    try {
        const classes = await SchoolClass.find({ classMasterId: req.params.classMasterId, ...sectionFilter(req) });
        res.status(200).json({
            success: true,
            count: classes.length,
            data: classes
        });
    } catch (error) {
        console.error('Error:', error);
        res.status(500).json({
            success: false,
            message: error.message || 'Internal server error'
        });
    }
});

// Get class statistics
router.get("/classes/stats", async (req, res) => {
    try {
        const classes = await SchoolClass.find(sectionFilter(req));
        const stats = {
            total: classes.length,
            byDepartment: {},
            byCycle: {},
            byYear: {}
        };

        classes.forEach(cls => {
            stats.byDepartment[cls.department] = (stats.byDepartment[cls.department] || 0) + 1;
            stats.byCycle[cls.cycle] = (stats.byCycle[cls.cycle] || 0) + 1;
            stats.byYear[cls.acedemicYear] = (stats.byYear[cls.acedemicYear] || 0) + 1;
        });

        res.status(200).json({
            success: true,
            data: stats
        });
    } catch (error) {
        console.error('Error:', error);
        res.status(500).json({
            success: false,
            message: error.message || 'Internal server error'
        });
    }
});

// ==================== POST ROUTES ====================

// Create a class
router.post("/classes", async (req, res) => {
    try {
        const classData = req.body;

        classData.schoolSection = normalizeSchoolSection(classData.schoolSection || req.get("x-school-section") || 'englophone', 'englophone');
        if (!isClassLevelAllowed(classData.className, classData.schoolSection)) {
            return res.status(400).json({ success: false, message: "Class level does not belong to the selected school section" });
        }

        // Handle academicYear to acedemicYear mapping
        if (classData.academicYear && !classData.acedemicYear) {
            classData.acedemicYear = classData.academicYear;
            delete classData.academicYear;
        }

        // Check required fields
        const required = ['className', 'department', 'cycle', 'acedemicYear'];
        const missing = required.filter(field => !classData[field] || classData[field].trim() === '');

        if (missing.length > 0) {
            return res.status(400).json({
                success: false,
                message: `Missing required fields: ${missing.join(', ')}`,
                missing
            });
        }

        if (classData.className !== "Graduated" && Number(classData.tuitionFee) <= 0) {
            return res.status(400).json({ success: false, message: "Tuition fee must be greater than zero" });
        }
        if (!Number.isInteger(Number(classData.tuitionInstallments)) || Number(classData.tuitionInstallments) < 1 || Number(classData.tuitionInstallments) > 12) {
            return res.status(400).json({ success: false, message: "Tuition installments must be between 1 and 12" });
        }
        if (classData.registrationFeeRequired && Number(classData.registrationFeeAmount) <= 0) {
            return res.status(400).json({ success: false, message: "Registration fee amount must be greater than zero when required" });
        }

        // Trim all string fields
        Object.keys(classData).forEach(key => {
            if (typeof classData[key] === 'string') {
                classData[key] = classData[key].trim();
            }
        });

        // Check if class exists
        const existing = await SchoolClass.findOne({
            className: classData.className,
            department: classData.department,
            acedemicYear: classData.acedemicYear,
            schoolSection: classData.schoolSection || 'englophone'
        });

        if (existing) {
            return res.status(409).json({
                success: false,
                message: "Class already exists with this name, department, and academic year"
            });
        }

        const schoolClass = new SchoolClass(classData);
        await schoolClass.save();

        res.status(201).json({
            success: true,
            message: "Class created successfully",
            data: schoolClass
        });
    } catch (error) {
        console.error('Error:', error);

        // Handle validation errors
        if (error.name === 'ValidationError') {
            const errors = Object.values(error.errors).map(err => err.message);
            return res.status(400).json({
                success: false,
                message: 'Validation error',
                errors: errors
            });
        }

        // Handle duplicate key errors
        if (error.code === 11000) {
            const field = Object.keys(error.keyPattern)[0];
            return res.status(409).json({
                success: false,
                message: `Duplicate value for ${field}. Please use a unique value.`
            });
        }

        res.status(500).json({
            success: false,
            message: error.message || 'Internal server error'
        });
    }
});

// ==================== PUT ROUTE ====================

// Update a class
router.put("/classes/:id", async (req, res) => {
    try {
        const { id } = req.params;
        let classData = req.body;

        // Validate ID
        if (!mongoose.Types.ObjectId.isValid(id)) {
            return res.status(400).json({
                success: false,
                message: "Invalid ID format"
            });
        }

        // Handle academicYear to acedemicYear mapping
        if (classData.academicYear && !classData.acedemicYear) {
            classData.acedemicYear = classData.academicYear;
            delete classData.academicYear;
        }

        // Check if class exists
        const existing = await SchoolClass.findById(id);
        if (!existing) {
            return res.status(404).json({
                success: false,
                message: "Class not found"
            });
        }

        const resultingClassName = classData.className || existing.className;
        const resultingSection = classData.schoolSection || existing.schoolSection || "englophone";
        if (!isClassLevelAllowed(resultingClassName, resultingSection)) {
            return res.status(400).json({ success: false, message: "Class level does not belong to the selected school section" });
        }
        const resultingTuitionFee = classData.tuitionFee ?? existing.tuitionFee;
        const resultingInstallments = classData.tuitionInstallments ?? existing.tuitionInstallments;
        const resultingRegistrationRequired = classData.registrationFeeRequired ?? existing.registrationFeeRequired;
        const resultingRegistrationAmount = classData.registrationFeeAmount ?? existing.registrationFeeAmount;
        if (resultingClassName !== "Graduated" && Number(resultingTuitionFee) <= 0) {
            return res.status(400).json({ success: false, message: "Tuition fee must be greater than zero" });
        }
        if (!Number.isInteger(Number(resultingInstallments)) || Number(resultingInstallments) < 1 || Number(resultingInstallments) > 12) {
            return res.status(400).json({ success: false, message: "Tuition installments must be between 1 and 12" });
        }
        if (resultingRegistrationRequired && Number(resultingRegistrationAmount) <= 0) {
            return res.status(400).json({ success: false, message: "Registration fee amount must be greater than zero when required" });
        }

        // Trim all string fields
        Object.keys(classData).forEach(key => {
            if (typeof classData[key] === 'string') {
                classData[key] = classData[key].trim();
            }
        });

        // Check for duplicate
        if (classData.className || classData.department || classData.acedemicYear) {
            const duplicate = await SchoolClass.findOne({
                _id: { $ne: id },
                className: classData.className || existing.className,
                department: classData.department || existing.department,
                acedemicYear: classData.acedemicYear || existing.acedemicYear,
                schoolSection: classData.schoolSection || existing.schoolSection || 'englophone'
            });

            if (duplicate) {
                return res.status(409).json({
                    success: false,
                    message: "Another class already exists with this name, department, and academic year"
                });
            }
        }

        const updated = await SchoolClass.findByIdAndUpdate(id, classData, {
            new: true,
            runValidators: true
        });

        res.status(200).json({
            success: true,
            message: "Class updated successfully",
            data: updated
        });
    } catch (error) {
        console.error('Error:', error);

        if (error.name === 'ValidationError') {
            const errors = Object.values(error.errors).map(err => err.message);
            return res.status(400).json({
                success: false,
                message: 'Validation error',
                errors: errors
            });
        }

        res.status(500).json({
            success: false,
            message: error.message || 'Internal server error'
        });
    }
});

// ==================== PATCH ROUTE ====================

// Partial update
router.patch("/classes/:id", async (req, res) => {
    try {
        const { id } = req.params;
        let classData = req.body;

        // Validate ID
        if (!mongoose.Types.ObjectId.isValid(id)) {
            return res.status(400).json({
                success: false,
                message: "Invalid ID format"
            });
        }

        // Handle academicYear to acedemicYear mapping
        if (classData.academicYear && !classData.acedemicYear) {
            classData.acedemicYear = classData.academicYear;
            delete classData.academicYear;
        }

        const existing = await SchoolClass.findById(id);
        if (!existing) {
            return res.status(404).json({
                success: false,
                message: "Class not found"
            });
        }

        const resultingClassName = classData.className || existing.className;
        const resultingSection = classData.schoolSection || existing.schoolSection || "englophone";
        if (!isClassLevelAllowed(resultingClassName, resultingSection)) {
            return res.status(400).json({ success: false, message: "Class level does not belong to the selected school section" });
        }

        // Trim string fields
        Object.keys(classData).forEach(key => {
            if (typeof classData[key] === 'string') {
                classData[key] = classData[key].trim();
            }
        });

        // Check for duplicate
        if (classData.className || classData.department || classData.acedemicYear) {
            const duplicate = await SchoolClass.findOne({
                _id: { $ne: id },
                className: classData.className || existing.className,
                department: classData.department || existing.department,
                acedemicYear: classData.acedemicYear || existing.acedemicYear,
                schoolSection: classData.schoolSection || existing.schoolSection || 'englophone'
            });

            if (duplicate) {
                return res.status(409).json({
                    success: false,
                    message: "Another class already exists with this name, department, and academic year"
                });
            }
        }

        const updated = await SchoolClass.findByIdAndUpdate(id, classData, {
            new: true,
            runValidators: true
        });

        res.status(200).json({
            success: true,
            message: "Class updated successfully",
            data: updated
        });
    } catch (error) {
        console.error('Error:', error);

        if (error.name === 'ValidationError') {
            const errors = Object.values(error.errors).map(err => err.message);
            return res.status(400).json({
                success: false,
                message: 'Validation error',
                errors: errors
            });
        }

        res.status(500).json({
            success: false,
            message: error.message || 'Internal server error'
        });
    }
});

// Assign class master
router.patch("/classes/:id/assign-master", async (req, res) => {
    try {
        const { id } = req.params;
        const { classMasterId } = req.body;

        // Validate ID
        if (!mongoose.Types.ObjectId.isValid(id)) {
            return res.status(400).json({
                success: false,
                message: "Invalid ID format"
            });
        }

        if (!classMasterId) {
            return res.status(400).json({
                success: false,
                message: "classMasterId is required"
            });
        }

        const schoolClass = await SchoolClass.findById(id);
        if (!schoolClass) {
            return res.status(404).json({
                success: false,
                message: "Class not found"
            });
        }

        schoolClass.classMasterId = classMasterId;
        await schoolClass.save();

        res.status(200).json({
            success: true,
            message: "Class master assigned successfully",
            data: schoolClass
        });
    } catch (error) {
        console.error('Error:', error);
        res.status(500).json({
            success: false,
            message: error.message || 'Internal server error'
        });
    }
});

// ==================== DELETE ROUTES ====================

// Delete a class
router.delete("/classes/:id", async (req, res) => {
    try {
        const { id } = req.params;

        // Validate ID
        if (!mongoose.Types.ObjectId.isValid(id)) {
            return res.status(400).json({
                success: false,
                message: "Invalid ID format"
            });
        }

        const schoolClass = await SchoolClass.findById(id);
        if (!schoolClass) {
            return res.status(404).json({
                success: false,
                message: "Class not found"
            });
        }

        await SchoolClass.findByIdAndDelete(id);

        res.status(200).json({
            success: true,
            message: "Class deleted successfully",
            data: schoolClass
        });
    } catch (error) {
        console.error('Error:', error);
        res.status(500).json({
            success: false,
            message: error.message || 'Internal server error'
        });
    }
});

// Delete classes by academic year (DISABLED: bulk wipe removed to protect data)
// router.delete("/classes/academic-year/:acedemicYear", ...) has been removed.

// Remove class master
router.delete("/classes/:id/remove-master", async (req, res) => {
    try {
        const { id } = req.params;

        // Validate ID
        if (!mongoose.Types.ObjectId.isValid(id)) {
            return res.status(400).json({
                success: false,
                message: "Invalid ID format"
            });
        }

        const schoolClass = await SchoolClass.findById(id);
        if (!schoolClass) {
            return res.status(404).json({
                success: false,
                message: "Class not found"
            });
        }

        schoolClass.classMasterId = "";
        await schoolClass.save();

        res.status(200).json({
            success: true,
            message: "Class master removed successfully",
            data: schoolClass
        });
    } catch (error) {
        console.error('Error:', error);
        res.status(500).json({
            success: false,
            message: error.message || 'Internal server error'
        });
    }
});

export default router;