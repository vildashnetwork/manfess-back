// Fix Nkimi: remove Thu, ensure Mon/Tue/Wed placement with proper compaction
// Usage: node fix_nkimi.mjs
import 'dotenv/config';
import mongoose from 'mongoose';
import dns from 'dns';
import { execFile } from 'child_process';

// Use the .env MONGOURI (mongodb+srv://) or fallback to local
let uri = process.env.MONGOURI || 'mongodb://127.0.0.1:27017/MANFESS_OFFLINE';
mongoose.set('bufferCommands', false);

// ---------- OS-level DNS fallback (same as db/dbManager.js) ----------------
const osResolveSrv = (srvName) => new Promise((resolve, reject) => {
  const cmd = `Resolve-DnsName -Type SRV "${srvName}" -ErrorAction Stop | Select-Object NameTarget,Port | ConvertTo-Json -Compress`;
  execFile('powershell.exe', ['-NoProfile', '-NonInteractive', '-Command', cmd],
    { windowsHide: true, timeout: 15000 }, (err, stdout) => {
      if (err) return reject(err);
      try {
        const parsed = JSON.parse(stdout);
        const list = Array.isArray(parsed) ? parsed : [parsed];
        const records = list.filter(r => r && r.NameTarget && r.Port)
          .map(r => ({ name: String(r.NameTarget).replace(/\.$/, ''), port: Number(r.Port) }));
        if (!records.length) return reject(new Error('OS SRV lookup returned no records'));
        resolve(records);
      } catch (e) { reject(e); }
    });
});

