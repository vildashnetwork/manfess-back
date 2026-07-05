import express from "express";
import mongoose from "mongoose";
import Student from "../models/Students.js"; // Adjust the path as needed

const router = express.Router();

// ==================== GET ROUTES ====================

// GET all students
router.get("/students", async (req, res) => {
    try {
        const students = await Student.find().sort({ fullName: 1 });
        res.status(200).json({
            success: true,
            count: students.length,
            data: students
        });
    } catch (error) {
        res.status(500).json({
            success: false,
            message: "Error fetching students",
            error: error.message
        });
    }
});

// GET a single student by ID
router.get("/students/:id", async (req, res) => {
    try {
        const { id } = req.params;

        if (!mongoose.Types.ObjectId.isValid(id)) {
            return res.status(400).json({
                success: false,
                message: "Invalid student ID format"
            });
        }

        const student = await Student.findById(id);

        if (!student) {
            return res.status(404).json({
                success: false,
                message: "Student not found"
            });
        }

        res.status(200).json({
            success: true,
            data: student
        });
    } catch (error) {
        res.status(500).json({
            success: false,
            message: "Error fetching student",
            error: error.message
        });
    }
});

// GET students by gender
router.get("/students/gender/:gender", async (req, res) => {
    try {
        const { gender } = req.params;
        const students = await Student.find({ gender }).sort({ fullName: 1 });

        res.status(200).json({
            success: true,
            count: students.length,
            data: students
        });
    } catch (error) {
        res.status(500).json({
            success: false,
            message: "Error fetching students by gender",
            error: error.message
        });
    }
});

// GET students by class ID
router.get("/students/class/:classId", async (req, res) => {
    try {
        const { classId } = req.params;
        const students = await Student.find({ classId }).sort({ fullName: 1 });

        res.status(200).json({
            success: true,
            count: students.length,
            data: students
        });
    } catch (error) {
        res.status(500).json({
            success: false,
            message: "Error fetching students by class",
            error: error.message
        });
    }
});

// GET students by department
router.get("/students/department/:department", async (req, res) => {
    try {
        const { department } = req.params;
        const students = await Student.find({ department }).sort({ fullName: 1 });

        res.status(200).json({
            success: true,
            count: students.length,
            data: students
        });
    } catch (error) {
        res.status(500).json({
            success: false,
            message: "Error fetching students by department",
            error: error.message
        });
    }
});

// GET students by parent phone
router.get("/students/parent-phone/:parentPhone", async (req, res) => {
    try {
        const { parentPhone } = req.params;
        const students = await Student.find({ parentPhone });

        res.status(200).json({
            success: true,
            count: students.length,
            data: students
        });
    } catch (error) {
        res.status(500).json({
            success: false,
            message: "Error fetching students by parent phone",
            error: error.message
        });
    }
});

// GET students by registration date
router.get("/students/registration-date/:registrationDate", async (req, res) => {
    try {
        const { registrationDate } = req.params;
        const students = await Student.find({ registrationDate });

        res.status(200).json({
            success: true,
            count: students.length,
            data: students
        });
    } catch (error) {
        res.status(500).json({
            success: false,
            message: "Error fetching students by registration date",
            error: error.message
        });
    }
});

// GET students with fees paid above a certain amount
router.get("/students/fees-paid-above/:amount", async (req, res) => {
    try {
        const { amount } = req.params;
        const students = await Student.find({
            feesPaid: { $gte: parseFloat(amount) }
        }).sort({ feesPaid: -1 });

        res.status(200).json({
            success: true,
            count: students.length,
            data: students
        });
    } catch (error) {
        res.status(500).json({
            success: false,
            message: "Error fetching students by fees paid",
            error: error.message
        });
    }
});

// GET students with fees due above a certain amount
router.get("/students/fees-due-above/:amount", async (req, res) => {
    try {
        const { amount } = req.params;
        const students = await Student.find({
            feesDue: { $gte: parseFloat(amount) }
        }).sort({ feesDue: -1 });

        res.status(200).json({
            success: true,
            count: students.length,
            data: students
        });
    } catch (error) {
        res.status(500).json({
            success: false,
            message: "Error fetching students by fees due",
            error: error.message
        });
    }
});

