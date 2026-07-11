import express from 'express';
const router = express.Router();
import TeacherAttendance from '../models/TeacherAttendance.js';
import User from '../models/User.js';

// ============================================
// GET Routes
// ============================================

// Get all attendance records - GET /api/attendance
router.get('/attendance', async (req, res) => {
  try {
    const { teacherId, date, status, month, year } = req.query;
    
    let filter = {};
    if (teacherId) filter.teacherId = teacherId;
    if (status) filter.status = status;
    
    if (date) {
      const startDate = new Date(date);
      startDate.setHours(0, 0, 0, 0);
      const endDate = new Date(date);
      endDate.setHours(23, 59, 59, 999);
      filter.date = { $gte: startDate, $lte: endDate };
    }
    
    if (month && year) {
      const startDate = new Date(year, month - 1, 1);
      const endDate = new Date(year, month, 0, 23, 59, 59, 999);
      filter.date = { $gte: startDate, $lte: endDate };
    }
    
    const attendance = await TeacherAttendance.find(filter)
      .populate('teacherId', 'name email qualification')
      .sort({ date: -1 });
    
    res.status(200).json({
      success: true,
      data: attendance
    });
  } catch (error) {
    console.error('Error fetching attendance:', error);
    res.status(500).json({
      success: false,
      message: 'Error fetching attendance',
      error: error.message
    });
  }
});

// Get teacher's attendance - GET /api/attendance/teacher/:teacherId
router.get('/attendance/teacher/:teacherId', async (req, res) => {
  try {
    const { teacherId } = req.params;
    const { month, year, startDate, endDate } = req.query;
    
    let filter = { teacherId };
    
    if (month && year) {
      const start = new Date(year, month - 1, 1);
      const end = new Date(year, month, 0, 23, 59, 59, 999);
      filter.date = { $gte: start, $lte: end };
    } else if (startDate && endDate) {
      filter.date = {
        $gte: new Date(startDate),
        $lte: new Date(endDate)
      };
    }
    
    const attendance = await TeacherAttendance.find(filter)
      .sort({ date: -1 });
    
    // Calculate statistics
    const stats = {
      present: attendance.filter(a => a.status === 'present').length,
      absent: attendance.filter(a => a.status === 'absent').length,
      late: attendance.filter(a => a.status === 'late').length,
      excused: attendance.filter(a => a.status === 'excused').length,
      total: attendance.length
    };
    
    res.status(200).json({
      success: true,
      data: {
        records: attendance,
        stats
      }
    });
  } catch (error) {
    console.error('Error fetching teacher attendance:', error);
    res.status(500).json({
      success: false,
      message: 'Error fetching teacher attendance',
      error: error.message
    });
  }
});

// Get attendance summary for all teachers - GET /api/attendance/summary
router.get('/attendance/summary', async (req, res) => {
  try {
    const { month, year } = req.query;
    
    let dateFilter = {};
    if (month && year) {
      const start = new Date(year, month - 1, 1);
      const end = new Date(year, month, 0, 23, 59, 59, 999);
      dateFilter = { date: { $gte: start, $lte: end } };
    }
    
    const summary = await TeacherAttendance.aggregate([
      { $match: dateFilter },
      {
        $group: {
          _id: '$teacherId',
          present: {
            $sum: { $cond: [{ $eq: ['$status', 'present'] }, 1, 0] }
          },
          absent: {
            $sum: { $cond: [{ $eq: ['$status', 'absent'] }, 1, 0] }
          },
          late: {
            $sum: { $cond: [{ $eq: ['$status', 'late'] }, 1, 0] }
          },
          excused: {
            $sum: { $cond: [{ $eq: ['$status', 'excused'] }, 1, 0] }
          },
          total: { $sum: 1 }
        }
      },
      {
        $lookup: {
          from: 'users',
          localField: '_id',
          foreignField: '_id',
          as: 'teacher'
        }
      },
      { $unwind: '$teacher' },
      {
        $project: {
          teacherName: '$teacher.name',
          teacherEmail: '$teacher.email',
          present: 1,
          absent: 1,
          late: 1,
          excused: 1,
          total: 1,
          attendanceRate: {
            $multiply: [
              { $divide: ['$present', '$total'] },
              100
            ]
          }
        }
      }
    ]);
    
    res.status(200).json({
      success: true,
      data: summary
    });
  } catch (error) {
    console.error('Error fetching attendance summary:', error);
    res.status(500).json({
      success: false,
      message: 'Error fetching attendance summary',
      error: error.message
    });
  }
});

// ============================================
// POST Routes
// ============================================

