// import express from "express";
// import mongoose from "mongoose";
// import User from "../models/User.js"; // Adjust the path as needed

// const router = express.Router();

// // GET all users
// router.get("/users", async (req, res) => {
//     try {
//         const users = await User.find();
//         res.status(200).json({
//             success: true,
//             count: users.length,
//             data: users
//         });
//     } catch (error) {
//         res.status(500).json({
//             success: false,
//             message: "Error fetching users",
//             error: error.message
//         });
//     }
// });

// // GET a single user by ID
// router.get("/users/:id", async (req, res) => {
//     try {
//         const { id } = req.params;

//         // Validate if ID is a valid ObjectId
//         if (!mongoose.Types.ObjectId.isValid(id)) {
//             return res.status(400).json({
//                 success: false,
//                 message: "Invalid user ID format"
//             });
//         }

//         const user = await User.findById(id);

//         if (!user) {
//             return res.status(404).json({
//                 success: false,
//                 message: "User not found"
//             });
//         }

//         res.status(200).json({
//             success: true,
//             data: user
//         });
//     } catch (error) {
//         res.status(500).json({
//             success: false,
//             message: "Error fetching user",
//             error: error.message
//         });
//     }
// });

// // GET users by role
// router.get("/users/role/:role", async (req, res) => {
//     try {
//         const { role } = req.params;
//         const users = await User.find({ role });

//         res.status(200).json({
//             success: true,
//             count: users.length,
//             data: users
//         });
//     } catch (error) {
//         res.status(500).json({
//             success: false,
//             message: "Error fetching users by role",
//             error: error.message
//         });
//     }
// });

// // GET users by academic year
// router.get("/users/academic-year/:year", async (req, res) => {
//     try {
//         const { year } = req.params;
//         const users = await User.find({ acedemicYear: year });

//         res.status(200).json({
//             success: true,
//             count: users.length,
//             data: users
//         });
//     } catch (error) {
//         res.status(500).json({
//             success: false,
//             message: "Error fetching users by academic year",
//             error: error.message
//         });
//     }
// });

// // POST - Create a new user
// router.post("/users", async (req, res) => {
//     try {
//         const userData = req.body;

//         // Check if user already exists with same username or phone
//         const existingUser = await User.findOne({
//             $or: [
//                 { username: userData.username },
//                 { phone: userData.phone }
//             ]
//         });

//         if (existingUser) {
//             return res.status(400).json({
//                 success: false,
//                 message: "User with this username or phone already exists"
//             });
//         }

//         const user = new User(userData);
//         await user.save();

//         res.status(201).json({
//             success: true,
//             message: "User created successfully",
//             data: user
//         });
//     } catch (error) {
//         // Handle validation errors
//         if (error.name === "ValidationError") {
//             const errors = Object.values(error.errors).map(err => err.message);
//             return res.status(400).json({
//                 success: false,
//                 message: "Validation error",
//                 errors: errors
//             });
//         }

//         // Handle duplicate key error
//         if (error.code === 11000) {
//             const field = Object.keys(error.keyPattern)[0];
//             return res.status(400).json({
//                 success: false,
//                 message: `Duplicate value for ${field}. Please use a unique value.`
//             });
//         }

//         res.status(500).json({
//             success: false,
//             message: "Error creating user",
//             error: error.message
//         });
//     }
// });

// // PUT - Update an entire user
// router.put("/users/:id", async (req, res) => {
//     try {
//         const { id } = req.params;
//         const userData = req.body;

//         // Validate if ID is a valid ObjectId
//         if (!mongoose.Types.ObjectId.isValid(id)) {
//             return res.status(400).json({
//                 success: false,
//                 message: "Invalid user ID format"
//             });
//         }

//         // Check if user exists
//         const existingUser = await User.findById(id);
//         if (!existingUser) {
//             return res.status(404).json({
//                 success: false,
//                 message: "User not found"
//             });
//         }

//         // Check for duplicate username or phone (excluding the current user)
//         const duplicateCheck = await User.findOne({
//             $and: [
//                 { _id: { $ne: id } },
//                 {
//                     $or: [
//                         { username: userData.username },
//                         { phone: userData.phone }
//                     ]
//                 }
//             ]
//         });

