import express from "express";
import os from "os";
import Bonjour from 'bonjour';
import mongoose from "mongoose";
import dotenv from "dotenv";
import cors from "cors";
import helmet from "helmet";
import morgan from "morgan";

// Import routes
import marks from "./routes/mark.js";
import schoolclass from "./routes/schoolclass.js";
import student from "./routes/student.js";
import user from "./routes/user.js";
import subject from "./routes/subject.js";

// Load environment variables
dotenv.config();

// ==================== INITIALIZATION ====================
const app = express();
const bonjour = Bonjour();

// ==================== CONFIGURATION ====================
const PORT = process.env.PORT || 5000;
const SERVICE_NAME = process.env.SERVICE_NAME || 'Manfess';
const HOSTNAME = process.env.HOSTNAME || 'manfess';
const MONGOURL = process.env.MONGOURI;
const NODE_ENV = process.env.NODE_ENV || 'development';

// ==================== DATABASE CONNECTION ====================
const connectDB = async (retryCount = 0) => {
    try {
        if (!MONGOURL) {
            throw new Error('MONGOURI environment variable is not defined');
        }

        // Clean the URL by removing any query parameters
        let cleanUrl = MONGOURL;
        if (cleanUrl.includes('?')) {
            const urlParts = cleanUrl.split('?');
            cleanUrl = urlParts[0];
            console.log('✅ Removed query parameters from MongoDB URL');
        }

        // Remove trailing slashes
        cleanUrl = cleanUrl.replace(/\/+$/, '');

        console.log(`🔄 Connecting to MongoDB... (Attempt ${retryCount + 1})`);

        const conn = await mongoose.connect(cleanUrl, {
            serverSelectionTimeoutMS: 5000,
            socketTimeoutMS: 45000,
            writeConcern: {
                w: 'majority'
            }
        });

        console.log(`✅ MongoDB Connected: ${conn.connection.host}`);
        console.log(`📊 Database: ${conn.connection.name}`);
        console.log(`🔗 Connection State: ${conn.connection.readyState === 1 ? 'Connected' : 'Disconnected'}`);

        // Handle connection events
        mongoose.connection.on('error', (err) => {
            console.error('❌ MongoDB connection error:', err);
        });

        mongoose.connection.on('disconnected', () => {
            console.log('⚠️ MongoDB disconnected. Attempting to reconnect...');
            setTimeout(() => connectDB(), 5000);
        });

        mongoose.connection.on('reconnected', () => {
            console.log('✅ MongoDB reconnected successfully');
        });

        return conn;

    } catch (err) {
        console.error(`❌ MongoDB Connection Error (Attempt ${retryCount + 1}):`, err.message);

        if (retryCount < 5) {
            const waitTime = (retryCount + 1) * 2000;
            console.log(`🔄 Retrying in ${waitTime / 1000} seconds...`);
            setTimeout(() => connectDB(retryCount + 1), waitTime);
        } else {
            console.error('❌ Failed to connect to MongoDB after 5 attempts. Exiting...');
            process.exit(1);
        }
    }
};

// ==================== UTILITY FUNCTIONS ====================
function getLocalIP() {
    const interfaces = os.networkInterfaces();
    for (const name of Object.keys(interfaces)) {
        for (const iface of interfaces[name]) {
            if (iface.family === "IPv4" && !iface.internal) {
                return iface.address;
            }
        }
    }
    return "127.0.0.1";
}

// ==================== MIDDLEWARE ====================
// JSON parsing with error handling
app.use(express.json({
    verify: (req, res, buf) => {
        try {
            JSON.parse(buf);
        } catch (e) {
            res.status(400).json({
                success: false,
                message: 'Invalid JSON format',
                errorType: 'JsonParseError'
            });
            throw e;
        }
    }
}));

app.use(express.urlencoded({ extended: true }));

// Security middleware
app.use(helmet({
    crossOriginResourcePolicy: { policy: "cross-origin" },
    contentSecurityPolicy: false // Disable if needed
}));

// Logging middleware
app.use(morgan(":method :url :status :response-time ms - :res[content-length]"));

// CORS middleware
const allowedOrigins = [
    "https://manfess-brand.vercel.app",
    "https://manfess.vildashnetwork.com",
    "http://localhost:5173",
    "http://localhost:3000",
    process.env.FRONTEND_URL
].filter(Boolean);

app.use(cors({
    origin: function (origin, callback) {
        // Allow requests with no origin (like mobile apps or curl requests)
        if (!origin) return callback(null, true);

        if (allowedOrigins.indexOf(origin) !== -1 || NODE_ENV === 'development') {
            callback(null, true);
        } else {
            callback(new Error('Not allowed by CORS'));
        }
    },
    methods: ["GET", "POST", "PUT", "PATCH", "DELETE", "OPTIONS"],
    allowedHeaders: ["Content-Type", "Authorization", "Accept"],
    credentials: true,
    maxAge: 86400 // 24 hours
}));

