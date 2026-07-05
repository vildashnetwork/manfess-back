import express from "express";
import mongoose from "mongoose";
import SchoolClass from "../models/SchoolClass.js"; // Adjust the path as needed

const router = express.Router();

// ==================== GET ROUTES ====================

// GET all classes
router.get("/classes", async (req, res) => {
    try {
        const classes = await SchoolClass.find().sort({ className: 1, department: 1 });
        res.status(200).json({
            success: true,
            count: classes.length,
            data: classes
        });
    } catch (error) {
        res.status(500).json({
            success: false,
            message: "Error fetching classes",
            error: error.message
        });
    }
});

// GET a single class by ID
router.get("/classes/:id", async (req, res) => {
    try {
        const { id } = req.params;

        if (!mongoose.Types.ObjectId.isValid(id)) {
            return res.status(400).json({
                success: false,
                message: "Invalid class ID format"
            });
        }

        const schoolClass = await SchoolClass.findById(id);

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
        res.status(500).json({
            success: false,
            message: "Error fetching class",
            error: error.message
        });
    }
});

// GET classes by className (Form)
router.get("/classes/name/:className", async (req, res) => {
    try {
        const { className } = req.params;
        const classes = await SchoolClass.find({ className }).sort({ department: 1 });

        if (classes.length === 0) {
            return res.status(404).json({
                success: false,
                message: `No classes found with name: ${className}`
            });
        }

        res.status(200).json({
            success: true,
            count: classes.length,
            data: classes
        });
    } catch (error) {
        res.status(500).json({
            success: false,
            message: "Error fetching classes by name",
            error: error.message
        });
    }
});

// GET classes by department
router.get("/classes/department/:department", async (req, res) => {
    try {
        const { department } = req.params;
        const classes = await SchoolClass.find({ department }).sort({ className: 1 });

        res.status(200).json({
            success: true,
            count: classes.length,
            data: classes
        });
    } catch (error) {
        res.status(500).json({
            success: false,
            message: "Error fetching classes by department",
            error: error.message
        });
    }
});

// GET classes by cycle
router.get("/classes/cycle/:cycle", async (req, res) => {
    try {
        const { cycle } = req.params;
        const classes = await SchoolClass.find({ cycle }).sort({ className: 1 });

        res.status(200).json({
            success: true,
            count: classes.length,
            data: classes
        });
    } catch (error) {
        res.status(500).json({
            success: false,
            message: "Error fetching classes by cycle",
            error: error.message
        });
    }
});

// GET classes by academic year
router.get("/classes/academic-year/:acedemicYear", async (req, res) => {
    try {
        const { acedemicYear } = req.params;
        const classes = await SchoolClass.find({ acedemicYear }).sort({ className: 1, department: 1 });

        res.status(200).json({
            success: true,
            count: classes.length,
            data: classes
        });
    } catch (error) {
        res.status(500).json({
            success: false,
            message: "Error fetching classes by academic year",
            error: error.message
        });
    }
});

// GET classes by class master
router.get("/classes/master/:classMasterId", async (req, res) => {
    try {
        const { classMasterId } = req.params;
        const classes = await SchoolClass.find({ classMasterId });

        res.status(200).json({
            success: true,
            count: classes.length,
            data: classes
        });
    } catch (error) {
        res.status(500).json({
            success: false,
            message: "Error fetching classes by class master",
            error: error.message
        });
    }
});

// GET classes by department and cycle
router.get("/classes/department/:department/cycle/:cycle", async (req, res) => {
    try {
        const { department, cycle } = req.params;
        const classes = await SchoolClass.find({ department, cycle }).sort({ className: 1 });

        res.status(200).json({
            success: true,
            count: classes.length,
            data: classes
        });
    } catch (error) {
        res.status(500).json({
            success: false,
            message: "Error fetching classes by department and cycle",
            error: error.message
        });
    }
});

// GET current academic year classes
router.get("/classes/current-year", async (req, res) => {
    try {
        // You can set the current year dynamically or get it from request
        const currentYear = new Date().getFullYear();
        const academicYear = `${currentYear}-${currentYear + 1}`;

        const classes = await SchoolClass.find({ acedemicYear: academicYear }).sort({ className: 1 });

        res.status(200).json({
            success: true,
            count: classes.length,
            data: classes
        });
    } catch (error) {
        res.status(500).json({
            success: false,
            message: "Error fetching current year classes",
            error: error.message
        });
    }
});