//         if (duplicateCheck) {
//             return res.status(400).json({
//                 success: false,
//                 message: "Another user with this username or phone already exists"
//             });
//         }

//         const updatedUser = await User.findByIdAndUpdate(
//             id,
//             userData,
//             {
//                 new: true,
//                 runValidators: true // This ensures validation runs on update
//             }
//         );

//         res.status(200).json({
//             success: true,
//             message: "User updated successfully",
//             data: updatedUser
//         });
//     } catch (error) {
//         if (error.name === "ValidationError") {
//             const errors = Object.values(error.errors).map(err => err.message);
//             return res.status(400).json({
//                 success: false,
//                 message: "Validation error",
//                 errors: errors
//             });
//         }

//         res.status(500).json({
//             success: false,
//             message: "Error updating user",
//             error: error.message
//         });
//     }
// });

// // PATCH - Partially update a user
// router.patch("/users/:id", async (req, res) => {
//     try {
//         const { id } = req.params;
//         const userData = req.body;

//         // Validate if ID is a valid ObjectId
//         if (!mongoose.Types.ObjectId.isValid(id)) {
//             return res.status(400).json({
//                 success: false,
//                 message: "Invalid user ID format"
//             });
//         }

//         // Check if user exists
//         const existingUser = await User.findById(id);
//         if (!existingUser) {
//             return res.status(404).json({
//                 success: false,
//                 message: "User not found"
//             });
//         }

//         // Check for duplicate username or phone if they're being updated
//         if (userData.username || userData.phone) {
//             const duplicateCheck = await User.findOne({
//                 $and: [
//                     { _id: { $ne: id } },
//                     {
//                         $or: [
//                             ...(userData.username ? [{ username: userData.username }] : []),
//                             ...(userData.phone ? [{ phone: userData.phone }] : [])
//                         ]
//                     }
//                 ]
//             });

//             if (duplicateCheck) {
//                 return res.status(400).json({
//                     success: false,
//                     message: "Another user with this username or phone already exists"
//                 });
//             }
//         }

//         const updatedUser = await User.findByIdAndUpdate(
//             id,
//             userData,
//             {
//                 new: true,
//                 runValidators: true
//             }
//         );

//         res.status(200).json({
//             success: true,
//             message: "User updated successfully",
//             data: updatedUser
//         });
//     } catch (error) {
//         if (error.name === "ValidationError") {
//             const errors = Object.values(error.errors).map(err => err.message);
//             return res.status(400).json({
//                 success: false,
//                 message: "Validation error",
//                 errors: errors
//             });
//         }

//         res.status(500).json({
//             success: false,
//             message: "Error updating user",
//             error: error.message
//         });
//     }
// });

// // DELETE - Delete a user
// router.delete("/users/:id", async (req, res) => {
//     try {
//         const { id } = req.params;

//         // Validate if ID is a valid ObjectId
//         if (!mongoose.Types.ObjectId.isValid(id)) {
//             return res.status(400).json({
//                 success: false,
//                 message: "Invalid user ID format"
//             });
//         }

//         const user = await User.findById(id);

//         if (!user) {
//             return res.status(404).json({
//                 success: false,
//                 message: "User not found"
//             });
//         }

//         await User.findByIdAndDelete(id);

//         res.status(200).json({
//             success: true,
//             message: "User deleted successfully",
//             data: user
//         });
//     } catch (error) {
//         res.status(500).json({
//             success: false,
//             message: "Error deleting user",
//             error: error.message
//         });
//     }
// });

// // DELETE - Delete all users (use with caution)
// router.delete("/users", async (req, res) => {
//     try {
//         // Add authorization check in production
//         const result = await User.deleteMany({});

//         res.status(200).json({
//             success: true,
//             message: `${result.deletedCount} users deleted successfully`,
//             deletedCount: result.deletedCount
//         });
//     } catch (error) {
//         res.status(500).json({
//             success: false,
//             message: "Error deleting users",
//             error: error.message
//         });
//     }
// });


// router.post("/login", async (req, res) => {
//     try {
//         const { username } = req.body;

//         // Validate input
//         if (!username) {
//             return res.status(400).json({
//                 success: false,
//                 message: "Username is required"
//             });
//         }

//         // Find user by username
//         const user = await User.findOne({ username: username.trim() });

