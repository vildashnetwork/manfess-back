import express from 'express';
const router = express.Router();
import TeacherSalary from '../models/TeacherSalary.js';
import TeacherAttendance from '../models/TeacherAttendance.js';
import Timetable from '../models/Timetable.js';
import User from '../models/User.js';

// ============================================
// Helper Functions
// ============================================

const calculateSalary = async (teacherId, month, year, term = 'first') => {
  // Get attendance for the month
  const startDate = new Date(year, month - 1, 1);
  const endDate = new Date(year, month, 0, 23, 59, 59, 999);
  
  const attendance = await TeacherAttendance.find({
    teacherId,
    date: { $gte: startDate, $lte: endDate }
  });
  
  // Get timetable for the teacher
  const timetable = await Timetable.find({
    teacherId,
    academicYear: year || '2024-2025',
    isActive: true
  });
  
  // Calculate periods by cycle
  const firstCyclePeriods = timetable.filter(t => t.cycle === 'first').length;
  const secondCyclePeriods = timetable.filter(t => t.cycle === 'second').length;
  const totalPeriods = firstCyclePeriods + secondCyclePeriods;
  
  // Calculate gross salary
  const grossSalary = (firstCyclePeriods * 500) + (secondCyclePeriods * 700);
  
  // Calculate deductions
  const absentDays = attendance.filter(a => a.status === 'absent').length;
  const deductionPerAbsence = 5000;
  const absenceDeduction = absentDays * deductionPerAbsence;
  
  // Calculate attendance stats
  const attendanceStats = {
    present: attendance.filter(a => a.status === 'present').length,
    absent: absentDays,
    late: attendance.filter(a => a.status === 'late').length,
    excused: attendance.filter(a => a.status === 'excused').length
  };
  
  return {
    teacherId,
    month,
    year: year || '2024-2025',
    term,
    periodCounts: {
      firstCycle: firstCyclePeriods,
      secondCycle: secondCyclePeriods,
      total: totalPeriods
    },
    rates: {
      firstCycle: 500,
      secondCycle: 700
    },
    grossSalary,
    deductions: {
      total: absenceDeduction,
      details: absentDays > 0 ? [{
        type: 'absence',
        amount: absenceDeduction,
        description: `${absentDays} absence(s) × 5,000 FRS`
      }] : []
    },
    netSalary: grossSalary - absenceDeduction,
    attendance: attendanceStats,
    status: 'pending'
  };
};

// ============================================
// GET Routes
// ============================================

// Get all salary records - GET /api/salary
router.get('/salary', async (req, res) => {
  try {
    const { month, year, teacherId, status } = req.query;
    
    let filter = {};
    if (month) filter.month = month;
    if (year) filter.year = year;
    if (teacherId) filter.teacherId = teacherId;
    if (status) filter.status = status;
    
    const salaries = await TeacherSalary.find(filter)
      .populate('teacherId', 'name email qualification')
      .sort({ createdAt: -1 });
    
    res.status(200).json({
      success: true,
      data: salaries
    });
  } catch (error) {
    console.error('Error fetching salaries:', error);
    res.status(500).json({
      success: false,
      message: 'Error fetching salaries',
      error: error.message
    });
  }
});

// Get teacher's salary - GET /api/salary/teacher/:teacherId
router.get('/salary/teacher/:teacherId', async (req, res) => {
  try {
    const { teacherId } = req.params;
    const { month, year } = req.query;
    
    let filter = { teacherId };
    if (month) filter.month = month;
    if (year) filter.year = year;
    
    const salaries = await TeacherSalary.find(filter)
      .sort({ year: -1, month: -1 });
    
    res.status(200).json({
      success: true,
      data: salaries
    });
  } catch (error) {
    console.error('Error fetching teacher salary:', error);
    res.status(500).json({
      success: false,
      message: 'Error fetching teacher salary',
      error: error.message
    });
  }
});

// Calculate salary for a teacher - GET /api/salary/calculate/:teacherId
router.get('/salary/calculate/:teacherId', async (req, res) => {
  try {
    const { teacherId } = req.params;
    const { month, year, term } = req.query;
    
    const monthNum = parseInt(month) || new Date().getMonth() + 1;
    const yearStr = year || '2024-2025';
    const termStr = term || 'first';
    
    const salaryData = await calculateSalary(teacherId, monthNum, yearStr, termStr);
    
    // Get teacher info
    const teacher = await User.findById(teacherId, 'name email');
    
    res.status(200).json({
      success: true,
      data: {
        ...salaryData,
        teacher: {
          id: teacher._id,
          name: teacher.name,
          email: teacher.email
        }
      }
    });
  } catch (error) {
    console.error('Error calculating salary:', error);
    res.status(500).json({
      success: false,
      message: 'Error calculating salary',
      error: error.message
    });
  }
});

// Get salary statistics - GET /api/salary/stats
router.get('/salary/stats', async (req, res) => {
  try {
    const { year } = req.query;
    
    const filter = year ? { year } : {};
    
    const stats = await TeacherSalary.aggregate([
      { $match: filter },
      {
        $group: {
          _id: null,
          totalGrossSalary: { $sum: '$grossSalary' },
          totalNetSalary: { $sum: '$netSalary' },
          totalDeductions: { $sum: '$deductions.total' },
          totalTeachers: { $sum: 1 },
          averageSalary: { $avg: '$netSalary' }
        }
      }
    ]);
    
    const monthlyStats = await TeacherSalary.aggregate([
      { $match: filter },
      {
        $group: {
          _id: '$month',
          totalNetSalary: { $sum: '$netSalary' },
          teacherCount: { $sum: 1 }
        }
      },
      { $sort: { _id: 1 } }
    ]);
    
    res.status(200).json({
      success: true,
      data: {
        overall: stats[0] || { totalGrossSalary: 0, totalNetSalary: 0, totalDeductions: 0, totalTeachers: 0, averageSalary: 0 },
        monthly: monthlyStats
      }
    });
  } catch (error) {
    console.error('Error fetching salary statistics:', error);
    res.status(500).json({
      success: false,
      message: 'Error fetching salary statistics',
      error: error.message
    });
  }
});

