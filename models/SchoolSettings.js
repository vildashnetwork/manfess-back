import mongoose from "mongoose";

const schoolSettingsSchema = new mongoose.Schema({
  schoolStartTime: {
    type: String,
    required: true,
    trim: true,
    validate: {
      validator: function (v) {
        return /^([01]?[0-9]|2[0-3]):[0-5][0-9]$/.test(v);
      },
      message: (props) => `${props.value} is not a valid HH:mm time`,
    },
  },
  schoolEndTime: {
    type: String,
    required: true,
    trim: true,
    validate: {
      validator: function (v) {
        return /^([01]?[0-9]|2[0-3]):[0-5][0-9]$/.test(v);
      },
      message: (props) => `${props.value} is not a valid HH:mm time`,
    },
  },
  breakStart: {
    type: String,
    required: true,
    trim: true,
    validate: {
      validator: function (v) {
        return /^([01]?[0-9]|2[0-3]):[0-5][0-9]$/.test(v);
      },
      message: (props) => `${props.value} is not a valid HH:mm time`,
    },
  },
  breakEnd: {
    type: String,
    required: true,
    trim: true,
    validate: {
      validator: function (v) {
        return /^([01]?[0-9]|2[0-3]):[0-5][0-9]$/.test(v);
      },
      message: (props) => `${props.value} is not a valid HH:mm time`,
    },
  },
  periodDurationMinutes: {
    type: Number,
    required: true,
    min: [10, "Period duration must be at least 10 minutes"],
    max: [120, "Period duration cannot exceed 120 minutes"],
    default: 45,
  },
  schoolDays: {
    type: [String],
    enum: [
      "Monday",
      "Tuesday",
      "Wednesday",
      "Thursday",
      "Friday",
      "Saturday",
    ],
    default: ["Monday", "Tuesday", "Wednesday", "Thursday", "Friday"],
  },
  academicYear: {
    type: String,
    required: true,
    trim: true,
    validate: {
      validator: function (v) {
        return /^\d{4}-\d{4}$/.test(v);
      },
      message: (props) =>
        `${props.value} is not a valid academic year format. Use YYYY-YYYY`,
    },
  },
  periodsPerDay: {
    type: Number,
    min: [1, "Must have at least 1 period"],
    max: [12, "Cannot exceed 12 periods"],
    default: 6,
  },
},
{
  timestamps: true,
});

// Ensure only one settings document per academic year
schoolSettingsSchema.index({ academicYear: 1 }, { unique: true });

const SchoolSettings = mongoose.model("SchoolSettings", schoolSettingsSchema);

export default SchoolSettings;