//         if (!user) {
//             return res.status(401).json({
//                 success: false,
//                 message: "Invalid username"
//             });
//         }

//         // Since there's no password, username acts as both username and password
//         // The user is authenticated if they exist

//         // Return user data (excluding sensitive fields if any)
//         res.status(200).json({
//             success: true,
//             message: "Login successful",
//             data: {
//                 id: user._id,
//                 name: user.name,
//                 username: user.username,
//                 phone: user.phone,
//                 role: user.role,
//                 qualification: user.qualification,
//                 subjectIds: user.subjectIds,
//                 classIds: user.classIds,
//                 acedemicYear: user.acedemicYear,
//                 createdAt: user.createdAt,
//                 updatedAt: user.updatedAt
//             }
//         });
//     } catch (error) {
//         console.error("Login error:", error);
//         res.status(500).json({
//             success: false,
//             message: "Error during login",
//             error: error.message
//         });
//     }
// });


// export default router;










































import express from "express";
import mongoose from "mongoose";
import User from "../models/User.js";
import Timetable from '../models/Timetable.js';
const router = express.Router();

// ============================================
// GET Teacher Timetable
// ============================================

router.get('/teacher/timetable', async (req, res) => {
  try {
    const { teacherId, username, email } = req.query;
    
    console.log('📌 Fetching teacher timetable:', { teacherId, username, email });
    
    // Find teacher by ID, username, or email
    let teacher;
    if (teacherId) {
      // Check if it's a valid ObjectId
      if (mongoose.Types.ObjectId.isValid(teacherId)) {
        teacher = await User.findById(teacherId);
      } else {
        // Try to find by username or id string
        teacher = await User.findOne({ 
          $or: [
            { username: teacherId },
            { _id: teacherId }
          ]
        });
      }
    } else if (username) {
      teacher = await User.findOne({ username: username });
    } else if (email) {
      teacher = await User.findOne({ email: email });
    } else {
      return res.status(400).json({
        success: false,
        message: 'Please provide teacherId, username, or email'
      });
    }

    if (!teacher) {
      return res.status(404).json({
        success: false,
        message: 'Teacher not found'
      });
    }

    console.log('✅ Teacher found:', teacher.name, 'Role:', teacher.role);

    // Check if user is a teacher (or admin/super_admin)
    const allowedRoles = ['teacher', 'admin', 'super_admin'];
    if (!allowedRoles.includes(teacher.role)) {
      return res.status(403).json({
        success: false,
        message: `User is not authorized. Role: ${teacher.role}`
      });
    }

    // Get teacher's timetable
    const { day, academicYear } = req.query;
    
    let filter = { 
      teacherId: teacher._id, 
      isActive: true 
    };
    
    if (day) filter.day = day;
    if (academicYear) filter.academicYear = academicYear;
    
    // Try to find timetable - return empty if none
    let timetable = [];
    try {
      timetable = await Timetable.find(filter)
        .populate('classId', 'className department')
        .populate('subjectId', 'name code')
        .sort({ day: 1, startTime: 1 });
    } catch (err) {
      console.log('⚠️ Timetable query error:', err.message);
      // Return empty array if table doesn't exist
    }

    console.log(`📚 Found ${timetable.length} timetable entries`);

    // Group by day
    const days = ['Monday', 'Tuesday', 'Wednesday', 'Thursday', 'Friday', 'Saturday'];
    const groupedByDay = {};
    days.forEach(d => {
      groupedByDay[d] = timetable.filter(t => t.day === d);
    });

    // Calculate statistics
    const stats = {
      totalPeriods: timetable.length,
      firstCyclePeriods: timetable.filter(t => t.cycle === 'first').length,
      secondCyclePeriods: timetable.filter(t => t.cycle === 'second').length,
      totalPotentialEarnings: timetable.reduce((sum, t) => sum + (t.ratePerPeriod || 0), 0),
      days: [...new Set(timetable.map(t => t.day))]
    };

    res.status(200).json({
      success: true,
      data: {
        teacher: {
          id: teacher._id,
          name: teacher.name || 'Unknown',
          email: teacher.email || '',
          username: teacher.username || '',
          qualification: teacher.qualification || '',
          role: teacher.role || 'teacher'
        },
        stats: stats,
        timetable: timetable,
        groupedByDay: groupedByDay,
        totalEntries: timetable.length
      }
    });
  } catch (error) {
    console.error('❌ Error fetching teacher timetable:', error);
    res.status(500).json({
      success: false,
      message: 'Error fetching teacher timetable',
      error: error.message
    });
  }
});