// ==================== ROUTES ====================
// Health check endpoint
app.get("/health", (req, res) => {
    const dbState = mongoose.connection.readyState;
    const states = {
        0: 'Disconnected',
        1: 'Connected',
        2: 'Connecting',
        3: 'Disconnecting'
    };

    res.status(200).json({
        status: 'OK',
        timestamp: new Date().toISOString(),
        service: SERVICE_NAME,
        environment: NODE_ENV,
        database: {
            state: states[dbState] || 'Unknown',
            host: mongoose.connection.host,
            name: mongoose.connection.name
        },
        uptime: process.uptime(),
        memory: process.memoryUsage()
    });
});

// Manifest endpoint
app.get("/manifest.json", (req, res) => {
    res.json({
        name: 'manfess',
        short_name: 'manfess',
        description: "School Management System",
        start_url: "/",
        display: "standalone",
        background_color: "#ffffff",
        theme_color: "#000000",
        icons: [
            {
                src: "/icon-192.png",
                sizes: "192x192",
                type: "image/png"
            }
        ]
    });
});

// Root endpoint
app.get("/", (req, res) => {
    res.json({
        message: "Welcome to Manfess API",
        version: "1.0.0",
        endpoints: {
            health: "/health",
            api: "/api",
            docs: "/api/docs"
        }
    });
});

// API routes
app.use("/api", marks);
app.use("/api", schoolclass);
app.use("/api", student);
app.use("/api", user);
app.use("/api", subject);

// 404 handler for undefined routes
app.use((req, res) => {
    res.status(404).json({
        success: false,
        message: `Route ${req.method} ${req.originalUrl} not found`,
        errorType: 'RouteNotFound'
    });
});

// ==================== GLOBAL ERROR HANDLER ====================
app.use((err, req, res, next) => {
    console.error('❌ Unhandled Error:', err);

    // Handle specific error types
    if (err.name === 'JsonWebTokenError') {
        return res.status(401).json({
            success: false,
            message: 'Invalid token',
            errorType: 'InvalidToken'
        });
    }

    if (err.name === 'TokenExpiredError') {
        return res.status(401).json({
            success: false,
            message: 'Token expired',
            errorType: 'TokenExpired'
        });
    }

    if (err.name === 'MongoServerError') {
        return res.status(500).json({
            success: false,
            message: 'Database error',
            errorType: 'DatabaseError',
            code: err.code
        });
    }

    // Default error response
    const statusCode = err.statusCode || 500;
    const message = err.message || 'Internal server error';

    res.status(statusCode).json({
        success: false,
        message: message,
        errorType: err.errorType || 'InternalServerError',
        ...(NODE_ENV === 'development' && { stack: err.stack })
    });
});

// ==================== SERVER STARTUP ====================
const ip = getLocalIP();

const startServer = async () => {
    try {
        // Connect to database
        await connectDB();

        // Start server
        app.listen(PORT, '0.0.0.0', () => {
            console.log('\n=================================');
            console.log(`🚀 ${SERVICE_NAME} Server`);
            console.log('=================================');
            console.log(`📍 Environment: ${NODE_ENV}`);
            console.log(`📍 Port: ${PORT}`);
            console.log(`📍 Local: http://localhost:${PORT}`);
            console.log(`📍 Network: http://${ip}:${PORT}`);
            console.log('=================================');

            // Advertise via mDNS
            try {
                bonjour.publish({
                    name: SERVICE_NAME,
                    type: 'http',
                    port: PORT,
                    host: HOSTNAME
                });
                console.log(`📡 mDNS active – http://${HOSTNAME}.local:${PORT}`);
            } catch (error) {
                console.warn('⚠️ mDNS advertisement failed:', error.message);
            }

            console.log('=================================\n');
        });

        // Handle graceful shutdown
        const gracefulShutdown = async (signal) => {
            console.log(`\n🛑 Received ${signal}. Shutting down gracefully...`);

            // Unpublish Bonjour
            bonjour.unpublishAll(() => {
                console.log('📡 Bonjour service unpublished');
            });

            // Close database connection
            await mongoose.connection.close();
            console.log('✅ MongoDB connection closed');

            // Close server
            process.exit(0);
        };

        process.on('SIGTERM', () => gracefulShutdown('SIGTERM'));
        process.on('SIGINT', () => gracefulShutdown('SIGINT'));

    } catch (error) {
        console.error('❌ Failed to start server:', error);
        process.exit(1);
    }
};

// Handle uncaught exceptions
process.on('uncaughtException', (error) => {
    console.error('❌ Uncaught Exception:', error);
    process.exit(1);
});

// Handle unhandled promise rejections
process.on('unhandledRejection', (reason, promise) => {
    console.error('❌ Unhandled Rejection:', reason);
    process.exit(1);
});

// Start the server
startServer();

export default app;