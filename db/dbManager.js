// Manages the online (MongoDB Atlas) / offline (local MongoDB) connection:
// automatic switching between the two and automatic data sync.
// - At startup it connects to the online DB, or falls back to the local DB.
// - A monitor probes the Atlas cluster every SYNC_CHECK_INTERVAL_MS:
//     * offline mode + internet available  -> switch online + sync
//     * online mode + internet unavailable -> switch offline (+ final sync)
// - While online, data is re-synced every SYNC_INTERVAL_MS so the local
//   mirror stays current.
import mongoose from "mongoose";
import dns from "dns";
import net from "net";
import { execFile } from "child_process";
import { runSync } from "./syncService.js";

const ONLINE_URI = process.env.MONGOURI;
const OFFLINE_URI = process.env.MONGOURIOFFLINE || 'mongodb://127.0.0.1:27017/MANFESS_OFFLINE';

const ONLINE_CONNECT_OPTIONS = {
    serverSelectionTimeoutMS: 10000,
    socketTimeoutMS: 45000,
    maxPoolSize: 10,
    family: 4
};

const OFFLINE_CONNECT_OPTIONS = {
    serverSelectionTimeoutMS: 4000,
    socketTimeoutMS: 45000,
    maxPoolSize: 10,
    family: 4
};

const CHECK_INTERVAL_MS = parseInt(process.env.SYNC_CHECK_INTERVAL_MS || '30000', 10);
const SYNC_INTERVAL_MS = parseInt(process.env.SYNC_INTERVAL_MS || '300000', 10);

// ---------- OS-level DNS fallback (Windows) --------------------------------
// Some routers refuse the raw UDP SRV queries made by Node's DNS resolver
// (querySrv ECONNREFUSED) while the OS DNS client still works fine.
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
            const cmd = `Resolve-DnsName -Type TXT "${host}" -ErrorAction Stop | ForEach-Object { $_.Strings } | ConvertTo-Json -Compress`;
            txtOptions = await new Promise((resolve, reject) => {
                execFile('powershell.exe', ['-NoProfile', '-NonInteractive', '-Command', cmd], { windowsHide: true, timeout: 15000 }, (err, stdout) => {
                    if (err) return reject(err);
                    try {
                        const flat = (v) => (Array.isArray(v) ? v.flat(Infinity) : [v]);
                        resolve(flat(JSON.parse(stdout)).filter((x) => typeof x === 'string').join(''));
                    } catch (e) {
                        reject(e);
                    }
                });
            });
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

