import express from "express";
import os from "os";
import Bonjour from 'bonjour';
import mongoose from "mongoose";
import dotenv from "dotenv";
import cors from "cors";
import helmet from "helmet";
import morgan from "morgan";
import dns from "dns";
import { execFile } from "child_process";

// Import routes
import marks from "./routes/mark.js";
import schoolclass from "./routes/schoolclass.js";
import student from "./routes/student.js";
import user from "./routes/user.js";
import subject from "./routes/subject.js";
import timetableRoutes from './routes/timetable.js';
import teacherAttendanceRoutes from './routes/teacherAttendance.js';
import teacherSalaryRoutes from './routes/teacherSalary.js';

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
// NOTE: query parameters are NEVER stripped from the MongoDB URL.
// Atlas URLs need them (retryWrites, w=majority, authSource, replicaSet, tls...).

const MAX_DB_RETRIES = parseInt(process.env.DB_MAX_RETRIES || '5', 10);
let standardUriCache = null; // cached SRV -> standard URI conversion

// --- OS-level DNS fallback ------------------------------------------------
// Some routers/networks refuse the raw UDP SRV queries made by Node's DNS
// resolver (querySrv ECONNREFUSED / ETIMEOUT) while the OS DNS client still
// works fine. In that case we ask the operating system to resolve the SRV
// and TXT records for us and build a standard (non-SRV) connection string.
const osResolveSrv = (srvName) => {
    return new Promise((resolve, reject) => {
        if (process.platform !== 'win32') {
            return reject(new Error('OS DNS fallback is only implemented for Windows'));
        }
        const cmd = `Resolve-DnsName -Type SRV "${srvName}" -ErrorAction Stop | Select-Object NameTarget,Port | ConvertTo-Json -Compress`;
        execFile('powershell.exe', ['-NoProfile', '-NonInteractive', '-Command', cmd], { windowsHide: true, timeout: 15000 }, (err, stdout) => {
            if (err) return reject(err);
            try {
                const parsed = JSON.parse(stdout);
                const list = Array.isArray(parsed) ? parsed : [parsed];
                const records = list
                    .filter((r) => r && r.NameTarget && r.Port)
                    .map((r) => ({ name: String(r.NameTarget).replace(/\.$/, ''), port: Number(r.Port) }));
                if (!records.length) return reject(new Error('OS SRV lookup returned no records'));
                resolve(records);
            } catch (parseErr) {
                reject(parseErr);
            }
        });
    });
};

const osResolveTxt = (host) => {
    return new Promise((resolve, reject) => {
        if (process.platform !== 'win32') {
            return reject(new Error('OS DNS fallback is only implemented for Windows'));
        }
        const cmd = `Resolve-DnsName -Type TXT "${host}" -ErrorAction Stop | ForEach-Object { $_.Strings } | ConvertTo-Json -Compress`;
        execFile('powershell.exe', ['-NoProfile', '-NonInteractive', '-Command', cmd], { windowsHide: true, timeout: 15000 }, (err, stdout) => {
            if (err) return reject(err);
            try {
                const flat = (v) => (Array.isArray(v) ? v.flat(Infinity) : [v]);
                const text = flat(JSON.parse(stdout)).filter((x) => typeof x === 'string').join('');
                if (!text) return reject(new Error('OS TXT lookup returned no records'));
                resolve(text);
            } catch (parseErr) {
                reject(parseErr);
            }
        });
    });
};