// ============================================
// GET Teacher Weekly Schedule
// ============================================

router.get('/teacher/weekly', async (req, res) => {
  try {
    const { teacherId, username, email, academicYear } = req.query;
    
    console.log('📌 Fetching weekly schedule:', { teacherId, username, email });
    
    // Find teacher
    let teacher;
    if (teacherId) {
      if (mongoose.Types.ObjectId.isValid(teacherId)) {
        teacher = await User.findById(teacherId);
      } else {
        teacher = await User.findOne({ 
          $or: [
            { username: teacherId },
            { _id: teacherId }
          ]
        });
      }
    } else if (username) {
      teacher = await User.findOne({ username: username });
    } else if (email) {
      teacher = await User.findOne({ email: email });
    } else {
      return res.status(400).json({
        success: false,
        message: 'Please provide teacherId, username, or email'
      });
    }

    if (!teacher) {
      return res.status(404).json({
        success: false,
        message: 'Teacher not found'
      });
    }

    console.log('✅ Teacher found:', teacher.name);

    const currentDay = new Date().toLocaleString('en-US', { weekday: 'long' });
    const currentTime = new Date().toLocaleTimeString('en-US', { hour: '2-digit', minute: '2-digit', hour12: false });
    
    let timetable = [];
    try {
      timetable = await Timetable.find({
        teacherId: teacher._id,
        isActive: true,
        academicYear: academicYear || '2024-2025'
      })
      .populate('classId', 'className department')
      .populate('subjectId', 'name code')
      .sort({ day: 1, startTime: 1 });
    } catch (err) {
      console.log('⚠️ Timetable query error:', err.message);
    }

    const todaySchedule = timetable.filter(t => t.day === currentDay);
    const upcomingToday = todaySchedule.filter(t => t.startTime >= currentTime);
    const nextPeriod = upcomingToday.length > 0 ? upcomingToday[0] : null;

    res.status(200).json({
      success: true,
      data: {
        teacher: {
          id: teacher._id,
          name: teacher.name,
          email: teacher.email
        },
        currentDay: currentDay,
        todaySchedule: todaySchedule,
        upcomingToday: upcomingToday,
        nextPeriod: nextPeriod,
        weeklySchedule: timetable,
        stats: {
          totalPeriods: timetable.length,
          todayPeriods: todaySchedule.length,
          remainingToday: upcomingToday.length
        }
      }
    });
  } catch (error) {
    console.error('❌ Error fetching weekly schedule:', error);
    res.status(500).json({
      success: false,
      message: 'Error fetching weekly schedule',
      error: error.message
    });
  }
});

// ============================================
// GET Teacher Day Schedule
// ============================================

router.get('/teacher/schedule/:day', async (req, res) => {
  try {
    const { day } = req.params;
    const { teacherId, username, email, academicYear } = req.query;
    
    console.log(`📌 Fetching schedule for ${day}:`, { teacherId, username, email });
    
    // Find teacher
    let teacher;
    if (teacherId) {
      if (mongoose.Types.ObjectId.isValid(teacherId)) {
        teacher = await User.findById(teacherId);
      } else {
        teacher = await User.findOne({ 
          $or: [
            { username: teacherId },
            { _id: teacherId }
          ]
        });
      }
    } else if (username) {
      teacher = await User.findOne({ username: username });
    } else if (email) {
      teacher = await User.findOne({ email: email });
    } else {
      return res.status(400).json({
        success: false,
        message: 'Please provide teacherId, username, or email'
      });
    }

    if (!teacher) {
      return res.status(404).json({
        success: false,
        message: 'Teacher not found'
      });
    }

    console.log('✅ Teacher found:', teacher.name);

    let timetable = [];
    try {
      timetable = await Timetable.find({
        teacherId: teacher._id,
        day: day,
        isActive: true,
        academicYear: academicYear || '2024-2025'
      })
      .populate('classId', 'className department')
      .populate('subjectId', 'name code')
      .sort({ startTime: 1 });
    } catch (err) {
      console.log('⚠️ Timetable query error:', err.message);
    }

    const totalPeriods = timetable.length;
    const totalEarnings = timetable.reduce((sum, t) => sum + (t.ratePerPeriod || 0), 0);
    const firstCycle = timetable.filter(t => t.cycle === 'first').length;
    const secondCycle = timetable.filter(t => t.cycle === 'second').length;

    res.status(200).json({
      success: true,
      data: {
        teacher: {
          id: teacher._id,
          name: teacher.name,
          email: teacher.email
        },
        day: day,
        schedule: timetable,
        stats: {
          totalPeriods: totalPeriods,
          totalEarnings: totalEarnings,
          firstCyclePeriods: firstCycle,
          secondCyclePeriods: secondCycle
        }
      }
    });
  } catch (error) {
    console.error('❌ Error fetching day schedule:', error);
    res.status(500).json({
      success: false,
      message: 'Error fetching day schedule',
      error: error.message
    });
  }
});