// Extract [{ host, port }] from a standard mongodb:// URI
const parseStandardUriHosts = (uri) => {
    try {
        const authority = uri.replace(/^mongodb:\/\//, '').split('/')[0];
        const hostPart = authority.includes('@') ? authority.slice(authority.lastIndexOf('@') + 1) : authority;
        return hostPart.split(',').filter(Boolean).map((h) => {
            const [host, port] = h.split(':');
            return { host, port: Number(port) || 27017 };
        });
    } catch {
        return [];
    }
};

class DbManager {
    constructor() {
        this.mode = 'connecting';      // 'online' | 'offline' | 'connecting' | 'disconnected'
        this.switching = false;
        this.syncing = false;
        this.onlineHosts = [];         // resolved Atlas hosts for reachability probes
        this.standardUriCache = null;  // cached SRV -> standard URI conversion
        this.offlineAvailable = true;
        this.offlineFailures = 0;
        this.monitorTimer = null;
        this.lastSync = null;          // last successful sync result
        this.lastSyncError = null;
        this.lastSyncAt = null;
        this.lastAutoSyncAt = null;
    }

    // Resolve the URI for the online database (SRV -> standard fallback)
    async getOnlineUri() {
        if (this.standardUriCache) return this.standardUriCache;

        const srvHost = ONLINE_URI.startsWith('mongodb+srv://') ? getSrvHost(ONLINE_URI) : null;
        if (srvHost) {
            try {
                const records = await dns.promises.resolveSrv(`_mongodb._tcp.${srvHost}`);
                this.onlineHosts = records.map((r) => ({ host: r.name, port: r.port }));
                return ONLINE_URI; // SRV works normally -> use the URI as-is
            } catch (err) {
                console.warn(`⚠️ Node DNS resolver cannot resolve SRV records (${err.code || err.message}).`);
                const uri = await srvToStandardUri(ONLINE_URI);
                this.standardUriCache = uri;
                this.onlineHosts = parseStandardUriHosts(uri);
                return uri;
            }
        }
        this.onlineHosts = parseStandardUriHosts(ONLINE_URI);
        return ONLINE_URI;
    }

    async connectOnline() {
        const uri = await this.getOnlineUri();
        await mongoose.connect(uri, ONLINE_CONNECT_OPTIONS);
    }

    async connectOffline() {
        await mongoose.connect(OFFLINE_URI, OFFLINE_CONNECT_OPTIONS);
    }

    // TCP probe against the Atlas hosts (getaddrinfo via net.connect)
    probeHost = (host, port, timeoutMs = 4000) => new Promise((resolve, reject) => {
        const socket = net.connect({ host, port });
        let settled = false;
        const done = (ok) => {
            if (settled) return;
            settled = true;
            socket.destroy();
            if (ok) resolve(true); else reject(new Error(`unreachable ${host}:${port}`));
        };
        socket.setTimeout(timeoutMs);
        socket.once('connect', () => done(true));
        socket.once('timeout', () => done(false));
        socket.once('error', () => done(false));
    });

    async isAtlasReachable() {
        let hosts = this.onlineHosts;
        if (!hosts.length && ONLINE_URI) {
            try {
                await this.getOnlineUri();
                hosts = this.onlineHosts;
            } catch {
                hosts = [];
            }
        }
        if (!hosts.length) return false;
        try {
            await Promise.any(hosts.map((h) => this.probeHost(h.host, h.port)));
            return true;
        } catch {
            return false;
        }
    }

    // ---- lifecycle -----------------------------------------------------------

    async init() {
        if (!ONLINE_URI) {
            throw new Error('MONGOURI environment variable is not defined. Add it to your .env file.');
        }

        // With a local fallback available we fail over fast.
        const maxAttempts = 2;
        let lastErr = null;
        for (let attempt = 1; attempt <= maxAttempts; attempt++) {
            try {
                console.log(` Connecting to online MongoDB... (Attempt ${attempt}/${maxAttempts})`);
                await this.connectOnline();
                this.mode = 'online';
                console.log('🌍 Mode: ONLINE (MongoDB Atlas)');
                lastErr = null;
                break;
            } catch (err) {
                lastErr = err;
                console.error(`❌ Online MongoDB Connection Error (Attempt ${attempt}/${maxAttempts}):`, err.message);
                if (attempt < maxAttempts) await new Promise((r) => setTimeout(r, 3000));
            }
        }

        if (this.mode !== 'online') {
            if (!this.offlineAvailable) throw lastErr;
            try {
                console.log(' Falling back to the local database...');
                await this.connectOffline();
                this.mode = 'offline';
                console.log('📴 Mode: OFFLINE (local MongoDB) — data will sync when internet returns');
            } catch (offlineErr) {
                throw new Error(`Neither online nor offline database reachable. Online: ${lastErr && lastErr.message} | Offline: ${offlineErr.message}`);
            }
        }

        this.startMonitor();

        // Refresh the local mirror right away (also pushes offline changes up)
        if (this.mode === 'online') await this.runSyncCycle('startup');

        return this.getStatus();
    }

    async runSyncCycle(trigger = 'auto') {
        if (this.syncing || this.mode !== 'online' || !this.offlineAvailable) return null;
        this.syncing = true;
        let localConn = null;
        try {
            console.log(`🔄 Starting ${trigger} sync (online <-> local)...`);
            localConn = await mongoose.createConnection(OFFLINE_URI, OFFLINE_CONNECT_OPTIONS).asPromise();
            const result = await runSync(mongoose.connection, localConn);
            this.lastSync = { ...result, trigger, error: null };
            this.lastSyncAt = new Date();
            this.lastAutoSyncAt = new Date();
            console.log(`✅ Sync finished in ${result.durationMs}ms`);
            return result;
        } catch (err) {
            this.lastSyncError = err.message;
            console.error('❌ Sync failed:', err.message);
            if (/ECONNREFUSED|ENOTFOUND|ServerSelection/i.test(err.message || '')) {
                this.offlineAvailable = false;
                console.warn('⚠️ Local MongoDB unreachable — sync disabled (online-only mode).');
            }
            return null;
        } finally {
            if (localConn) {
                try { await localConn.close(); } catch { /* ignore */ }
            }
            this.syncing = false;
        }
    }

    async switchToOffline() {
        if (this.switching) return;
        this.switching = true;
        try {
            console.log('📴 Internet lost — switching to the local database...');
            // One last sync so the local mirror is as fresh as possible
            if (mongoose.connection.readyState === 1) await this.runSyncCycle('before-offline');
            await mongoose.disconnect();
            await this.connectOffline();
            this.mode = 'offline';
            this.offlineFailures = 0;
            console.log('✅ Switched to OFFLINE mode');
        } catch (err) {
            console.error('❌ Switch to offline failed:', err.message);
            await this.restoreOnline();
        } finally {
            this.switching = false;
        }
    }

    async switchToOnline() {
        if (this.switching) return;
        this.switching = true;
        try {
            console.log('🌐 Internet detected — switching to the online database...');
            await mongoose.disconnect();
            await this.connectOnline();
            this.mode = 'online';
            this.offlineFailures = 0;
            console.log('✅ Switched to ONLINE mode');
            // Push everything created offline up + pull the latest changes down
            await this.runSyncCycle('online-switch');
        } catch (err) {
            console.error('❌ Switch to online failed:', err.message);
            await this.restoreOffline();
        } finally {
            this.switching = false;
        }
    }

    async restoreOnline() {
        try {
            await mongoose.disconnect();
            await this.connectOnline();
            this.mode = 'online';
        } catch {
            this.mode = 'disconnected';
            console.error('❌ Both databases unreachable. Will keep retrying in the background.');
        }
    }

    async restoreOffline() {
        try {
            await mongoose.disconnect();
            await this.connectOffline();
            this.mode = 'offline';
        } catch {
            this.mode = 'disconnected';
            console.error('❌ Both databases unreachable. Will keep retrying in the background.');
        }
    }

    // ---- connectivity monitoring ---------------------------------------------

    startMonitor() {
        if (this.monitorTimer) return;
        this.monitorTimer = setInterval(() => {
            this.check().catch((err) => console.error('❌ Connectivity monitor error:', err.message));
        }, CHECK_INTERVAL_MS);
        if (typeof this.monitorTimer.unref === 'function') this.monitorTimer.unref();
        console.log(`👀 Connectivity monitor started (every ${CHECK_INTERVAL_MS / 1000}s)`);
    }

    stopMonitor() {
        if (this.monitorTimer) {
            clearInterval(this.monitorTimer);
            this.monitorTimer = null;
        }
    }

    async check() {
        if (this.switching) return;
        const reachable = await this.isAtlasReachable();

        if (this.mode === 'online') {
            if (reachable) {
                this.offlineFailures = 0;
                // Periodic re-sync while online keeps the local mirror current
                const last = this.lastAutoSyncAt ? this.lastAutoSyncAt.getTime() : 0;
                if (!this.syncing && this.offlineAvailable && Date.now() - last > SYNC_INTERVAL_MS) {
                    await this.runSyncCycle('periodic');
                }
            } else {
                this.offlineFailures += 1;
                console.warn(`⚠️ Online database unreachable (${this.offlineFailures}/2)...`);
                if (this.offlineFailures >= 2) await this.switchToOffline();
            }
        } else if (this.mode === 'offline') {
            if (reachable) await this.switchToOnline();
        } else if (this.mode === 'disconnected') {
            if (reachable) await this.restoreOnline();
            else await this.restoreOffline();
        }
    }

    getStatus() {
        return {
            mode: this.mode,
            onlineHosts: this.onlineHosts,
            offlineDatabase: OFFLINE_URI,
            offlineAvailable: this.offlineAvailable,
            syncing: this.syncing,
            switching: this.switching,
            lastSyncAt: this.lastSyncAt,
            lastSync: this.lastSync,
            lastSyncError: this.lastSyncError,
            checkIntervalMs: CHECK_INTERVAL_MS,
            syncIntervalMs: SYNC_INTERVAL_MS
        };
    }
}

// Singleton used by index.js
export const dbManager = new DbManager();
