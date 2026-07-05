import express from "express";
import os from "os";
import Bonjour from 'bonjour';
import mongoose from "mongoose"
import env from "dotenv"

import marks from "./routes/mark.js"
import schoolclass from "./routes/schoolclass.js"
import student from "./routes/student.js"
import user from "./routes/user.js"
import subject from "./routes/subject.js"
import cors from "cors";
import jwt from "jsonwebtoken";
import helmet from "helmet";
import morgan from "morgan";

env.config();
const app = express();
const bonjour = Bonjour();

const MONGOURL = process.env.MONGOURI;


const connectdb = async () => {
    try {
        // Clean the URL by removing any write concern parameters
        let cleanUrl = MONGOURL;
        
        // Remove any query parameters that might cause issues
        if (cleanUrl.includes('?')) {
            const urlParts = cleanUrl.split('?');
            cleanUrl = urlParts[0];
            console.log('Removed query parameters from MongoDB URL');
        }
        
        // Also remove any trailing slashes
        cleanUrl = cleanUrl.replace(/\/+$/, '');
        
        console.log('Connecting to MongoDB...');
        
        const conn = await mongoose.connect(cleanUrl, {
            // Explicitly set write concern to avoid any issues
            writeConcern: {
                w: 'majority'
            }
        });
        
        console.log(`✅ MongoDB Connected: ${conn.connection.host}`);
        console.log(`📊 Database: ${conn.connection.name}`);
        
        // Handle connection events
        mongoose.connection.on('error', (err) => {
            console.error('MongoDB connection error:', err);
        });
        
        mongoose.connection.on('disconnected', () => {
            console.log('MongoDB disconnected');
        });
        
        mongoose.connection.on('reconnected', () => {
            console.log('MongoDB reconnected');
        });
        
    } catch (err) {
        console.error('❌ MongoDB Connection Error:', err.message);
        console.log('Retrying connection in 5 seconds...');
        setTimeout(connectdb, 5000);
    }
};

// Middleware
app.use(express.json());
app.use(helmet({ crossOriginResourcePolicy: { policy: "cross-origin" } }));
app.use(morgan(":method :url :status :response-time ms - :res[content-length]"));
app.use(express.urlencoded({ extended: true }));


function getIP() {
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

app.use(cors({
    origin: [
        "http://localhost:8081",
        "http://localhost:8080",
        "http://localhost:5173"
    ],
    methods: ["GET", "POST", "PUT", "PATCH", "DELETE", "OPTIONS"],
    allowedHeaders: ["Content-Type", "Authorization"],
    credentials: true
}));

const ip = getIP();
const PORT = 5000 | process.env.PORT;                       // changed from 3000 to 5000
const SERVICE_NAME = 'Manfess';
const HOSTNAME = 'manfess';              // desired hostname

app.get("/manifest.json", (req, res) => {
    res.json({
        name: 'manfess',
        short_name: 'manfess',
        description: "distribute wifi",
        start_url: "/",
        display: "standalone",
        background_color: "#ffffff",
        theme_color: "#000000",
    });
});

app.get("/", (req, res) => {
    res.send("hello bro");
});








//all routes 
app.use("/api", marks);
app.use("/api", schoolclass);
app.use("/api", student);
app.use("/api", user);
app.use("/api", subject);


connectdb().then(() => {
    app.listen(PORT, '0.0.0.0', () => {
        console.log(`${SERVICE_NAME} server running on port ${PORT}`);
        console.log(`Access locally: http://localhost:${PORT}`);
        console.log(`Access via IP: http://${ip}:${PORT}`);

        // Advertise via mDNS
        bonjour.publish({ name: SERVICE_NAME, type: 'http', port: PORT, host: HOSTNAME });
        console.log(`mDNS advertisement active – try http://${HOSTNAME}.local:${PORT}`);
    });
});