// ============================================
// GET all users
// ============================================

router.get("/users", async (req, res) => {
    try {
        const users = await User.find();
        res.status(200).json({
            success: true,
            count: users.length,
            data: users
        });
    } catch (error) {
        res.status(500).json({
            success: false,
            message: "Error fetching users",
            error: error.message
        });
    }
});

// GET a single user by ID
router.get("/users/:id", async (req, res) => {
    try {
        const { id } = req.params;

        if (!mongoose.Types.ObjectId.isValid(id)) {
            return res.status(400).json({
                success: false,
                message: "Invalid user ID format"
            });
        }

        const user = await User.findById(id);

        if (!user) {
            return res.status(404).json({
                success: false,
                message: "User not found"
            });
        }

        res.status(200).json({
            success: true,
            data: user
        });
    } catch (error) {
        res.status(500).json({
            success: false,
            message: "Error fetching user",
            error: error.message
        });
    }
});

// GET users by role
router.get("/users/role/:role", async (req, res) => {
    try {
        const { role } = req.params;
        const users = await User.find({ role });

        res.status(200).json({
            success: true,
            count: users.length,
            data: users
        });
    } catch (error) {
        res.status(500).json({
            success: false,
            message: "Error fetching users by role",
            error: error.message
        });
    }
});

// GET users by academic year
router.get("/users/academic-year/:year", async (req, res) => {
    try {
        const { year } = req.params;
        const users = await User.find({ acedemicYear: year });

        res.status(200).json({
            success: true,
            count: users.length,
            data: users
        });
    } catch (error) {
        res.status(500).json({
            success: false,
            message: "Error fetching users by academic year",
            error: error.message
        });
    }
});

// POST - Create a new user
router.post("/users", async (req, res) => {
    try {
        const userData = req.body;

        const existingUser = await User.findOne({
            $or: [
                { username: userData.username },
                { phone: userData.phone }
            ]
        });

        if (existingUser) {
            return res.status(400).json({
                success: false,
                message: "User with this username or phone already exists"
            });
        }

        const user = new User(userData);
        await user.save();

        res.status(201).json({
            success: true,
            message: "User created successfully",
            data: user
        });
    } catch (error) {
        if (error.name === "ValidationError") {
            const errors = Object.values(error.errors).map(err => err.message);
            return res.status(400).json({
                success: false,
                message: "Validation error",
                errors: errors
            });
        }

        if (error.code === 11000) {
            const field = Object.keys(error.keyPattern)[0];
            return res.status(400).json({
                success: false,
                message: `Duplicate value for ${field}. Please use a unique value.`
            });
        }

        res.status(500).json({
            success: false,
            message: "Error creating user",
            error: error.message
        });
    }
});