// GET class statistics
router.get("/classes/stats/summary", async (req, res) => {
    try {
        const classes = await SchoolClass.find();

        // Count by className
        const classNameCount = {};
        classes.forEach(cls => {
            classNameCount[cls.className] = (classNameCount[cls.className] || 0) + 1;
        });

        // Count by department
        const departmentCount = {};
        classes.forEach(cls => {
            departmentCount[cls.department] = (departmentCount[cls.department] || 0) + 1;
        });

        // Count by cycle
        const cycleCount = {};
        classes.forEach(cls => {
            cycleCount[cls.cycle] = (cycleCount[cls.cycle] || 0) + 1;
        });

        // Count by academic year
        const yearCount = {};
        classes.forEach(cls => {
            yearCount[cls.acedemicYear] = (yearCount[cls.acedemicYear] || 0) + 1;
        });

        res.status(200).json({
            success: true,
            data: {
                totalClasses: classes.length,
                classDistribution: classNameCount,
                departmentDistribution: departmentCount,
                cycleDistribution: cycleCount,
                academicYearDistribution: yearCount
            }
        });
    } catch (error) {
        res.status(500).json({
            success: false,
            message: "Error fetching class statistics",
            error: error.message
        });
    }
});

// GET available class names (enum values)
router.get("/classes/enum/class-names", async (req, res) => {
    try {
        const classNames = ["Form 1", "Form 2", "Form 3", "Form 4", "Form 5", "Lower 6th", "Upper 6th", "Graduated"];
        res.status(200).json({
            success: true,
            data: classNames
        });
    } catch (error) {
        res.status(500).json({
            success: false,
            message: "Error fetching class name options",
            error: error.message
        });
    }
});

// GET classes with no class master assigned (classMasterId is empty or null)
router.get("/classes/no-master", async (req, res) => {
    try {
        const classes = await SchoolClass.find({
            $or: [
                { classMasterId: null },
                { classMasterId: "" }
            ]
        });

        res.status(200).json({
            success: true,
            count: classes.length,
            data: classes
        });
    } catch (error) {
        res.status(500).json({
            success: false,
            message: "Error fetching classes without master",
            error: error.message
        });
    }
});

// ==================== POST ROUTES ====================