// Mark attendance for a teacher - POST /api/attendance
router.post('/attendance', async (req, res) => {
  try {
    const {
      teacherId, date, checkIn, checkOut, status,
      hoursWorked, periodsTaught, notes, academicYear, term
    } = req.body;
    
    if (!teacherId) {
      return res.status(400).json({
        success: false,
        message: 'Teacher ID is required'
      });
    }
    
    // Check if teacher exists
    const teacher = await User.findById(teacherId);
    if (!teacher) {
      return res.status(404).json({
        success: false,
        message: 'Teacher not found'
      });
    }
    
    // Check for existing attendance
    const existing = await TeacherAttendance.findOne({
      teacherId,
      date: date ? new Date(date) : new Date()
    });
    
    if (existing) {
      return res.status(400).json({
        success: false,
        message: 'Attendance already recorded for this day',
        data: existing
      });
    }
    
    const attendance = new TeacherAttendance({
      teacherId,
      date: date || new Date(),
      checkIn,
      checkOut,
      status: status || 'present',
      hoursWorked: hoursWorked || 0,
      periodsTaught: periodsTaught || 0,
      notes,
      academicYear: academicYear || '2024-2025',
      term: term || 'first'
    });
    
    await attendance.save();
    
    const populated = await TeacherAttendance.findById(attendance._id)
      .populate('teacherId', 'name email');
    
    res.status(201).json({
      success: true,
      data: populated,
      message: 'Attendance recorded successfully'
    });
  } catch (error) {
    console.error('Error recording attendance:', error);
    res.status(500).json({
      success: false,
      message: 'Error recording attendance',
      error: error.message
    });
  }
});

// Bulk mark attendance - POST /api/attendance/bulk
router.post('/attendance/bulk', async (req, res) => {
  try {
    const { records } = req.body;
    
    if (!records || !Array.isArray(records) || records.length === 0) {
      return res.status(400).json({
        success: false,
        message: 'Please provide an array of attendance records'
      });
    }
    
    const created = [];
    const errors = [];
    
    for (const record of records) {
      try {
        const {
          teacherId, date, checkIn, checkOut, status,
          hoursWorked, periodsTaught, notes
        } = record;
        
        if (!teacherId) {
          errors.push({ record, error: 'Teacher ID is required' });
          continue;
        }
        
        const attendance = new TeacherAttendance({
          teacherId,
          date: date || new Date(),
          checkIn,
          checkOut,
          status: status || 'present',
          hoursWorked: hoursWorked || 0,
          periodsTaught: periodsTaught || 0,
          notes,
          academicYear: record.academicYear || '2024-2025',
          term: record.term || 'first'
        });
        
        await attendance.save();
        created.push(attendance);
      } catch (error) {
        errors.push({ record, error: error.message });
      }
    }
    
    res.status(201).json({
      success: true,
      data: {
        created: created.length,
        errors: errors.length,
        records: created
      },
      message: `${created.length} records created, ${errors.length} failed`
    });
  } catch (error) {
    console.error('Error bulk recording attendance:', error);
    res.status(500).json({
      success: false,
      message: 'Error recording attendance',
      error: error.message
    });
  }
});

// ============================================
// PUT Routes
// ============================================

// Update attendance record - PUT /api/attendance/:id
router.put('/attendance/:id', async (req, res) => {
  try {
    const { id } = req.params;
    const updates = req.body;
    
    const attendance = await TeacherAttendance.findById(id);
    if (!attendance) {
      return res.status(404).json({
        success: false,
        message: 'Attendance record not found'
      });
    }
    
    Object.assign(attendance, updates);
    attendance.updatedAt = new Date();
    await attendance.save();
    
    const populated = await TeacherAttendance.findById(id)
      .populate('teacherId', 'name email');
    
    res.status(200).json({
      success: true,
      data: populated,
      message: 'Attendance updated successfully'
    });
  } catch (error) {
    console.error('Error updating attendance:', error);
    res.status(500).json({
      success: false,
      message: 'Error updating attendance',
      error: error.message
    });
  }
});

// ============================================
// DELETE Routes
// ============================================

// Delete attendance record - DELETE /api/attendance/:id
router.delete('/attendance/:id', async (req, res) => {
  try {
    const { id } = req.params;
    
    const attendance = await TeacherAttendance.findByIdAndDelete(id);
    if (!attendance) {
      return res.status(404).json({
        success: false,
        message: 'Attendance record not found'
      });
    }
    
    res.status(200).json({
      success: true,
      message: 'Attendance record deleted successfully'
    });
  } catch (error) {
    console.error('Error deleting attendance:', error);
    res.status(500).json({
      success: false,
      message: 'Error deleting attendance',
      error: error.message
    });
  }
});

export default router;