// PUT - Update an entire user
router.put("/users/:id", async (req, res) => {
    try {
        const { id } = req.params;
        const userData = req.body;

        if (!mongoose.Types.ObjectId.isValid(id)) {
            return res.status(400).json({
                success: false,
                message: "Invalid user ID format"
            });
        }

        const existingUser = await User.findById(id);
        if (!existingUser) {
            return res.status(404).json({
                success: false,
                message: "User not found"
            });
        }

        const duplicateCheck = await User.findOne({
            $and: [
                { _id: { $ne: id } },
                {
                    $or: [
                        { username: userData.username },
                        { phone: userData.phone }
                    ]
                }
            ]
        });

        if (duplicateCheck) {
            return res.status(400).json({
                success: false,
                message: "Another user with this username or phone already exists"
            });
        }

        const updatedUser = await User.findByIdAndUpdate(
            id,
            userData,
            {
                new: true,
                runValidators: true
            }
        );

        res.status(200).json({
            success: true,
            message: "User updated successfully",
            data: updatedUser
        });
    } catch (error) {
        if (error.name === "ValidationError") {
            const errors = Object.values(error.errors).map(err => err.message);
            return res.status(400).json({
                success: false,
                message: "Validation error",
                errors: errors
            });
        }

        res.status(500).json({
            success: false,
            message: "Error updating user",
            error: error.message
        });
    }
});

// PATCH - Partially update a user
router.patch("/users/:id", async (req, res) => {
    try {
        const { id } = req.params;
        const userData = req.body;

        if (!mongoose.Types.ObjectId.isValid(id)) {
            return res.status(400).json({
                success: false,
                message: "Invalid user ID format"
            });
        }

        const existingUser = await User.findById(id);
        if (!existingUser) {
            return res.status(404).json({
                success: false,
                message: "User not found"
            });
        }

        if (userData.username || userData.phone) {
            const duplicateCheck = await User.findOne({
                $and: [
                    { _id: { $ne: id } },
                    {
                        $or: [
                            ...(userData.username ? [{ username: userData.username }] : []),
                            ...(userData.phone ? [{ phone: userData.phone }] : [])
                        ]
                    }
                ]
            });

            if (duplicateCheck) {
                return res.status(400).json({
                    success: false,
                    message: "Another user with this username or phone already exists"
                });
            }
        }

        const updatedUser = await User.findByIdAndUpdate(
            id,
            userData,
            {
                new: true,
                runValidators: true
            }
        );

        res.status(200).json({
            success: true,
            message: "User updated successfully",
            data: updatedUser
        });
    } catch (error) {
        if (error.name === "ValidationError") {
            const errors = Object.values(error.errors).map(err => err.message);
            return res.status(400).json({
                success: false,
                message: "Validation error",
                errors: errors
            });
        }

        res.status(500).json({
            success: false,
            message: "Error updating user",
            error: error.message
        });
    }
});

// DELETE - Delete a user
router.delete("/users/:id", async (req, res) => {
    try {
        const { id } = req.params;

        if (!mongoose.Types.ObjectId.isValid(id)) {
            return res.status(400).json({
                success: false,
                message: "Invalid user ID format"
            });
        }

        const user = await User.findById(id);

        if (!user) {
            return res.status(404).json({
                success: false,
                message: "User not found"
            });
        }

        await User.findByIdAndDelete(id);

        res.status(200).json({
            success: true,
            message: "User deleted successfully",
            data: user
        });
    } catch (error) {
        res.status(500).json({
            success: false,
            message: "Error deleting user",
            error: error.message
        });
    }
});

// DELETE - Delete all users (use with caution)
router.delete("/users", async (req, res) => {
    try {
        const result = await User.deleteMany({});

        res.status(200).json({
            success: true,
            message: `${result.deletedCount} users deleted successfully`,
            deletedCount: result.deletedCount
        });
    } catch (error) {
        res.status(500).json({
            success: false,
            message: "Error deleting users",
            error: error.message
        });
    }
});

// ============================================
// LOGIN
// ============================================

router.post("/login", async (req, res) => {
    try {
        const { username } = req.body;

        if (!username) {
            return res.status(400).json({
                success: false,
                message: "Username is required"
            });
        }

        const user = await User.findOne({ username: username.trim() });

        if (!user) {
            return res.status(401).json({
                success: false,
                message: "Invalid username"
            });
        }

        res.status(200).json({
            success: true,
            message: "Login successful",
            data: {
                id: user._id,
                name: user.name,
                username: user.username,
                phone: user.phone,
                role: user.role,
                qualification: user.qualification,
                subjectIds: user.subjectIds,
                classIds: user.classIds,
                acedemicYear: user.acedemicYear,
                createdAt: user.createdAt,
                updatedAt: user.updatedAt
            }
        });
    } catch (error) {
        console.error("Login error:", error);
        res.status(500).json({
            success: false,
            message: "Error during login",
            error: error.message
        });
    }
});

export default router;