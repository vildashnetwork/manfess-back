// routes/timetable.js
import express from 'express';
const router = express.Router();
import Timetable from '../models/Timetable.js';
import User from '../models/User.js';
import SchoolClass from '../models/SchoolClass.js';
import Subject from '../models/Subject.js';

// ============================================
// GET Routes
// ============================================

router.get('/timetable', async (req, res) => {
  try {
    const { teacherId, classId, day, academicYear } = req.query;
    
    let filter = {};
    if (teacherId) filter.teacherId = teacherId;
    if (classId) filter.classId = classId;
    if (day) filter.day = day;
    if (academicYear) filter.academicYear = academicYear;
    
    const timetable = await Timetable.find(filter)
      .populate('teacherId', 'name email')
      .populate('classId', 'className department') // This should work if model is registered
      .populate('subjectId', 'name code')
      .sort({ day: 1, startTime: 1 });
    
    res.status(200).json({
      success: true,
      data: timetable
    });
  } catch (error) {
    console.error('Error fetching timetable:', error);
    res.status(500).json({
      success: false,
      message: 'Error fetching timetable',
      error: error.message
    });
  }
});

// ... rest of your routes
// Get teacher's timetable
router.get('/timetable/teacher/:teacherId', async (req, res) => {
  try {
    const { teacherId } = req.params;
    const { day, academicYear } = req.query;
    
    let filter = { teacherId, isActive: true };
    if (day) filter.day = day;
    if (academicYear) filter.academicYear = academicYear;
    
    const timetable = await Timetable.find(filter)
      .populate('classId', 'className')
      .populate('subjectId', 'name code')
      .sort({ day: 1, startTime: 1 });
    
    res.status(200).json({
      success: true,
      data: timetable
    });
  } catch (error) {
    console.error('Error fetching teacher timetable:', error);
    res.status(500).json({
      success: false,
      message: 'Error fetching teacher timetable',
      error: error.message
    });
  }
});

// ============================================
// POST Routes - FIXED
// ============================================