const srvToStandardUri = async (srvUri) => {
  const m = srvUri.match(/^mongodb\+srv:\/\/([^:/?#]+)(?::([^@/#]*))?@([^/?#]+)(\/[^?#]*)?(\?.*)?$/);
  if (!m) throw new Error('Could not parse the mongodb+srv:// connection string');
  const [, user, password, host, dbPath = '', query = ''] = m;
  let records;
  try {
    records = await dns.promises.resolveSrv(`_mongodb._tcp.${host}`);
  } catch (err) {
    console.warn(`Node SRV lookup failed (${err.code || err.message}). Trying OS DNS resolver...`);
    records = await osResolveSrv(`_mongodb._tcp.${host}`);
  }
  const hosts = records.map(r => `${r.name}:${r.port}`).join(',');
  console.log(`Resolved ${records.length} cluster host(s): ${hosts}`);
  let txtOptions = '';
  try {
    txtOptions = (await dns.promises.resolveTxt(host)).map(p => p.join('')).join('&');
  } catch { /* TXT optional */ }
  const params = new URLSearchParams(query ? query.slice(1) : '');
  for (const [k, v] of new URLSearchParams(txtOptions)) if (!params.has(k)) params.set(k, v);
  if (!params.has('tls') && !params.has('ssl')) params.set('tls', 'true');
  if (!params.has('authSource')) params.set('authSource', 'admin');
  return `mongodb://${user}:${password || ''}@${hosts}${dbPath || '/'}?${params.toString()}`;
};

if (uri.startsWith('mongodb+srv://')) {
  uri = await srvToStandardUri(uri);
}

try {
  await mongoose.connect(uri, { serverSelectionTimeoutMS: 20000, connectTimeoutMS: 20000, maxPoolSize: 5, family: 4 });
} catch(e) {
  console.error('Connection failed:', e.message);
  process.exit(1);
}

const db = mongoose.connection.db;
const log = console.log;
const O = (id) => new mongoose.Types.ObjectId(id);

const NKIMI = '6a97b0d9ac4ccdf7ea024cb3';
const ACAD = '2026-2027';

const PERIODS = [[1,'04:30','05:15'],[2,'05:15','06:00'],[3,'06:00','06:45'],[4,'06:45','07:30'],[5,'07:30','08:15'],[6,'08:15','09:00']];

// Delete existing Nkimi entries
const del = await db.collection('timetables').deleteMany({ teacherId: new mongoose.Types.ObjectId(NKIMI), academicYear: ACAD });
console.log('Deleted ' + del.deletedCount + ' old entries');

// Update availability
await db.collection('users').updateOne({ _id: new mongoose.Types.ObjectId(NKIMI) },
  { $set: { availableDays: ['Monday', 'Tuesday', 'Wednesday'], updatedAt: new Date() } });
log('Updated availability to Mon/Tue/Wed');

// Class and subject IDs
const OL5 = ['6a9706c7530d27459070478e', '6a9706d7530d27459070478f', '6a97aa0e909973238d6acc01'];
const OL4 = ['6a9706a5530d27459070478c', '6a9706b4530d27459070478d', '6a97aa36909973238d6acc02'];
const OL3 = '6a970694530d27459070478b';
const ALAR = '6a97a2079f9c0d8ee43447d3';
const COM_OL5 = '6a979e683c1247098a21e165';
const ECON_OL5 = '6a97f6bd3e41b0fcc3fa1deb';
const ECON_AL = '6a97f70d3e41b0fcc3fa1dec';

// Build occupancy from existing entries on Mon/Tue/Wed
const DAYS = ['Monday', 'Tuesday', 'Wednesday'];
const occ = {};
for (const d of DAYS) { occ[d] = {}; for (let p = 1; p <= 6; p++) occ[d][p] = { classes: new Set(), teachers: new Set() }; }

const existing = await db.collection('timetables').find({
  academicYear: ACAD, day: { $in: DAYS }, isActive: true
}).toArray();
for (const e of existing) {
  if (occ[e.day] && occ[e.day][e.periodNumber]) {
    occ[e.day][e.periodNumber].classes.add(e.classId.toString());
    occ[e.day][e.periodNumber].teachers.add(e.teacherId.toString());
  }
}

function canPlace(day, p, cids) {
  for (const c of cids) if (occ[day][p].classes.has(c)) return false;
  return !occ[day][p].teachers.has(NKIMI);
}
function findSlot(cids) {
  for (let p = 1; p <= 6; p++) for (const d of DAYS) if (canPlace(d, p, cids)) return { day: d, p };
  return null;
}
function markSlot(day, p, cids) {
  for (const c of cids) occ[day][p].classes.add(c);
  occ[day][p].teachers.add(NKIMI);
}

const newEntries = [];
let placed = 0, failed = 0;

function addEntry(cid, sid, sname, code, cycle, day, p) {
  newEntries.push({
    teacherId: O(NKIMI), teacherName: 'nkimi',
    classId: O(cid), subjectId: O(sid),
    subjectName: sname, subjectCode: code,
    day, startTime: PERIODS[p-1][1], endTime: PERIODS[p-1][2],
    periodNumber: p, cycle, ratePerPeriod: cycle === 'first' ? 500 : 700,
    academicYear: ACAD, isActive: true
  });
}

// 3 Econ AL
for (let i = 0; i < 3; i++) {
  const s = findSlot([ALAR]);
  if (s) { markSlot(s.day, s.p, [ALAR]); addEntry(ALAR, ECON_AL, 'Economics', '0725', 'second', s.day, s.p); placed++; log('AL Econ #'+(i+1)+': '+s.day+' P'+s.p); }
  else { failed++; log('FAILED AL Econ #'+i); }
}
// 2 Econ OL5
for (let i = 0; i < 2; i++) {
  const s = findSlot(OL5);
  if (s) { markSlot(s.day, s.p, OL5); OL5.forEach(c => addEntry(c, ECON_OL5, 'Economics', '0525', 'first', s.day, s.p)); placed++; log('OL5 Econ #'+(i+1)+': '+s.day+' P'+s.p); }
  else { failed++; log('FAILED OL5 Econ #'+i); }
}
// 1 Commerce OL5
{
  const s = findSlot(OL5);
  if (s) { markSlot(s.day, s.p, OL5); OL5.forEach(c => addEntry(c, COM_OL5, 'Commerce', '0530', 'first', s.day, s.p)); placed++; log('Comm OL5: '+s.day+' P'+s.p); }
  else { failed++; log('FAILED Comm OL5'); }
}
// 2 Econ OL4
for (let i = 0; i < 2; i++) {
  const s = findSlot(OL4);
  if (s) { markSlot(s.day, s.p, OL4); OL4.forEach(c => addEntry(c, ECON_OL5, 'Economics', '0525', 'first', s.day, s.p)); placed++; log('OL4 Econ #'+(i+1)+': '+s.day+' P'+s.p); }
  else { failed++; log('FAILED OL4 Econ #'+i); }
}
// 1 Econ OL3
{
  const s = findSlot([OL3]);
  if (s) { markSlot(s.day, s.p, [OL3]); addEntry(OL3, ECON_OL5, 'Economics', '0525', 'second', s.day, s.p); placed++; log('OL3 Econ: '+s.day+' P'+s.p); }
  else { failed++; log('FAILED OL3 Econ'); }
}

log('Placed: '+placed+', Failed: '+failed);
if (newEntries.length > 0) {
  const res = await db.collection('timetables').insertMany(newEntries);
  log('Inserted '+res.insertedCount+' entries');
}

// Verify
const verify = await db.collection('timetables').find({ teacherId: O(NKIMI), academicYear: ACAD }).toArray();
log('NKIMI TOTAL: '+verify.length);
const byDay = {};
verify.forEach(e => { if (!byDay[e.day]) byDay[e.day] = []; byDay[e.day].push(e); });
for (const d of ['Monday','Tuesday','Wednesday','Thursday','Friday']) {
  if (byDay[d]) { log(d+': '+byDay[d].length); byDay[d].sort((a,b)=>a.periodNumber-b.periodNumber).forEach(e=>log('  P'+e.periodNumber+' '+e.startTime+' '+e.subjectName+' '+e.className)); }
}
log('Thursday entries: '+verify.filter(e=>e.day==='Thursday').length);
await mongoose.disconnect();
log('Done!');