// GET students with outstanding fees (feesDue > 0)
router.get("/students/outstanding-fees", async (req, res) => {
    try {
        const students = await Student.find({
            feesDue: { $gt: 0 }
        }).sort({ feesDue: -1 });

        res.status(200).json({
            success: true,
            count: students.length,
            data: students
        });
    } catch (error) {
        res.status(500).json({
            success: false,
            message: "Error fetching students with outstanding fees",
            error: error.message
        });
    }
});

// GET students with fully paid fees (feesDue = 0)
router.get("/students/fully-paid", async (req, res) => {
    try {
        const students = await Student.find({
            feesDue: 0
        }).sort({ fullName: 1 });

        res.status(200).json({
            success: true,
            count: students.length,
            data: students
        });
    } catch (error) {
        res.status(500).json({
            success: false,
            message: "Error fetching students with fully paid fees",
            error: error.message
        });
    }
});

// GET students by class and department
router.get("/students/class/:classId/department/:department", async (req, res) => {
    try {
        const { classId, department } = req.params;
        const students = await Student.find({ classId, department }).sort({ fullName: 1 });

        res.status(200).json({
            success: true,
            count: students.length,
            data: students
        });
    } catch (error) {
        res.status(500).json({
            success: false,
            message: "Error fetching students by class and department",
            error: error.message
        });
    }
});

// GET search students by name (case-insensitive)
router.get("/students/search/:name", async (req, res) => {
    try {
        const { name } = req.params;
        const students = await Student.find({
            fullName: { $regex: name, $options: 'i' }
        }).sort({ fullName: 1 });

        res.status(200).json({
            success: true,
            count: students.length,
            data: students
        });
    } catch (error) {
        res.status(500).json({
            success: false,
            message: "Error searching students",
            error: error.message
        });
    }
});

// GET search students by parent name (case-insensitive)
router.get("/students/search-parent/:parentName", async (req, res) => {
    try {
        const { parentName } = req.params;
        const students = await Student.find({
            parentName: { $regex: parentName, $options: 'i' }
        }).sort({ parentName: 1 });

        res.status(200).json({
            success: true,
            count: students.length,
            data: students
        });
    } catch (error) {
        res.status(500).json({
            success: false,
            message: "Error searching students by parent name",
            error: error.message
        });
    }
});

// GET student statistics
router.get("/students/stats/summary", async (req, res) => {
    try {
        const students = await Student.find();

        // Count by gender
        const genderCount = {
            male: 0,
            female: 0
        };
        students.forEach(student => {
            if (student.gender === 'male') genderCount.male++;
            else if (student.gender === 'female') genderCount.female++;
        });

        // Count by class
        const classCount = {};
        students.forEach(student => {
            classCount[student.classId] = (classCount[student.classId] || 0) + 1;
        });

        // Count by department
        const departmentCount = {};
        students.forEach(student => {
            departmentCount[student.department] = (departmentCount[student.department] || 0) + 1;
        });

        // Fee statistics
        const totalFeesPaid = students.reduce((sum, student) => sum + student.feesPaid, 0);
        const totalFeesDue = students.reduce((sum, student) => sum + student.feesDue, 0);
        const totalFees = totalFeesPaid + totalFeesDue;

        const studentsWithOutstandingFees = students.filter(s => s.feesDue > 0).length;
        const fullyPaidStudents = students.filter(s => s.feesDue === 0).length;

        res.status(200).json({
            success: true,
            data: {
                totalStudents: students.length,
                genderDistribution: genderCount,
                classDistribution: classCount,
                departmentDistribution: departmentCount,
                feeSummary: {
                    totalFeesCollected: totalFeesPaid,
                    totalFeesOutstanding: totalFeesDue,
                    totalFeesExpected: totalFees,
                    studentsWithOutstandingFees,
                    fullyPaidStudents
                }
            }
        });
    } catch (error) {
        res.status(500).json({
            success: false,
            message: "Error fetching student statistics",
            error: error.message
        });
    }
});

