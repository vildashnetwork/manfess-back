import express from "express";
import mongoose from "mongoose";
import SchoolSettings from "../models/SchoolSettings.js";

const router = express.Router();

// GET the school schedule settings for a given academic year.
// Defaults to the current academic year (YYYY-YYYY) if not provided.
router.get("/settings", async (req, res) => {
  try {
    const academicYear =
      req.query.academicYear ||
      `${new Date().getFullYear()}-${new Date().getFullYear() + 1}`;

    let settings = await SchoolSettings.findOne({ academicYear });

    if (!settings) {
      // Return sensible defaults so the UI is never empty.
      settings = {
        schoolStartTime: "08:00",
        schoolEndTime: "14:00",
        breakStart: "10:15",
        breakEnd: "10:30",
        periodDurationMinutes: 45,
        schoolDays: ["Monday", "Tuesday", "Wednesday", "Thursday", "Friday"],
        academicYear,
        periodsPerDay: 6,
      };
    }

    res.status(200).json({
      success: true,
      data: settings,
    });
  } catch (error) {
    console.error("Error fetching school settings:", error);
    res.status(500).json({
      success: false,
      message: "Error fetching school settings",
      error: error.message,
    });
  }
});

// POST / PUT — create or update the school schedule settings for an academic year.
router.post("/settings", async (req, res) => {
  try {
    const {
      schoolStartTime,
      schoolEndTime,
      breakStart,
      breakEnd,
      periodDurationMinutes,
      schoolDays,
      periodsPerDay,
    } = req.body;

    const academicYear =
      req.body.academicYear ||
      `${new Date().getFullYear()}-${new Date().getFullYear() + 1}`;

    // Basic validation
    const timeRe = /^([01]?[0-9]|2[0-3]):[0-5][0-9]$/;
    if (
      !timeRe.test(schoolStartTime) ||
      !timeRe.test(schoolEndTime) ||
      !timeRe.test(breakStart) ||
      !timeRe.test(breakEnd)
    ) {
      return res.status(400).json({
        success: false,
        message: "Invalid time format(s). Use HH:mm",
      });
    }

    // Break must happen within the school day.
    const startMin = (() => {
      const [h, m] = schoolStartTime.split(":").map(Number);
      return h * 60 + m;
    })();
    const endMin = (() => {
      const [h, m] = schoolEndTime.split(":").map(Number);
      return h * 60 + m;
    })();
    const brkStartMin = (() => {
      const [h, m] = breakStart.split(":").map(Number);
      return h * 60 + m;
    })();
    const brkEndMin = (() => {
      const [h, m] = breakEnd.split(":").map(Number);
      return h * 60 + m;
    })();

    if (startMin >= endMin) {
      return res.status(400).json({
        success: false,
        message: "School start time must be before end time",
      });
    }
    if (brkStartMin < startMin || brkEndMin > endMin) {
      return res.status(400).json({
        success: false,
        message: "Break must be within school hours",
      });
    }
    if (brkStartMin >= brkEndMin) {
      return res.status(400).json({
        success: false,
        message: "Break start must be before break end",
      });
    }

    const updates = {
      schoolStartTime,
      schoolEndTime,
      breakStart,
      breakEnd,
      periodDurationMinutes: Number(periodDurationMinutes) || 45,
      schoolDays: schoolDays || [
        "Monday",
        "Tuesday",
        "Wednesday",
        "Thursday",
        "Friday",
      ],
      periodsPerDay: Number(periodsPerDay) || 6,
    };

    // Upsert by academic year (unique index enforces one settings document/year).
    const settings = await SchoolSettings.findOneAndUpdate(
      { academicYear },
      updates,
      { new: true, upsert: true, runValidators: true }
    );

    res.status(200).json({
      success: true,
      data: settings,
      message: "School schedule settings saved",
    });
  } catch (error) {
    console.error("Error saving school settings:", error);
    res.status(500).json({
      success: false,
      message: "Error saving school settings",
      error: error.message,
    });
  }
});

export default router;