// ============================================
// POST Routes
// ============================================

// Create or update teacher salary - POST /api/salary
router.post('/salary', async (req, res) => {
  try {
    const { teacherId, month, year, term } = req.body;
    
    if (!teacherId || !month || !year) {
      return res.status(400).json({
        success: false,
        message: 'Teacher ID, month, and year are required'
      });
    }
    
    // Check if salary already exists
    const existing = await TeacherSalary.findOne({ teacherId, month, year });
    
    if (existing) {
      return res.status(400).json({
        success: false,
        message: 'Salary record already exists for this teacher this month',
        data: existing
      });
    }
    
    const salaryData = await calculateSalary(teacherId, parseInt(month), year, term || 'first');
    
    const salary = new TeacherSalary(salaryData);
    await salary.save();
    
    const populated = await TeacherSalary.findById(salary._id)
      .populate('teacherId', 'name email');
    
    res.status(201).json({
      success: true,
      data: populated,
      message: 'Salary record created successfully'
    });
  } catch (error) {
    console.error('Error creating salary record:', error);
    res.status(500).json({
      success: false,
      message: 'Error creating salary record',
      error: error.message
    });
  }
});

// Generate salaries for all teachers for a month - POST /api/salary/generate
router.post('/salary/generate', async (req, res) => {
  try {
    const { month, year, term } = req.body;
    
    if (!month || !year) {
      return res.status(400).json({
        success: false,
        message: 'Month and year are required'
      });
    }
    
    // Get all active teachers
    const teachers = await User.find({ role: 'teacher', isActive: true });
    
    const created = [];
    const errors = [];
    
    for (const teacher of teachers) {
      try {
        // Check if salary already exists
        const existing = await TeacherSalary.findOne({
          teacherId: teacher._id,
          month,
          year
        });
        
        if (existing) {
          errors.push({ teacher: teacher.name, error: 'Salary record already exists' });
          continue;
        }
        
        const salaryData = await calculateSalary(
          teacher._id,
          parseInt(month),
          year,
          term || 'first'
        );
        
        const salary = new TeacherSalary(salaryData);
        await salary.save();
        created.push(salary);
      } catch (error) {
        errors.push({ teacher: teacher.name, error: error.message });
      }
    }
    
    res.status(201).json({
      success: true,
      data: {
        created: created.length,
        errors: errors.length,
        records: created
      },
      message: `${created.length} salary records created, ${errors.length} failed`
    });
  } catch (error) {
    console.error('Error generating salaries:', error);
    res.status(500).json({
      success: false,
      message: 'Error generating salaries',
      error: error.message
    });
  }
});

// ============================================
// PUT Routes
// ============================================

// Update salary record - PUT /api/salary/:id
router.put('/salary/:id', async (req, res) => {
  try {
    const { id } = req.params;
    const updates = req.body;
    
    const salary = await TeacherSalary.findById(id);
    if (!salary) {
      return res.status(404).json({
        success: false,
        message: 'Salary record not found'
      });
    }
    
    Object.assign(salary, updates);
    salary.updatedAt = new Date();
    await salary.save();
    
    const populated = await TeacherSalary.findById(id)
      .populate('teacherId', 'name email');
    
    res.status(200).json({
      success: true,
      data: populated,
      message: 'Salary record updated successfully'
    });
  } catch (error) {
    console.error('Error updating salary record:', error);
    res.status(500).json({
      success: false,
      message: 'Error updating salary record',
      error: error.message
    });
  }
});

// Mark salary as paid - PUT /api/salary/pay/:id
router.put('/salary/pay/:id', async (req, res) => {
  try {
    const { id } = req.params;
    const { paymentMethod, transactionId, notes } = req.body;
    
    const salary = await TeacherSalary.findById(id);
    if (!salary) {
      return res.status(404).json({
        success: false,
        message: 'Salary record not found'
      });
    }
    
    salary.status = 'paid';
    salary.paymentDate = new Date();
    salary.paymentMethod = paymentMethod || 'cash';
    salary.transactionId = transactionId;
    salary.notes = notes;
    salary.updatedAt = new Date();
    await salary.save();
    
    const populated = await TeacherSalary.findById(id)
      .populate('teacherId', 'name email');
    
    res.status(200).json({
      success: true,
      data: populated,
      message: 'Salary marked as paid'
    });
  } catch (error) {
    console.error('Error marking salary as paid:', error);
    res.status(500).json({
      success: false,
      message: 'Error marking salary as paid',
      error: error.message
    });
  }
});

// ============================================
// DELETE Routes
// ============================================

// Delete salary record - DELETE /api/salary/:id
router.delete('/salary/:id', async (req, res) => {
  try {
    const { id } = req.params;
    
    const salary = await TeacherSalary.findByIdAndDelete(id);
    if (!salary) {
      return res.status(404).json({
        success: false,
        message: 'Salary record not found'
      });
    }
    
    res.status(200).json({
      success: true,
      message: 'Salary record deleted successfully'
    });
  } catch (error) {
    console.error('Error deleting salary record:', error);
    res.status(500).json({
      success: false,
      message: 'Error deleting salary record',
      error: error.message
    });
  }
});

export default router;