// GET students with pagination
router.get("/students/paginated/page/:page/limit/:limit", async (req, res) => {
    try {
        const { page, limit } = req.params;
        const pageNum = parseInt(page);
        const limitNum = parseInt(limit);
        const skip = (pageNum - 1) * limitNum;

        const students = await Student.find()
            .sort({ fullName: 1 })
            .skip(skip)
            .limit(limitNum);

        const total = await Student.countDocuments();

        res.status(200).json({
            success: true,
            data: students,
            pagination: {
                currentPage: pageNum,
                totalPages: Math.ceil(total / limitNum),
                totalItems: total,
                itemsPerPage: limitNum
            }
        });
    } catch (error) {
        res.status(500).json({
            success: false,
            message: "Error fetching paginated students",
            error: error.message
        });
    }
});

// ==================== POST ROUTES ====================

// POST - Create a new student
router.post("/students", async (req, res) => {
    try {
        const studentData = req.body;

        // Check if student already exists (optional - you may want to use a unique identifier)
        // You can check by parentPhone and fullName combination
        const existingStudent = await Student.findOne({
            fullName: studentData.fullName,
            parentPhone: studentData.parentPhone
        });

        if (existingStudent) {
            return res.status(400).json({
                success: false,
                message: "Student already exists with this name and parent phone"
            });
        }

        const student = new Student(studentData);
        await student.save();

        res.status(201).json({
            success: true,
            message: "Student created successfully",
            data: student
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
            message: "Error creating student",
            error: error.message
        });
    }
});

// POST - Create multiple students (bulk insert)
router.post("/students/bulk", async (req, res) => {
    try {
        const studentsData = req.body;

        if (!Array.isArray(studentsData)) {
            return res.status(400).json({
                success: false,
                message: "Expected an array of students"
            });
        }

        // Validate each student
        const validationErrors = [];
        const validStudents = [];

        studentsData.forEach((student, index) => {
            const requiredFields = [
                'fullName', 'gender', 'dob', 'classId', 'department',
                'parentName', 'parentPhone', 'address', 'registrationDate',
                'feesPaid', 'feesDue'
            ];
            const missingFields = requiredFields.filter(field => !student[field]);

            if (missingFields.length > 0) {
                validationErrors.push({
                    index,
                    student,
                    error: `Missing required fields: ${missingFields.join(', ')}`
                });
            } else {
                validStudents.push(student);
            }
        });

        if (validationErrors.length > 0) {
            return res.status(400).json({
                success: false,
                message: "Validation errors in some students",
                errors: validationErrors
            });
        }

        // Check for duplicates in database
        const duplicateChecks = validStudents.map(s => ({
            fullName: s.fullName,
            parentPhone: s.parentPhone
        }));

        const existingStudents = await Student.find({
            $or: duplicateChecks
        });

        if (existingStudents.length > 0) {
            return res.status(400).json({
                success: false,
                message: "Some students already exist in the database",
                existingStudents: existingStudents.map(s => ({
                    fullName: s.fullName,
                    parentPhone: s.parentPhone
                }))
            });
        }

        const createdStudents = await Student.insertMany(validStudents);

        res.status(201).json({
            success: true,
            message: `${createdStudents.length} students created successfully`,
            data: createdStudents
        });
    } catch (error) {
        res.status(500).json({
            success: false,
            message: "Error creating students in bulk",
            error: error.message
        });
    }
});

// POST - Record fee payment
router.post("/students/:id/pay-fees", async (req, res) => {
    try {
        const { id } = req.params;
        const { amount } = req.body;

        if (!mongoose.Types.ObjectId.isValid(id)) {
            return res.status(400).json({
                success: false,
                message: "Invalid student ID format"
            });
        }

        if (!amount || amount <= 0) {
            return res.status(400).json({
                success: false,
                message: "Please provide a valid payment amount"
            });
        }

        const student = await Student.findById(id);
        if (!student) {
            return res.status(404).json({
                success: false,
                message: "Student not found"
            });
        }

        // Update fees
        const paymentAmount = parseFloat(amount);
        let remainingDue = student.feesDue - paymentAmount;

        if (remainingDue < 0) {
            // If overpayment, add to feesPaid and set feesDue to 0
            student.feesPaid += paymentAmount;
            student.feesDue = 0;
        } else {
            student.feesPaid += paymentAmount;
            student.feesDue = remainingDue;
        }

        await student.save();

        res.status(200).json({
            success: true,
            message: "Fee payment recorded successfully",
            data: {
                student: student,
                paymentAmount: paymentAmount,
                newBalance: student.feesDue
            }
        });
    } catch (error) {
        res.status(500).json({
            success: false,
            message: "Error processing fee payment",
            error: error.message
        });
    }
});