// Convert a mongodb+srv:// URI into a standard mongodb:// seed-list URI
const srvToStandardUri = async (srvUri) => {
    const match = srvUri.match(/^mongodb\+srv:\/\/([^:/?#]+)(?::([^@/#]*))?@([^/?#]+)(\/[^?#]*)?(\?.*)?$/);
    if (!match) throw new Error('Could not parse the mongodb+srv:// connection string');
    const [, user, password, host, dbPath = '', query = ''] = match;

    console.log('🔧 Converting SRV connection string to standard connection string...');

    // 1) SRV lookup -> shard hosts (try Node's resolver first, then the OS)
    let records;
    try {
        records = await dns.promises.resolveSrv(`_mongodb._tcp.${host}`);
    } catch (err) {
        console.warn(`⚠️ Node DNS resolver failed for SRV lookup (${err.code || err.message}). Trying OS DNS resolver...`);
        records = await osResolveSrv(`_mongodb._tcp.${host}`);
    }
    const hosts = records.map((r) => `${r.name}:${r.port}`).join(',');
    console.log(`🔧 Resolved ${records.length} cluster host(s): ${hosts}`);

    // 2) TXT lookup -> default options (authSource, replicaSet). Optional.
    let txtOptions = '';
    try {
        txtOptions = (await dns.promises.resolveTxt(host)).map((parts) => parts.join('')).join('&');
    } catch {
        try {
            txtOptions = await osResolveTxt(host);
        } catch {
            // TXT is optional
        }
    }

    // 3) Merge options (URI params win over TXT) and force TLS for Atlas
    const params = new URLSearchParams(query ? query.slice(1) : '');
    for (const [key, value] of new URLSearchParams(txtOptions)) {
        if (!params.has(key)) params.set(key, value);
    }
    if (!params.has('tls') && !params.has('ssl')) params.set('tls', 'true');
    if (!params.has('authSource')) params.set('authSource', 'admin');

    return `mongodb://${user}:${password || ''}@${hosts}${dbPath || '/'}?${params.toString()}`;
};

const getSrvHost = (uri) => {
    const match = uri.match(/^mongodb\+srv:\/\/(?:[^:/?#]+)(?::[^@/#]*)?@([^/?#]+)/);
    return match ? match[1] : null;
};

// Pick the URI to connect with: use the SRV URI when DNS works, otherwise a
// standard URI built from the resolved cluster hosts (result is cached).
const getConnectUri = async () => {
    if (standardUriCache) return standardUriCache;

    const srvHost = MONGOURL.startsWith('mongodb+srv://') ? getSrvHost(MONGOURL) : null;
    if (srvHost) {
        try {
            await dns.promises.resolveSrv(`_mongodb._tcp.${srvHost}`);
            return MONGOURL; // SRV works normally -> use the URI as-is
        } catch (err) {
            console.warn(`⚠️ Node DNS resolver cannot resolve SRV records (${err.code || err.message}).`);
            standardUriCache = await srvToStandardUri(MONGOURL);
            return standardUriCache;
        }
    }
    return MONGOURL;
};

// Mongoose connection event handlers - registered ONCE. Registering them
// inside connectDB would add duplicate listeners on every retry and cause
// multiple concurrent mongoose.connect() calls to race each other.
mongoose.connection.on('connected', () => {
    console.log('📡 Mongoose: connection established');
});

mongoose.connection.on('error', (err) => {
    console.error('❌ MongoDB connection error:', err.message);
});

mongoose.connection.on('disconnected', () => {
    console.warn('⚠️ MongoDB disconnected. Mongoose will reconnect automatically...');
});

mongoose.connection.on('reconnected', () => {
    console.log('✅ MongoDB reconnected successfully');
});

const connectDB = async (retryCount = 0) => {
    if (!MONGOURL) {
        throw new Error('MONGOURI environment variable is not defined. Add it to your .env file.');
    }

    try {
        const uri = await getConnectUri();
        console.log(` Connecting to MongoDB... (Attempt ${retryCount + 1}/${MAX_DB_RETRIES})`);

        const conn = await mongoose.connect(uri, {
            serverSelectionTimeoutMS: 10000,
            socketTimeoutMS: 45000,
            maxPoolSize: 10,
            family: 4
        });

        console.log(` MongoDB Connected: ${conn.connection.host}`);
        console.log(` Database: ${conn.connection.name}`);
        console.log(` Connection State: ${conn.connection.readyState === 1 ? 'Connected' : 'Disconnected'}`);
        return conn;
    } catch (err) {
        console.error(`❌ MongoDB Connection Error (Attempt ${retryCount + 1}/${MAX_DB_RETRIES}):`, err.message);

        if (retryCount + 1 < MAX_DB_RETRIES) {
            const waitTime = Math.min((retryCount + 1) * 2000, 10000);
            console.log(`🔄 Retrying in ${waitTime / 1000} seconds...`);
            await new Promise((resolve) => setTimeout(resolve, waitTime));
            return connectDB(retryCount + 1);
        }

        throw err; // let startServer decide what to do (offline fallback / exit)
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
        // Connect to database (online MongoDB first, automatic SRV fallback)
        try {
            await connectDB();
        } catch (err) {
            console.error('❌ Could not connect to the online MongoDB cluster:', err.message);

            // Optional offline fallback (opt-in via MONGOURIOFFLINE in .env)
            const offlineUri = process.env.MONGOURIOFFLINE;
            if (offlineUri) {
                console.log(' Attempting offline fallback database (MONGOURIOFFLINE)...');
                try {
                    await mongoose.connect(offlineUri, { serverSelectionTimeoutMS: 5000, family: 4 });
                    console.warn('⚠️ RUNNING IN OFFLINE MODE using MONGOURIOFFLINE');
                } catch (offlineErr) {
                    console.error('❌ Offline fallback failed too:', offlineErr.message);
                    printDbTroubleshooting();
                    process.exit(1);
                }
            } else {
                printDbTroubleshooting();
                process.exit(1);
            }
        }

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