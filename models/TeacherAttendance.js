import mongoose from 'mongoose';

const TeacherAttendanceSchema = new mongoose.Schema({
  teacherId: {
    type: mongoose.Schema.Types.ObjectId,
    ref: 'User',
    required: true
  },
  date: {
    type: Date,
    required: true,
    default: Date.now
  },
  checkIn: {
    type: String,
    validate: {
      validator: function(v) {
        return /^([0-1]?[0-9]|2[0-3]):[0-5][0-9]$/.test(v);
      },
      message: props => `${props.value} is not a valid time format!`
    }
  },
  checkOut: {
    type: String,
    validate: {
      validator: function(v) {
        return /^([0-1]?[0-9]|2[0-3]):[0-5][0-9]$/.test(v);
      },
      message: props => `${props.value} is not a valid time format!`
    }
  },
  status: {
    type: String,
    enum: ['present', 'absent', 'late', 'excused'],
    required: true,
    default: 'present'
  },
  hoursWorked: {
    type: Number,
    default: 0,
    min: 0
  },
  periodsTaught: {
    type: Number,
    default: 0,
    min: 0
  },
  notes: {
    type: String,
    trim: true
  },
  academicYear: {
    type: String,
    required: true,
    default: '2024-2025'
  },
  term: {
    type: String,
    enum: ['first', 'second', 'third'],
    default: 'first'
  },
  createdAt: {
    type: Date,
    default: Date.now
  },
  updatedAt: {
    type: Date,
    default: Date.now
  }
}, {
  timestamps: true
});

// Unique index for teacher attendance per day
TeacherAttendanceSchema.index(
  { teacherId: 1, date: 1 },
  { unique: true }
);

// Index for faster queries
TeacherAttendanceSchema.index({ teacherId: 1, date: -1 });
TeacherAttendanceSchema.index({ status: 1 });

const TeacherAttendance = mongoose.model('TeacherAttendance', TeacherAttendanceSchema);

export default TeacherAttendance;