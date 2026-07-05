import express from "express";
import mongoose from "mongoose";
import User from "../models/User.js"; // Adjust the path as needed

const router = express.Router();

// GET all users
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

        // Validate if ID is a valid ObjectId
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

        // Check if user already exists with same username or phone
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
        // Handle validation errors
        if (error.name === "ValidationError") {
            const errors = Object.values(error.errors).map(err => err.message);
            return res.status(400).json({
                success: false,
                message: "Validation error",
                errors: errors
            });
        }

        // Handle duplicate key error
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

        // Validate if ID is a valid ObjectId
        if (!mongoose.Types.ObjectId.isValid(id)) {
            return res.status(400).json({
                success: false,
                message: "Invalid user ID format"
            });
        }

        // Check if user exists
        const existingUser = await User.findById(id);
        if (!existingUser) {
            return res.status(404).json({
                success: false,
                message: "User not found"
            });
        }

        // Check for duplicate username or phone (excluding the current user)
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
                runValidators: true // This ensures validation runs on update
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

        // Validate if ID is a valid ObjectId
        if (!mongoose.Types.ObjectId.isValid(id)) {
            return res.status(400).json({
                success: false,
                message: "Invalid user ID format"
            });
        }

        // Check if user exists
        const existingUser = await User.findById(id);
        if (!existingUser) {
            return res.status(404).json({
                success: false,
                message: "User not found"
            });
        }

        // Check for duplicate username or phone if they're being updated
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

        // Validate if ID is a valid ObjectId
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
        // Add authorization check in production
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


router.post("/login", async (req, res) => {
    try {
        const { username } = req.body;

        // Validate input
        if (!username) {
            return res.status(400).json({
                success: false,
                message: "Username is required"
            });
        }

        // Find user by username
        const user = await User.findOne({ username: username.trim() });

        if (!user) {
            return res.status(401).json({
                success: false,
                message: "Invalid username"
            });
        }

        // Since there's no password, username acts as both username and password
        // The user is authenticated if they exist

        // Return user data (excluding sensitive fields if any)
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