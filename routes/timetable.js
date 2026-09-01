// routes/timetable.js
import express from 'express';
const router = express.Router();
import mongoose from 'mongoose';
import Timetable from '../models/Timetable.js';
import User from '../models/User.js';
import SchoolClass from '../models/SchoolClass.js';
import Subject from '../models/Subject.js';
import SchoolSettings from '../models/SchoolSettings.js';

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

// ============================================
// Timetable Generation
// ============================================

// Convert a "HH:mm" string to minutes since midnight.
const timeStringToMinutes = (t) => {
  const [h, m] = t.split(':').map(Number);
  return h * 60 + m;
};

// Convert minutes since midnight back to a "HH:mm" string.
const minutesToTimeString = (mins) => {
  const h = Math.floor(mins / 60);
  const m = mins % 60;
  return `${String(h).padStart(2, '0')}:${String(m).padStart(2, '0')}`;
};

// Build the list of teachable period slots for a school day, excluding
// the break window. Each slot is { day, periodNumber, startTime, endTime }.
const buildPeriodSlots = (day, settings) => {
  const slots = [];
  const startMin = timeStringToMinutes(settings.schoolStartTime);
  const endMin = timeStringToMinutes(settings.schoolEndTime);
  const breakStart = timeStringToMinutes(settings.breakStart);
  const breakEnd = timeStringToMinutes(settings.breakEnd);
  const duration = settings.periodDurationMinutes || 45;

  let cursor = startMin;
  let periodNumber = 1;

  while (cursor + duration <= endMin && periodNumber <= (settings.periodsPerDay || 20)) {
    const slotStart = cursor;
    const slotEnd = cursor + duration;

    // Skip slots that overlap with the mid-day break.
    const overlapsBreak = slotStart < breakEnd && slotEnd > breakStart;

    if (!overlapsBreak) {
      slots.push({
        day,
        periodNumber,
        startTime: minutesToTimeString(slotStart),
        endTime: minutesToTimeString(slotEnd),
      });
      periodNumber += 1;
    }

    cursor = slotEnd;
  }

  return slots;
};

// Check whether a teacher is available on a given day.
// Teachers with no availability config at all (isPermanent false AND an empty
// availableDays list — the User model default for every never-edited teacher)
// are treated as available all days. Previously they failed every slot and were
// silently dropped from generation: all their periods surfaced as conflicts.
const isTeacherAvailable = (teacher, day) => {
  if (!teacher) return false;
  if (teacher.isPermanent) return true;
  if (!teacher.availabilityConfigured) return true; // never configured → available all days
  const days = teacher.availableDays || [];
  return days.includes(day);
};

/**
 * POST /timetable/generate
 */