// Create new timetable entry
router.post('/timetable', async (req, res) => {
  try {
    console.log('📥 Received POST request:', req.body);
    
    const {
      teacherId, classId, subjectId, day, startTime, endTime,
      periodNumber, cycle, room, academicYear
    } = req.body;
    
    // Validate required fields
    if (!teacherId || !classId || !subjectId || !day || !startTime || !endTime) {
      console.log('❌ Missing required fields:', { teacherId, classId, subjectId, day, startTime, endTime });
      return res.status(400).json({
        success: false,
        message: 'Missing required fields',
        required: ['teacherId', 'classId', 'subjectId', 'day', 'startTime', 'endTime']
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
    
    // Check if class exists
    const classExists = await SchoolClass.findById(classId);
    if (!classExists) {
      return res.status(404).json({
        success: false,
        message: 'Class not found'
      });
    }
    
    // Check if subject exists
    const subject = await Subject.findById(subjectId);
    if (!subject) {
      return res.status(404).json({
        success: false,
        message: 'Subject not found'
      });
    }
    
    // Check for duplicate entry
    const existing = await Timetable.findOne({
      teacherId,
      day,
      startTime,
      academicYear: academicYear || '2024-2025'
    });
    
    if (existing) {
      return res.status(400).json({
        success: false,
        message: 'Teacher already has a period at this time on this day'
      });
    }
    
    // Calculate rate
    const ratePerPeriod = cycle === 'first' ? 500 : 700;
    
    const timetableEntry = new Timetable({
      teacherId,
      classId,
      subjectId,
      day,
      startTime,
      endTime,
      periodNumber: periodNumber || 1,
      cycle: cycle || 'first',
      ratePerPeriod,
      room: room || '',
      academicYear: academicYear || '2024-2025',
      isActive: true
    });
    
    await timetableEntry.save();
    
    // Populate and return
    const populated = await Timetable.findById(timetableEntry._id)
      .populate('teacherId', 'name email')
      .populate('classId', 'className')
      .populate('subjectId', 'name code');
    
    res.status(201).json({
      success: true,
      data: populated,
      message: 'Timetable entry created successfully'
    });
  } catch (error) {
    console.error('❌ Error creating timetable entry:', error);
    if (error.code === 11000) {
      return res.status(400).json({
        success: false,
        message: 'Duplicate entry: Teacher already has a period at this time'
      });
    }
    res.status(500).json({
      success: false,
      message: 'Error creating timetable entry',
      error: error.message
    });
  }
});

// Bulk create timetable entries
router.post('/timetable/bulk', async (req, res) => {
  try {
    const { entries } = req.body;
    
    if (!entries || !Array.isArray(entries) || entries.length === 0) {
      return res.status(400).json({
        success: false,
        message: 'Please provide an array of entries'
      });
    }
    
    const created = [];
    const errors = [];
    
    for (const entry of entries) {
      try {
        const {
          teacherId, classId, subjectId, day, startTime, endTime,
          periodNumber, cycle, room, academicYear
        } = entry;
        
        // Validate required fields
        if (!teacherId || !classId || !subjectId || !day || !startTime || !endTime) {
          errors.push({ entry, error: 'Missing required fields' });
          continue;
        }
        
        // Check if teacher exists
        const teacher = await User.findById(teacherId);
        if (!teacher) {
          errors.push({ entry, error: 'Teacher not found' });
          continue;
        }
        
        // Check for duplicate
        const existing = await Timetable.findOne({
          teacherId,
          day,
          startTime,
          academicYear: academicYear || '2024-2025'
        });
        
        if (existing) {
          errors.push({ entry, error: 'Duplicate entry' });
          continue;
        }
        
        const ratePerPeriod = cycle === 'first' ? 500 : 700;
        
        const timetableEntry = new Timetable({
          teacherId,
          classId,
          subjectId,
          day,
          startTime,
          endTime,
          periodNumber: periodNumber || 1,
          cycle: cycle || 'first',
          ratePerPeriod,
          room: room || '',
          academicYear: academicYear || '2024-2025',
          isActive: true
        });
        
        await timetableEntry.save();
        created.push(timetableEntry);
      } catch (error) {
        errors.push({ entry, error: error.message });
      }
    }
    
    res.status(201).json({
      success: true,
      data: {
        created: created.length,
        errors: errors.length,
        entries: created
      },
      message: `${created.length} entries created, ${errors.length} failed`
    });
  } catch (error) {
    console.error('Error bulk creating timetable entries:', error);
    res.status(500).json({
      success: false,
      message: 'Error creating timetable entries',
      error: error.message
    });
  }
});

// ============================================
// PUT Routes - FIXED
// ============================================

// Update timetable entry
router.put('/timetable/:id', async (req, res) => {
  try {
    const { id } = req.params;
    const updates = req.body;
    
    console.log('📥 Received PUT request for:', id, updates);
    
    const timetable = await Timetable.findById(id);
    if (!timetable) {
      return res.status(404).json({
        success: false,
        message: 'Timetable entry not found'
      });
    }
    
    // Recalculate rate if cycle changes
    if (updates.cycle) {
      updates.ratePerPeriod = updates.cycle === 'first' ? 500 : 700;
    }
    
    // Only update allowed fields
    const allowedUpdates = ['teacherId', 'classId', 'subjectId', 'day', 'startTime', 'endTime', 'periodNumber', 'cycle', 'ratePerPeriod', 'room', 'academicYear', 'isActive'];
    const filteredUpdates = {};
    Object.keys(updates).forEach(key => {
      if (allowedUpdates.includes(key)) {
        filteredUpdates[key] = updates[key];
      }
    });
    
    Object.assign(timetable, filteredUpdates);
    timetable.updatedAt = new Date();
    await timetable.save();
    
    const populated = await Timetable.findById(id)
      .populate('teacherId', 'name email')
      .populate('classId', 'className')
      .populate('subjectId', 'name code');
    
    res.status(200).json({
      success: true,
      data: populated,
      message: 'Timetable entry updated successfully'
    });
  } catch (error) {
    console.error('Error updating timetable entry:', error);
    res.status(500).json({
      success: false,
      message: 'Error updating timetable entry',
      error: error.message
    });
  }
});

// ============================================
// DELETE Routes
// ============================================

// Delete timetable entry
router.delete('/timetable/:id', async (req, res) => {
  try {
    const { id } = req.params;
    
    const timetable = await Timetable.findByIdAndDelete(id);
    if (!timetable) {
      return res.status(404).json({
        success: false,
        message: 'Timetable entry not found'
      });
    }
    
    res.status(200).json({
      success: true,
      message: 'Timetable entry deleted successfully'
    });
  } catch (error) {
    console.error('Error deleting timetable entry:', error);
    res.status(500).json({
      success: false,
      message: 'Error deleting timetable entry',
      error: error.message
    });
  }
});

export default router;