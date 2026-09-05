// routes/timetable.js
import express from 'express';
const router = express.Router();
import mongoose from 'mongoose';
import Timetable from '../models/Timetable.js';
import User from '../models/User.js';
import SchoolClass from '../models/SchoolClass.js';
import Subject from '../models/Subject.js';
import SchoolSettings from '../models/SchoolSettings.js';
import { generateTimetableSchedule } from '../services/timetableScheduler.js';

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
      .populate('classId', 'className department')
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

// Get teacher's timetable
router.get('/timetable/teacher/:teacherId', async (req, res) => {
  try {
    const { teacherId } = req.params;
    const { day, academicYear } = req.query;

    let filter = { teacherId, isActive: true };
    if (day) filter.day = day;
    if (academicYear) filter.academicYear = academicYear;

    const timetable = await Timetable.find(filter)
      .populate('classId', 'className department')
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
// POST Routes
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
      return res.status(400).json({
        success: false,
        message: 'Missing required fields'
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

    // ✅ ONLY CONFLICT CHECK: Teacher cannot be in two different classes at the same time
    // This allows multiple subjects in the SAME class at the same time
    const teacherConflict = await Timetable.findOne({
      teacherId,
      day,
      startTime,
      academicYear: academicYear || '2026-2027'
    });

    if (teacherConflict) {
      // Get the class name for the conflict
      const conflictWithDetails = await Timetable.findById(teacherConflict._id)
        .populate('teacherId', 'name')
        .populate('classId', 'className department')
        .populate('subjectId', 'name code');

      const conflictClassName = conflictWithDetails.classId?.className || 'Unknown Class';
      const conflictSubjectName = conflictWithDetails.subjectId?.name || 'Unknown Subject';
      const conflictTeacherName = conflictWithDetails.teacherId?.name || 'Unknown Teacher';

      // ✅ Check if it's the SAME class - if so, it's ALLOWED (multiple subjects in same class)
      if (teacherConflict.classId.toString() === classId) {
        console.log('✅ Same class, different subject - ALLOWED:', {
          teacher: teacher.name,
          class: conflictClassName,
          existingSubject: conflictSubjectName,
          newSubject: subject.name,
          day,
          startTime
        });
        // Allow it - multiple subjects in same class at same time
      } else {
        // ❌ Different class - CONFLICT (teacher can't be in two classes at once)
        console.log('❌ Teacher conflict - Different classes:', {
          teacher: teacher.name,
          existingClass: conflictClassName,
          newClass: classExists.className,
          day,
          startTime
        });

        return res.status(400).json({
          success: false,
          message: `Teacher "${teacher.name}" is already teaching "${conflictSubjectName}" to "${conflictClassName}" from ${conflictWithDetails.startTime} to ${conflictWithDetails.endTime} on ${day}. Cannot also teach "${subject.name}" to "${classExists.className}" at the same time.`,
          conflict: {
            teacherId: teacherId,
            teacherName: teacher.name,
            day: day,
            startTime: startTime,
            existingClass: conflictClassName,
            existingSubject: conflictSubjectName,
            existingTime: `${conflictWithDetails.startTime} - ${conflictWithDetails.endTime}`,
            existingEntryId: teacherConflict._id,
            newClass: classExists.className,
            newSubject: subject.name
          }
        });
      }
    }

    // ✅ ALLOWED: Multiple teachers can teach different subjects in the SAME class at the same time
    // No check for classId + day + startTime - this allows multiple subjects per class

    // Calculate rate
    const ratePerPeriod = cycle === 'first' ? 500 : 700;

    // Create entry
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
      academicYear: academicYear || '2026-2027',
      isActive: true
    });

    await timetableEntry.save();

    // Populate and return
    const populated = await Timetable.findById(timetableEntry._id)
      .populate('teacherId', 'name email')
      .populate('classId', 'className department')
      .populate('subjectId', 'name code');

    res.status(201).json({
      success: true,
      data: populated,
      message: 'Timetable entry created successfully'
    });
  } catch (error) {
    console.error('❌ Error creating timetable entry:', error);
    if (error.code === 11000) {
      // Check if it's a teacher conflict (unique index)
      return res.status(400).json({
        success: false,
        message: 'Teacher already has a period at this time. Cannot assign to two different classes.'
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

        // Check for teacher conflict (different class only)
        const teacherConflict = await Timetable.findOne({
          teacherId,
          day,
          startTime,
          academicYear: academicYear || '2026-2027'
        });

        if (teacherConflict) {
          // If it's the SAME class, allow it (multiple subjects)
          if (teacherConflict.classId.toString() !== classId) {
            errors.push({
              entry,
              error: `Teacher "${teacher.name}" already has a period in another class at this time on ${day}`
            });
            continue;
          }
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
          academicYear: academicYear || '2026-2027',
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
// PUT Routes
// ============================================

router.put('/timetable/:id', async (req, res) => {
  try {
    const { id } = req.params;
    console.log(`📥 Received PUT request for ID: ${id}`, req.body);

    // Find the timetable entry
    const timetable = await Timetable.findById(id);
    if (!timetable) {
      return res.status(404).json({
        success: false,
        message: `Timetable entry with ID ${id} not found`
      });
    }

    const {
      teacherId, classId, subjectId, day, startTime, endTime,
      periodNumber, cycle, room, academicYear, isActive
    } = req.body;

    // Validate time order if both are provided
    if (startTime && endTime && startTime >= endTime) {
      return res.status(400).json({
        success: false,
        message: 'Start time must be before end time'
      });
    }

    // If teacher is being changed, check for conflicts
    if (teacherId && teacherId !== timetable.teacherId.toString()) {
      const teacher = await User.findById(teacherId);
      if (!teacher) {
        return res.status(404).json({
          success: false,
          message: 'Teacher not found'
        });
      }

      // Check if new teacher already has a period at this time (different class only)
      const teacherConflict = await Timetable.findOne({
        teacherId,
        day: day || timetable.day,
        startTime: startTime || timetable.startTime,
        academicYear: academicYear || timetable.academicYear || '2026-2027',
        _id: { $ne: id }
      });

      if (teacherConflict) {
        const conflictClass = await SchoolClass.findById(teacherConflict.classId);
        // If it's the SAME class, allow it
        if (conflictClass && conflictClass._id.toString() === (classId || timetable.classId).toString()) {
          // Same class, different subject - allowed
          console.log('✅ Same class, different subject - ALLOWED');
        } else {
          return res.status(400).json({
            success: false,
            message: `Teacher "${teacher.name}" is already assigned to "${conflictClass?.className || 'another class'}" at this time on ${day || timetable.day}`
          });
        }
      }

      timetable.teacherId = teacherId;
    }

    if (classId) {
      const classExists = await SchoolClass.findById(classId);
      if (!classExists) {
        return res.status(404).json({
          success: false,
          message: 'Class not found'
        });
      }
      timetable.classId = classId;
    }

    if (subjectId) {
      const subject = await Subject.findById(subjectId);
      if (!subject) {
        return res.status(404).json({
          success: false,
          message: 'Subject not found'
        });
      }
      timetable.subjectId = subjectId;
    }

    if (day) timetable.day = day;
    if (startTime) timetable.startTime = startTime;
    if (endTime) timetable.endTime = endTime;
    if (periodNumber) timetable.periodNumber = periodNumber;
    if (cycle) {
      timetable.cycle = cycle;
      timetable.ratePerPeriod = cycle === 'first' ? 500 : 700;
    }
    if (room !== undefined) timetable.room = room;
    if (academicYear) timetable.academicYear = academicYear;
    if (isActive !== undefined) timetable.isActive = isActive;

    await timetable.save();

    const populated = await Timetable.findById(id)
      .populate('teacherId', 'name email')
      .populate('classId', 'className department')
      .populate('subjectId', 'name code');

    res.status(200).json({
      success: true,
      data: populated,
      message: 'Timetable entry updated successfully'
    });
  } catch (error) {
    console.error('❌ Error updating timetable entry:', error);

    if (error.code === 11000) {
      return res.status(400).json({
        success: false,
        message: 'Teacher conflict: This teacher already has a period at this time in another class'
      });
    }

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

    // Check if entry exists first
    const timetable = await Timetable.findById(id);
    if (!timetable) {
      return res.status(404).json({
        success: false,
        message: 'Timetable entry not found'
      });
    }

    await Timetable.findByIdAndDelete(id);

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

// Delete multiple entries
router.delete('/timetable/bulk', async (req, res) => {
  try {
    const { ids } = req.body;

    if (!ids || !Array.isArray(ids) || ids.length === 0) {
      return res.status(400).json({
        success: false,
        message: 'Please provide an array of entry IDs'
      });
    }

    const result = await Timetable.deleteMany({ _id: { $in: ids } });

    res.status(200).json({
      success: true,
      message: `${result.deletedCount} entries deleted successfully`,
      deletedCount: result.deletedCount
    });
  } catch (error) {
    console.error('Error deleting bulk entries:', error);
    res.status(500).json({
      success: false,
      message: 'Error deleting entries',
      error: error.message
    });
  }
});
// ========================================
// Timetable Generation
// ========================================

/**
 * POST /timetable/generate — schedules the whole week atomically.
 *
 * The scheduling logic lives in services/timetableScheduler.js:
 *   - never assigns a teacher to a subject they don't teach
 *   - synchronized common-subject lessons (a subject taken by EVERY
 *     department of a level runs at the same time in all those classes)
 *   - most-constrained-first greedy placement + ejection-chain repair
 *   - randomized restarts until zero missing periods
 *
 * This route loads the domain data, runs the scheduler and replaces the
 * previous timetable for the academic year.
 */
// Only one generation may run at a time. Two concurrent generates (e.g. the
// dashboard button and an open wizard) would interleave deleteMany +
// insertMany and corrupt the timetable. Later requests get an immediate 409.
let generationInProgress = false;

router.post('/timetable/generate', async (req, res) => {
  const academicYear = req.body.academicYear ||
    `${new Date().getFullYear()}-${new Date().getFullYear() + 1}`;
  const repairMode = req.body.repair === true;

  if (generationInProgress) {
    return res.status(409).json({
      success: false,
      message: 'A timetable generation is already running — please wait a few seconds and try again.',
    });
  }
  generationInProgress = true;

  try {
    // 1. Fetch school settings
    const settings = await SchoolSettings.findOne({ academicYear });
    if (!settings) {
      return res.status(400).json({
        success: false,
        message: `School schedule settings not found for academic year ${academicYear}. Please save settings first.`,
      });
    }

    const configuredDays = (req.body.schoolDays && req.body.schoolDays.length)
      ? req.body.schoolDays
      : (settings.schoolDays || ['Monday', 'Tuesday', 'Wednesday', 'Thursday', 'Friday']);
    const dayOrder = { Monday: 1, Tuesday: 2, Wednesday: 3, Thursday: 4, Friday: 5, Saturday: 6 };
    const schoolDays = [...new Set(configuredDays)]
      .filter((day) => dayOrder[day])
      .sort((a, b) => dayOrder[a] - dayOrder[b]);

    // 2. Fetch active classes, teachers and subjects
    const [classes, teachers, subjects] = await Promise.all([
      SchoolClass.find({ isActive: true }).sort({ className: 1, department: 1, section: 1 }),
      // Keep legacy teacher records (created before isActive was added) active.
      User.find({
        role: 'teacher',
        $or: [{ isActive: true }, { isActive: { $exists: false } }],
      }),
      Subject.find({}),
    ]);

    // NOTE: Fix All Conflicts never changes a teacher's configured days.
    // Teachers' availability (isPermanent/availableDays) is strictly respected
    // by the scheduler; when a conflict genuinely cannot be placed, the
    // scheduler auto-reduces that subject's period count instead of moving
    // days around.

    // 3. Run the scheduler
    const result = generateTimetableSchedule({
      classes,
      teachers,
      subjects,
      settings,
      schoolDays,
      repairMode,
      academicYear,
    });
    const { entries: generatedEntries, conflicts, stats } = result;

    // 4. Clear existing entries for the academic year and persist new ones
    await Timetable.deleteMany({ academicYear });

    let savedEntries = [];
    if (generatedEntries.length > 0) {
      savedEntries = await Timetable.insertMany(generatedEntries, { ordered: false });
    }

    // One batched query instead of one findById + populate per entry (the old
    // N+1 pattern made generation take 20+ seconds on slow networks).
    const populatedDocs = await Timetable.find({
      _id: { $in: savedEntries.map((entry) => entry._id) },
    })
      .populate('teacherId', 'name email')
      .populate('classId', 'className department')
      .populate('subjectId', 'name code');

    // Restore the insertion order of savedEntries (find() does not guarantee
    // order), so the API response stays stable for the UI.
    const populatedById = new Map(populatedDocs.map((doc) => [String(doc._id), doc]));
    const populatedEntries = savedEntries
      .map((entry) => populatedById.get(String(entry._id)))
      .filter(Boolean);

    res.status(200).json({
      success: true,
      data: {
        academicYear,
        totalPeriods: stats.totalSlots,
        generated: populatedEntries.length,
        conflicts,
        suggestions: conflicts.length > 0
          ? [
              'Fix All Conflicts regenerates the week and fills every slot a qualified teacher can cover.',
              'If a conflict still remains, add more active teachers or assign the missing subject/class mappings.',
              'Reduce weekly periods or increase periods per day when total demand exceeds available slots.',
            ]
          : [],
        entries: populatedEntries,
      },
      message: `Timetable generated: ${populatedEntries.length} periods scheduled${conflicts.length ? `, ${conflicts.length} conflict(s) found` : ''}.`,
    });
  } catch (error) {
    console.error('❌ Error generating timetable:', error);
    res.status(500).json({
      success: false,
      message: 'Error generating timetable',
      error: error.message,
    });
  } finally {
    generationInProgress = false;
  }
});

export default router;