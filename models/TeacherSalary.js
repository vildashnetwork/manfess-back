import mongoose from 'mongoose';

const TeacherSalarySchema = new mongoose.Schema({
  teacherId: {
    type: mongoose.Schema.Types.ObjectId,
    ref: 'User',
    required: true
  },
  month: {
    type: String,
    required: true,
    enum: ['January', 'February', 'March', 'April', 'May', 'June', 
            'July', 'August', 'September', 'October', 'November', 'December']
  },
  year: {
    type: String,
    required: true
  },
  periodCounts: {
    firstCycle: {
      type: Number,
      default: 0
    },
    secondCycle: {
      type: Number,
      default: 0
    },
    total: {
      type: Number,
      default: 0
    }
  },
  rates: {
    firstCycle: {
      type: Number,
      default: 500
    },
    secondCycle: {
      type: Number,
      default: 700
    }
  },
  grossSalary: {
    type: Number,
    required: true,
    default: 0
  },
  deductions: {
    total: {
      type: Number,
      default: 0
    },
    details: [{
      type: {
        type: String,
        enum: ['absence', 'late', 'other']
      },
      amount: Number,
      description: String,
      date: Date
    }]
  },
  netSalary: {
    type: Number,
    required: true,
    default: 0
  },
  attendance: {
    present: { type: Number, default: 0 },
    absent: { type: Number, default: 0 },
    late: { type: Number, default: 0 },
    excused: { type: Number, default: 0 }
  },
  status: {
    type: String,
    enum: ['pending', 'paid', 'partially_paid'],
    default: 'pending'
  },
  paymentDate: {
    type: Date
  },
  paymentMethod: {
    type: String,
    enum: ['cash', 'bank_transfer', 'mobile_money', 'check']
  },
  transactionId: {
    type: String
  },
  notes: {
    type: String
  },
  academicYear: {
    type: String,
    required: true
  },
  term: {
    type: String,
    enum: ['first', 'second', 'third'],
    required: true
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

// Unique index for teacher salary per month
TeacherSalarySchema.index(
  { teacherId: 1, month: 1, year: 1 },
  { unique: true }
);

// Index for faster queries
TeacherSalarySchema.index({ teacherId: 1, year: 1 });
TeacherSalarySchema.index({ status: 1 });

// Pre-save hook to calculate net salary
TeacherSalarySchema.pre('save', function(next) {
  this.netSalary = this.grossSalary - this.deductions.total;
  next();
});

const TeacherSalary = mongoose.model('TeacherSalary', TeacherSalarySchema);


export default TeacherSalary