// POST - Create a new class
router.post("/classes", async (req, res) => {
    try {
        const classData = req.body;

        // Check if class already exists with same className, department, and academic year
        const existingClass = await SchoolClass.findOne({
            className: classData.className,
            department: classData.department,
            acedemicYear: classData.acedemicYear
        });

        if (existingClass) {
            return res.status(400).json({
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
            message: "Error creating class",
            error: error.message
        });
    }
});

// POST - Create multiple classes (bulk insert)
router.post("/classes/bulk", async (req, res) => {
    try {
        const classesData = req.body;

        if (!Array.isArray(classesData)) {
            return res.status(400).json({
                success: false,
                message: "Expected an array of classes"
            });
        }

        // Validate each class
        const validationErrors = [];
        const validClasses = [];
        const classKeys = new Set();

        classesData.forEach((cls, index) => {
            const requiredFields = ['className', 'department', 'cycle', 'acedemicYear', 'classMasterId'];
            const missingFields = requiredFields.filter(field => !cls[field]);

            if (missingFields.length > 0) {
                validationErrors.push({
                    index,
                    class: cls,
                    error: `Missing required fields: ${missingFields.join(', ')}`
                });
            } else {
                // Check for duplicates within bulk data
                const key = `${cls.className}_${cls.department}_${cls.acedemicYear}`;
                if (classKeys.has(key)) {
                    validationErrors.push({
                        index,
                        class: cls,
                        error: "Duplicate class entry in bulk data"
                    });
                } else {
                    classKeys.add(key);
                    validClasses.push(cls);
                }
            }
        });

        if (validationErrors.length > 0) {
            return res.status(400).json({
                success: false,
                message: "Validation errors in some classes",
                errors: validationErrors
            });
        }

        // Check for existing classes in database
        const existingClasses = await SchoolClass.find({
            $or: validClasses.map(cls => ({
                className: cls.className,
                department: cls.department,
                acedemicYear: cls.acedemicYear
            }))
        });

        if (existingClasses.length > 0) {
            return res.status(400).json({
                success: false,
                message: "Some classes already exist in the database",
                existingClasses: existingClasses.map(c => ({
                    className: c.className,
                    department: c.department,
                    acedemicYear: c.acedemicYear
                }))
            });
        }

        const createdClasses = await SchoolClass.insertMany(validClasses);

        res.status(201).json({
            success: true,
            message: `${createdClasses.length} classes created successfully`,
            data: createdClasses
        });
    } catch (error) {
        res.status(500).json({
            success: false,
            message: "Error creating classes in bulk",
            error: error.message
        });
    }
});

// ==================== PUT ROUTES ====================

// PUT - Update an entire class
router.put("/classes/:id", async (req, res) => {
    try {
        const { id } = req.params;
        const classData = req.body;

        if (!mongoose.Types.ObjectId.isValid(id)) {
            return res.status(400).json({
                success: false,
                message: "Invalid class ID format"
            });
        }

        const existingClass = await SchoolClass.findById(id);
        if (!existingClass) {
            return res.status(404).json({
                success: false,
                message: "Class not found"
            });
        }

        // Check for duplicate if className, department, or academicYear is changing
        if (classData.className || classData.department || classData.acedemicYear) {
            const checkFields = {
                className: classData.className || existingClass.className,
                department: classData.department || existingClass.department,
                acedemicYear: classData.acedemicYear || existingClass.acedemicYear
            };

            const duplicateCheck = await SchoolClass.findOne({
                _id: { $ne: id },
                className: checkFields.className,
                department: checkFields.department,
                acedemicYear: checkFields.acedemicYear
            });

            if (duplicateCheck) {
                return res.status(400).json({
                    success: false,
                    message: "Another class already exists with this name, department, and academic year"
                });
            }
        }

        const updatedClass = await SchoolClass.findByIdAndUpdate(
            id,
            classData,
            {
                new: true,
                runValidators: true
            }
        );

        res.status(200).json({
            success: true,
            message: "Class updated successfully",
            data: updatedClass
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
            message: "Error updating class",
            error: error.message
        });
    }
});

// ==================== PATCH ROUTES ====================

// PATCH - Partially update a class
router.patch("/classes/:id", async (req, res) => {
    try {
        const { id } = req.params;
        const classData = req.body;

        if (!mongoose.Types.ObjectId.isValid(id)) {
            return res.status(400).json({
                success: false,
                message: "Invalid class ID format"
            });
        }

        const existingClass = await SchoolClass.findById(id);
        if (!existingClass) {
            return res.status(404).json({
                success: false,
                message: "Class not found"
            });
        }

        // Check for duplicate if className, department, or academicYear is changing
        if (classData.className || classData.department || classData.acedemicYear) {
            const checkFields = {
                className: classData.className || existingClass.className,
                department: classData.department || existingClass.department,
                acedemicYear: classData.acedemicYear || existingClass.acedemicYear
            };

            const duplicateCheck = await SchoolClass.findOne({
                _id: { $ne: id },
                className: checkFields.className,
                department: checkFields.department,
                acedemicYear: checkFields.acedemicYear
            });

            if (duplicateCheck) {
                return res.status(400).json({
                    success: false,
                    message: "Another class already exists with this name, department, and academic year"
                });
            }
        }

        const updatedClass = await SchoolClass.findByIdAndUpdate(
            id,
            classData,
            {
                new: true,
                runValidators: true
            }
        );

        res.status(200).json({
            success: true,
            message: "Class updated successfully",
            data: updatedClass
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
            message: "Error updating class",
            error: error.message
        });
    }
});

// PATCH - Update class master
router.patch("/classes/:id/assign-master", async (req, res) => {
    try {
        const { id } = req.params;
        const { classMasterId } = req.body;

        if (!mongoose.Types.ObjectId.isValid(id)) {
            return res.status(400).json({
                success: false,
                message: "Invalid class ID format"
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
        res.status(500).json({
            success: false,
            message: "Error assigning class master",
            error: error.message
        });
    }
});

// PATCH - Update academic year for a class
router.patch("/classes/:id/update-year", async (req, res) => {
    try {
        const { id } = req.params;
        const { acedemicYear } = req.body;

        if (!mongoose.Types.ObjectId.isValid(id)) {
            return res.status(400).json({
                success: false,
                message: "Invalid class ID format"
            });
        }

        if (!acedemicYear) {
            return res.status(400).json({
                success: false,
                message: "acedemicYear is required"
            });
        }

        const schoolClass = await SchoolClass.findById(id);
        if (!schoolClass) {
            return res.status(404).json({
                success: false,
                message: "Class not found"
            });
        }

        // Check if another class exists with same className, department, and new academic year
        const duplicateCheck = await SchoolClass.findOne({
            _id: { $ne: id },
            className: schoolClass.className,
            department: schoolClass.department,
            acedemicYear: acedemicYear
        });

        if (duplicateCheck) {
            return res.status(400).json({
                success: false,
                message: "Another class already exists with this name, department, and academic year"
            });
        }

        schoolClass.acedemicYear = acedemicYear;
        await schoolClass.save();

        res.status(200).json({
            success: true,
            message: "Academic year updated successfully",
            data: schoolClass
        });
    } catch (error) {
        res.status(500).json({
            success: false,
            message: "Error updating academic year",
            error: error.message
        });
    }
});

// ==================== DELETE ROUTES ====================

// DELETE - Delete a class
router.delete("/classes/:id", async (req, res) => {
    try {
        const { id } = req.params;

        if (!mongoose.Types.ObjectId.isValid(id)) {
            return res.status(400).json({
                success: false,
                message: "Invalid class ID format"
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
        res.status(500).json({
            success: false,
            message: "Error deleting class",
            error: error.message
        });
    }
});

// DELETE - Delete all classes for a specific academic year
router.delete("/classes/academic-year/:acedemicYear", async (req, res) => {
    try {
        const { acedemicYear } = req.params;
        const result = await SchoolClass.deleteMany({ acedemicYear });

        if (result.deletedCount === 0) {
            return res.status(404).json({
                success: false,
                message: "No classes found for this academic year"
            });
        }

        res.status(200).json({
            success: true,
            message: `${result.deletedCount} classes deleted for academic year ${acedemicYear}`,
            deletedCount: result.deletedCount
        });
    } catch (error) {
        res.status(500).json({
            success: false,
            message: "Error deleting classes by academic year",
            error: error.message
        });
    }
});

// DELETE - Delete all classes for a specific department
router.delete("/classes/department/:department", async (req, res) => {
    try {
        const { department } = req.params;
        const result = await SchoolClass.deleteMany({ department });

        if (result.deletedCount === 0) {
            return res.status(404).json({
                success: false,
                message: "No classes found for this department"
            });
        }

        res.status(200).json({
            success: true,
            message: `${result.deletedCount} classes deleted for department ${department}`,
            deletedCount: result.deletedCount
        });
    } catch (error) {
        res.status(500).json({
            success: false,
            message: "Error deleting classes by department",
            error: error.message
        });
    }
});

// DELETE - Delete all classes for a specific cycle
router.delete("/classes/cycle/:cycle", async (req, res) => {
    try {
        const { cycle } = req.params;
        const result = await SchoolClass.deleteMany({ cycle });

        if (result.deletedCount === 0) {
            return res.status(404).json({
                success: false,
                message: "No classes found for this cycle"
            });
        }

        res.status(200).json({
            success: true,
            message: `${result.deletedCount} classes deleted for cycle ${cycle}`,
            deletedCount: result.deletedCount
        });
    } catch (error) {
        res.status(500).json({
            success: false,
            message: "Error deleting classes by cycle",
            error: error.message
        });
    }
});

// DELETE - Remove class master from a class
router.delete("/classes/:id/remove-master", async (req, res) => {
    try {
        const { id } = req.params;

        if (!mongoose.Types.ObjectId.isValid(id)) {
            return res.status(400).json({
                success: false,
                message: "Invalid class ID format"
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
        res.status(500).json({
            success: false,
            message: "Error removing class master",
            error: error.message
        });
    }
});

// DELETE - Delete all classes (use with extreme caution)
router.delete("/classes", async (req, res) => {
    try {
        // Add authorization check in production
        const result = await SchoolClass.deleteMany({});

        res.status(200).json({
            success: true,
            message: `${result.deletedCount} classes deleted successfully`,
            deletedCount: result.deletedCount
        });
    } catch (error) {
        res.status(500).json({
            success: false,
            message: "Error deleting all classes",
            error: error.message
        });
    }
});

export default router;