// models/Timetable.js
import mongoose from 'mongoose';

const TimetableSchema = new mongoose.Schema({
  teacherId: {
    type: mongoose.Schema.Types.ObjectId,
    ref: 'User',
    required: true
  },
  classId: {
    type: mongoose.Schema.Types.ObjectId,
    ref: 'SchoolClass',
    required: true
  },
  subjectId: {
    type: mongoose.Schema.Types.ObjectId,
    ref: 'Subject',
    required: true
  },
  day: {
    type: String,
    enum: ['Monday', 'Tuesday', 'Wednesday', 'Thursday', 'Friday', 'Saturday'],
    required: true
  },
  startTime: {
    type: String,
    required: true,
    validate: {
      validator: function (v) {
        return /^([0-1]?[0-9]|2[0-3]):[0-5][0-9]$/.test(v);
      },
      message: props => `${props.value} is not a valid time format! Use HH:mm`
    }
  },
  endTime: {
    type: String,
    required: true,
    validate: {
      validator: function (v) {
        return /^([0-1]?[0-9]|2[0-3]):[0-5][0-9]$/.test(v);
      },
      message: props => `${props.value} is not a valid time format! Use HH:mm`
    }
  },
  periodNumber: {
    type: Number,
    required: true,
    min: 1,
    max: 10
  },
  cycle: {
    type: String,
    enum: ['first', 'second'],
    required: true
  },
  ratePerPeriod: {
    type: Number,
    required: true,
    default: function () {
      return this.cycle === 'first' ? 500 : 700;
    }
  },
  room: {
    type: String,
    trim: true
  },
  academicYear: {
    type: String,
    required: true,
    default: '2026-2027',
    validate: {
      validator: function (v) {
        return /^\d{4}-\d{4}$/.test(v);
      },
      message: props => `${props.value} is not a valid academic year format. Use YYYY-YYYY`
    }
  },
  isActive: {
    type: Boolean,
    default: true
  }
}, {
  timestamps: true
});

// ============================================
// INDEXES - REMOVED UNIQUE CONSTRAINT
// ============================================

// ✅ INDEX: For querying teacher's timetable (NON-UNIQUE)
// This allows multiple entries for the same teacher at the same time
// Business logic (not database) will enforce the "teacher cannot teach two different classes" rule
TimetableSchema.index(
  { teacherId: 1, day: 1, startTime: 1, academicYear: 1 }
);

// ✅ INDEX: For querying class timetable (multiple subjects allowed per class)
TimetableSchema.index(
  { classId: 1, day: 1, startTime: 1, endTime: 1, academicYear: 1 }
);

// ✅ INDEX: For filtering by day
TimetableSchema.index(
  { day: 1, academicYear: 1 }
);

// ✅ INDEX: For academic year filtering
TimetableSchema.index({ academicYear: 1 });

// ✅ INDEX: For active status filtering
TimetableSchema.index({ isActive: 1 });

// ✅ INDEX: For sorting by day and time
TimetableSchema.index(
  { day: 1, startTime: 1, academicYear: 1 }
);

// ✅ INDEX: For teacher + day queries
TimetableSchema.index(
  { teacherId: 1, day: 1 }
);

// ============================================
// Pre-save middleware
// ============================================

TimetableSchema.pre('save', function () {
  if (this.cycle === 'first' && !this.ratePerPeriod) {
    this.ratePerPeriod = 500;
  } else if (this.cycle === 'second' && !this.ratePerPeriod) {
    this.ratePerPeriod = 700;
  }
});

// ============================================
// Instance Methods
// ============================================

// Check if a teacher has an overlapping period
TimetableSchema.methods.isOverlapping = async function () {
  try {
    const existing = await this.constructor.findOne({
      _id: { $ne: this._id },
      teacherId: this.teacherId,
      day: this.day,
      academicYear: this.academicYear,
      $or: [
        { startTime: { $lt: this.endTime, $gte: this.startTime } },
        { endTime: { $gt: this.startTime, $lte: this.endTime } },
        { startTime: { $lte: this.startTime }, endTime: { $gte: this.endTime } }
      ]
    });
    return !!existing;
  } catch (error) {
    console.error('Error checking overlap:', error);
    return false;
  }
};

// Get all subjects for a class at a specific time
TimetableSchema.methods.getClassSubjectsAtTime = async function () {
  try {
    const entries = await this.constructor.find({
      classId: this.classId,
      day: this.day,
      startTime: this.startTime,
      academicYear: this.academicYear,
      isActive: true
    }).populate('subjectId', 'name code');

    return entries;
  } catch (error) {
    console.error('Error getting class subjects:', error);
    return [];
  }
};

// ============================================
// Static Methods
// ============================================

// Get timetable for a teacher on a specific day
TimetableSchema.statics.getTeacherDaySchedule = async function (teacherId, day, academicYear) {
  try {
    return this.find({
      teacherId,
      day,
      academicYear: academicYear || '2026-2027',
      isActive: true
    })
      .populate('classId', 'className department')
      .populate('subjectId', 'name code')
      .sort({ startTime: 1 });
  } catch (error) {
    console.error('Error getting teacher schedule:', error);
    throw error;
  }
};

// Get timetable for a class on a specific day
TimetableSchema.statics.getClassDaySchedule = async function (classId, day, academicYear) {
  try {
    return this.find({
      classId,
      day,
      academicYear: academicYear || '2026-2027',
      isActive: true
    })
      .populate('teacherId', 'name email')
      .populate('subjectId', 'name code')
      .sort({ startTime: 1 });
  } catch (error) {
    console.error('Error getting class schedule:', error);
    throw error;
  }
};

// Get all unique academic years with data
TimetableSchema.statics.getAcademicYears = async function () {
  try {
    return this.distinct('academicYear', { isActive: true });
  } catch (error) {
    console.error('Error getting academic years:', error);
    return [];
  }
};

// Virtual fields
TimetableSchema.virtual('duration').get(function () {
  if (this.startTime && this.endTime) {
    const start = new Date(`1970-01-01T${this.startTime}:00`);
    const end = new Date(`1970-01-01T${this.endTime}:00`);
    const diff = (end - start) / (1000 * 60);
    return `${diff} minutes`;
  }
  return 'N/A';
});

// Ensure virtuals are included in JSON output
TimetableSchema.set('toJSON', { virtuals: true });
TimetableSchema.set('toObject', { virtuals: true });

export default mongoose.model('Timetable', TimetableSchema);