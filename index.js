import 'dotenv/config';
import express from "express";
import os from "os";
import Bonjour from 'bonjour';
import mongoose from "mongoose";
import cors from "cors";
import helmet from "helmet";
import morgan from "morgan";
import { dbManager } from "./db/dbManager.js";

// Import routes
import marks from "./routes/mark.js";
import schoolclass from "./routes/schoolclass.js";
import student from "./routes/student.js";
import user from "./routes/user.js";
import subject from "./routes/subject.js";
import timetableRoutes from './routes/timetable.js';
import teacherAttendanceRoutes from './routes/teacherAttendance.js';
import teacherSalaryRoutes from './routes/teacherSalary.js';
import schoolSettings from "./routes/schoolSettings.js";

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
// The connection lifecycle (online MongoDB <-> local MongoDB, automatic
// switching and data sync) lives in db/dbManager.js and db/syncService.js.

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
    const dbStatus = dbManager.getStatus();
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
        dbMode: dbStatus.mode,
        sync: {
            syncing: dbStatus.syncing,
            offlineAvailable: dbStatus.offlineAvailable,
            lastSyncAt: dbStatus.lastSyncAt,
            lastSyncError: dbStatus.lastSyncError
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

// ==================== SYNC ENDPOINTS ====================
// Automatic sync runs via db/dbManager.js; these endpoints expose its status
// and allow a manual sync.
app.get("/api/sync/status", (req, res) => {
    res.json({ success: true, sync: dbManager.getStatus() });
});

app.post("/api/sync", async (req, res, next) => {
    try {
        if (dbManager.getStatus().mode !== 'online') {
            return res.status(409).json({
                success: false,
                message: 'Cannot sync while offline. Data will sync automatically when the internet returns.'
            });
        }
        const result = await dbManager.runSyncCycle('manual');
        if (!result) {
            return res.status(409).json({
                success: false,
                message: 'Sync unavailable (local database unreachable or a sync is already running).'
            });
        }
        res.json({ success: true, message: 'Sync completed', result });
    } catch (err) {
        next(err);
    }
});

// API routes
app.use("/api", marks);
app.use("/api", schoolclass);
app.use("/api", student);
app.use("/api", user);
app.use("/api", subject);
app.use("/api", schoolSettings);

app.use("/api", timetableRoutes);
app.use("/api", teacherAttendanceRoutes);
app.use("/api", teacherSalaryRoutes);
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

const printDbTroubleshooting = () => {
    console.error('\n================ DATABASE TROUBLESHOOTING ================');
    console.error('1. Check your internet connection.');
    console.error('2. MongoDB Atlas -> Network Access: make sure your current IP');
    console.error('   is whitelisted (or use 0.0.0.0/0 while testing).');
    console.error("3. If this network blocks Node's DNS SRV lookups, the app tries an");
    console.error('   automatic SRV -> standard URI conversion. If it still fails,');
    console.error('   replace MONGOURI with the standard connection string from');
    console.error('   Atlas UI -> Connect -> Drivers -> "Standard connection string", e.g.:');
    console.error('   mongodb://<user>:<password>@ac-xxxxx-shard-00-00.xxxxx.mongodb.net:27017,ac-xxxxx-shard-00-01.xxxxx.mongodb.net:27017,ac-xxxxx-shard-00-02.xxxxx.mongodb.net:27017/MANFESS?tls=true&authSource=admin&retryWrites=true&w=majority');
    console.error('4. Or set your DNS servers to 8.8.8.8 / 1.1.1.1 and restart the router.');
    console.error('==========================================================\n');
};

const startServer = async () => {
    try {
        // Connect to database: online MongoDB <-> local MongoDB with automatic
        // switching and data sync (see db/dbManager.js).
        await dbManager.init();

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

            // Advertise via mDNS (never crash the server over mDNS)
            const advertise = (name) => {
                try {
                    const service = bonjour.publish({
                        name,
                        type: 'http',
                        port: PORT,
                        host: HOSTNAME
                    });
                    // The name-conflict error is emitted ASYNC on the service,
                    // so it must be handled here (a try/catch cannot catch it).
                    service.on('error', (error) => {
                        console.warn('⚠️ mDNS advertisement failed:', error.message);
                        // Another instance/device already uses this name ->
                        // retry once with a unique name instead of crashing.
                        if (/already in use/i.test(error.message || '') && name === SERVICE_NAME) {
                            try { service.stop(() => {}); } catch { /* ignore */ }
                            const uniqueName = `${SERVICE_NAME} (${process.pid})`;
                            console.log(`📡 Retrying mDNS advertisement as "${uniqueName}"...`);
                            advertise(uniqueName);
                        }
                    });
                    console.log(`📡 mDNS active – ${name} on http://${HOSTNAME}.local:${PORT}`);
                } catch (error) {
                    console.warn('⚠️ mDNS advertisement failed:', error.message);
                }
            };
            advertise(SERVICE_NAME);

            console.log('=================================\n');
        });

        // Handle graceful shutdown
        const gracefulShutdown = async (signal) => {
            console.log(`\n🛑 Received ${signal}. Shutting down gracefully...`);

            // Stop the connectivity monitor
            dbManager.stopMonitor();

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
        printDbTroubleshooting();
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