// ==================== PUT ROUTES ====================

// PUT - Update an entire student
router.put("/students/:id", async (req, res) => {
    try {
        const { id } = req.params;
        const studentData = req.body;

        if (!mongoose.Types.ObjectId.isValid(id)) {
            return res.status(400).json({
                success: false,
                message: "Invalid student ID format"
            });
        }

        const existingStudent = await Student.findById(id);
        if (!existingStudent) {
            return res.status(404).json({
                success: false,
                message: "Student not found"
            });
        }

        // Check for duplicate if fullName or parentPhone is changing
        if (studentData.fullName || studentData.parentPhone) {
            const checkFields = {
                fullName: studentData.fullName || existingStudent.fullName,
                parentPhone: studentData.parentPhone || existingStudent.parentPhone
            };

            const duplicateCheck = await Student.findOne({
                _id: { $ne: id },
                fullName: checkFields.fullName,
                parentPhone: checkFields.parentPhone
            });

            if (duplicateCheck) {
                return res.status(400).json({
                    success: false,
                    message: "Another student already exists with this name and parent phone"
                });
            }
        }

        const updatedStudent = await Student.findByIdAndUpdate(
            id,
            studentData,
            {
                new: true,
                runValidators: true
            }
        );

        res.status(200).json({
            success: true,
            message: "Student updated successfully",
            data: updatedStudent
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
            message: "Error updating student",
            error: error.message
        });
    }
});

// ==================== PATCH ROUTES ====================

// PATCH - Partially update a student
router.patch("/students/:id", async (req, res) => {
    try {
        const { id } = req.params;
        const studentData = req.body;

        if (!mongoose.Types.ObjectId.isValid(id)) {
            return res.status(400).json({
                success: false,
                message: "Invalid student ID format"
            });
        }

        const existingStudent = await Student.findById(id);
        if (!existingStudent) {
            return res.status(404).json({
                success: false,
                message: "Student not found"
            });
        }

        // Check for duplicate if fullName or parentPhone is changing
        if (studentData.fullName || studentData.parentPhone) {
            const checkFields = {
                fullName: studentData.fullName || existingStudent.fullName,
                parentPhone: studentData.parentPhone || existingStudent.parentPhone
            };

            const duplicateCheck = await Student.findOne({
                _id: { $ne: id },
                fullName: checkFields.fullName,
                parentPhone: checkFields.parentPhone
            });

            if (duplicateCheck) {
                return res.status(400).json({
                    success: false,
                    message: "Another student already exists with this name and parent phone"
                });
            }
        }

        const updatedStudent = await Student.findByIdAndUpdate(
            id,
            studentData,
            {
                new: true,
                runValidators: true
            }
        );

        res.status(200).json({
            success: true,
            message: "Student updated successfully",
            data: updatedStudent
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
            message: "Error updating student",
            error: error.message
        });
    }
});

// PATCH - Update student's class
router.patch("/students/:id/update-class", async (req, res) => {
    try {
        const { id } = req.params;
        const { classId } = req.body;

        if (!mongoose.Types.ObjectId.isValid(id)) {
            return res.status(400).json({
                success: false,
                message: "Invalid student ID format"
            });
        }

        if (!classId) {
            return res.status(400).json({
                success: false,
                message: "classId is required"
            });
        }

        const student = await Student.findById(id);
        if (!student) {
            return res.status(404).json({
                success: false,
                message: "Student not found"
            });
        }

        student.classId = classId;
        await student.save();

        res.status(200).json({
            success: true,
            message: "Student's class updated successfully",
            data: student
        });
    } catch (error) {
        res.status(500).json({
            success: false,
            message: "Error updating student's class",
            error: error.message
        });
    }
});