router.post('/timetable/generate', async (req, res) => {
  const academicYear = req.body.academicYear ||
    `${new Date().getFullYear()}-${new Date().getFullYear() + 1}`;

  try {
    // 1. Fetch school settings
    const settings = await SchoolSettings.findOne({ academicYear });
    if (!settings) {
      return res.status(400).json({
        success: false,
        message: `School schedule settings not found for academic year ${academicYear}. Please save settings first.`,
      });
    }

    const schoolDays = (req.body.schoolDays && req.body.schoolDays.length)
      ? req.body.schoolDays
      : (settings.schoolDays || ['Monday', 'Tuesday', 'Wednesday', 'Thursday', 'Friday']);

    // 2. Build the master list of period slots across all school days
    const allSlots = [];
    schoolDays.forEach((day) => allSlots.push(...buildPeriodSlots(day, settings)));
    const dayOrder = { Monday: 1, Tuesday: 2, Wednesday: 3, Thursday: 4, Friday: 5, Saturday: 6 };
    allSlots.sort((a, b) => (dayOrder[a.day] || 7) - (dayOrder[b.day] || 7) || a.periodNumber - b.periodNumber);

    // 3. Fetch active classes, teachers and subjects
    const [classes, teachers, subjects] = await Promise.all([
      SchoolClass.find({ isActive: true }).sort({ className: 1, department: 1, section: 1 }),
      User.find({ role: 'teacher', isActive: true }),
      Subject.find({}),
    ]);

    const teacherMap = new Map();
    teachers.forEach((t) => {
      const idStr = String(t._id);
      teacherMap.set(idStr, {
        id: idStr,
        name: t.name,
        subjectIds: (t.subjectIds || []).map(String),
        classIds: (t.classIds || []).map(String),
        isPermanent: !!t.isPermanent,
        availableDays: t.availableDays || [],
        // True only when the teacher has an explicit availability config saved.
        // Unconfigured teachers fall back to "available all days" in
        // isTeacherAvailable so they are never silently excluded.
        availabilityConfigured:
          !!t.isPermanent || (Array.isArray(t.availableDays) && t.availableDays.length > 0),
      });
    });

    // 4. Build the list of assignments: { classId, subjectId, teacherIds[], periods }
    const assignments = [];

    classes.forEach((cls) => {
      const classId = String(cls._id);
      const cycle = cls.cycle === '1st Cycle' ? 'first' : 'second';
      const displayName = `${cls.className}${cls.department ? ` ${cls.department}` : ''}${cls.section ? ` ${cls.section}` : ''}`;

      subjects.forEach((subj) => {
        const subjClassIds = (subj.classIds || []).map(String);
        if (!subjClassIds.includes(classId)) return;

        const eligibleTeachers = [];
        const checkTeacher = (t) => {
          if (t.classIds.includes(classId) && t.subjectIds.includes(String(subj._id))) {
            if (!eligibleTeachers.includes(t)) eligibleTeachers.push(t);
          }
        };

        (subj.teacherIds || []).forEach((tid) => {
          const t = teacherMap.get(String(tid));
          if (t) checkTeacher(t);
        });

        if (eligibleTeachers.length === 0) {
          teachers.forEach((t) => {
            const tm = teacherMap.get(String(t._id));
            if (tm) checkTeacher(tm);
          });
        }

        if (eligibleTeachers.length === 0) {
          assignments.push({
            classId, className: displayName, subjectId: String(subj._id),
            subjectName: subj.name, subjectCode: subj.code, cycle,
            teacherIds: [], teacherObjects: [], periods: subj.periodsPerWeek || 4,
            conflict: `No teacher assigned for ${subj.name} in this class`,
          });
          return;
        }

        assignments.push({
          classId, className: displayName, subjectId: String(subj._id),
          subjectName: subj.name, subjectCode: subj.code, cycle,
          teacherIds: eligibleTeachers.map((t) => t.id),
          teacherObjects: eligibleTeachers,
          periods: subj.periodsPerWeek || 4,
        });
      });
    });

    // 5. Assign teachers to slots (greedy, conflict-free)
    const generatedEntries = [];
    const teacherSlotUsage = new Set(); // "teacherId|day|periodNumber"
    const classSlotUsage = new Set();   // "classId|day|periodNumber"

    const sortableAssignments = assignments.filter((a) => a.teacherIds && a.teacherIds.length > 0);
    sortableAssignments.sort((a, b) => {
      if (a.teacherIds.length !== b.teacherIds.length) {
        return a.teacherIds.length - b.teacherIds.length;
      }
      return b.periods - a.periods;
    });

    const conflicts = [];

    for (const assignment of sortableAssignments) {
      let remainingPeriods = assignment.periods;
      let slotIndex = 0;

      while (remainingPeriods > 0 && slotIndex < allSlots.length) {
        const slot = allSlots[slotIndex];

        // Find a teacher for this assignment available at this slot.
        const availableTeacher = assignment.teacherObjects.find((t) => {
          if (!isTeacherAvailable(t, slot.day)) return false;
          const teacherKey = `${t.id}|${slot.day}|${slot.periodNumber}`;
          return !teacherSlotUsage.has(teacherKey);
        });

        if (!availableTeacher) {
          slotIndex += 1;
          continue;
        }

        const classKey = `${assignment.classId}|${slot.day}|${slot.periodNumber}`;
        const subjectAlreadyToday = generatedEntries.some(
          (e) =>
            e.classId === assignment.classId &&
            e.day === slot.day &&
            e.subjectId === assignment.subjectId
        );

        // A class may host different subjects at the same slot (different teachers)
        // but the same subject should not repeat on the same day for the same class.
        if (classSlotUsage.has(classKey) && subjectAlreadyToday) {
          slotIndex += 1;
          continue;
        }

        const ratePerPeriod = assignment.cycle === 'first' ? 500 : 700;

        generatedEntries.push({
          teacherId: assignment.teacherIds[0],
          classId: assignment.classId,
          subjectId: assignment.subjectId,
          day: slot.day,
          startTime: slot.startTime,
          endTime: slot.endTime,
          periodNumber: slot.periodNumber,
          cycle: assignment.cycle,
          ratePerPeriod,
          room: '',
          academicYear,
          isActive: true,
        });

        teacherSlotUsage.add(`${availableTeacher.id}|${slot.day}|${slot.periodNumber}`);
        classSlotUsage.add(classKey);
        remainingPeriods -= 1;
        slotIndex += 1;
      }

      if (remainingPeriods > 0) {
        const teacherName = assignment.teacherObjects[0]?.name || 'Unknown';
        conflicts.push({
          classId: assignment.classId,
          className: assignment.className,
          subjectId: assignment.subjectId,
          subjectName: assignment.subjectName,
          teacherId: assignment.teacherIds[0],
          teacherName,
          requestedPeriods: assignment.periods,
          placedPeriods: assignment.periods - remainingPeriods,
          reason: 'Not enough available teacher slots on the configured school days',
        });
      }
    }

    // Record assignments with no eligible teacher at all.
    assignments
      .filter((a) => !a.teacherIds || a.teacherIds.length === 0)
      .forEach((a) => {
        conflicts.push({
          classId: a.classId,
          className: a.className,
          subjectId: a.subjectId,
          subjectName: a.subjectName,
          teacherId: null,
          teacherName: 'No teacher assigned',
          requestedPeriods: a.periods,
          placedPeriods: 0,
          reason: a.conflict,
        });
      });

    // 6. Clear existing entries for the academic year and persist new ones
    await Timetable.deleteMany({ academicYear });

    let savedEntries = [];
    if (generatedEntries.length > 0) {
      savedEntries = await Timetable.insertMany(generatedEntries, { ordered: false });
    }

    const populatedEntries = await Promise.all(
      savedEntries.map((entry) =>
        Timetable.findById(entry._id)
          .populate("teacherId", "name email")
          .populate("classId", "className department")
          .populate("subjectId", "name code")
      )
    );

    res.status(200).json({
      success: true,
      data: {
        academicYear,
        totalPeriods: allSlots.length,
        generated: populatedEntries.length,
        conflicts,
        entries: populatedEntries,
      },
      message: `Timetable generated: ${populatedEntries.length} periods scheduled${conflicts.length ? `, ${conflicts.length} conflict(s) found` : ""}.`,
    });
  } catch (error) {
    console.error('❌ Error generating timetable:', error);
    res.status(500).json({
      success: false,
      message: 'Error generating timetable',
      error: error.message,
    });
  }
});

export default router;