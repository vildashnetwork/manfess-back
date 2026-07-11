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
    ref: 'SchoolClass', // ✅ CHANGE from 'Class' to 'SchoolClass'
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
    required: true
  },
  endTime: {
    type: String,
    required: true
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
    default: 500
  },
  room: {
    type: String,
    trim: true
  },
  academicYear: {
    type: String,
    required: true,
    default: '2024-2025'
  },
  isActive: {
    type: Boolean,
    default: true
  }
}, {
  timestamps: true
});

// Indexes
TimetableSchema.index({ teacherId: 1, day: 1, startTime: 1 }, { unique: true });
TimetableSchema.index({ classId: 1, day: 1 });
TimetableSchema.index({ academicYear: 1 });

export default mongoose.model('Timetable', TimetableSchema);