// PATCH - Update student's photo
router.patch("/students/:id/update-photo", async (req, res) => {
    try {
        const { id } = req.params;
        const { photoUrl } = req.body;

        if (!mongoose.Types.ObjectId.isValid(id)) {
            return res.status(400).json({
                success: false,
                message: "Invalid student ID format"
            });
        }

        if (!photoUrl) {
            return res.status(400).json({
                success: false,
                message: "photoUrl is required"
            });
        }

        const student = await Student.findById(id);
        if (!student) {
            return res.status(404).json({
                success: false,
                message: "Student not found"
            });
        }

        student.photoUrl = photoUrl;
        await student.save();

        res.status(200).json({
            success: true,
            message: "Student's photo updated successfully",
            data: student
        });
    } catch (error) {
        res.status(500).json({
            success: false,
            message: "Error updating student's photo",
            error: error.message
        });
    }
});

// ==================== DELETE ROUTES ====================

// DELETE - Delete a student
router.delete("/students/:id", async (req, res) => {
    try {
        const { id } = req.params;

        if (!mongoose.Types.ObjectId.isValid(id)) {
            return res.status(400).json({
                success: false,
                message: "Invalid student ID format"
            });
        }

        const student = await Student.findById(id);
        if (!student) {
            return res.status(404).json({
                success: false,
                message: "Student not found"
            });
        }

        await Student.findByIdAndDelete(id);

        res.status(200).json({
            success: true,
            message: "Student deleted successfully",
            data: student
        });
    } catch (error) {
        res.status(500).json({
            success: false,
            message: "Error deleting student",
            error: error.message
        });
    }
});

// DELETE - Delete all students from a class
router.delete("/students/class/:classId", async (req, res) => {
    try {
        const { classId } = req.params;
        const result = await Student.deleteMany({ classId });

        if (result.deletedCount === 0) {
            return res.status(404).json({
                success: false,
                message: "No students found for this class"
            });
        }

        res.status(200).json({
            success: true,
            message: `${result.deletedCount} students deleted from class ${classId}`,
            deletedCount: result.deletedCount
        });
    } catch (error) {
        res.status(500).json({
            success: false,
            message: "Error deleting students by class",
            error: error.message
        });
    }
});

// DELETE - Delete all students from a department
router.delete("/students/department/:department", async (req, res) => {
    try {
        const { department } = req.params;
        const result = await Student.deleteMany({ department });

        if (result.deletedCount === 0) {
            return res.status(404).json({
                success: false,
                message: "No students found for this department"
            });
        }

        res.status(200).json({
            success: true,
            message: `${result.deletedCount} students deleted from department ${department}`,
            deletedCount: result.deletedCount
        });
    } catch (error) {
        res.status(500).json({
            success: false,
            message: "Error deleting students by department",
            error: error.message
        });
    }
});

// DELETE - Delete all students with outstanding fees (feesDue > 0)
router.delete("/students/outstanding-fees", async (req, res) => {
    try {
        const result = await Student.deleteMany({ feesDue: { $gt: 0 } });

        if (result.deletedCount === 0) {
            return res.status(404).json({
                success: false,
                message: "No students with outstanding fees found"
            });
        }

        res.status(200).json({
            success: true,
            message: `${result.deletedCount} students with outstanding fees deleted`,
            deletedCount: result.deletedCount
        });
    } catch (error) {
        res.status(500).json({
            success: false,
            message: "Error deleting students with outstanding fees",
            error: error.message
        });
    }
});

// DELETE - Delete all students (use with extreme caution)
router.delete("/students", async (req, res) => {
    try {
        // Add authorization check in production
        const result = await Student.deleteMany({});

        res.status(200).json({
            success: true,
            message: `${result.deletedCount} students deleted successfully`,
            deletedCount: result.deletedCount
        });
    } catch (error) {
        res.status(500).json({
            success: false,
            message: "Error deleting all students",
            error: error.message
        });
    }
});

export default router;