// Place remaining Commerce OL5 for Nkimi (idempotent: no-op if already placed)
import 'dotenv/config';
import mongoose from 'mongoose';
import dns from 'dns';
import { execFile } from 'child_process';

let uri = process.env.MONGOURI || 'mongodb://127.0.0.1:27017/MANFESS_OFFLINE';
const osResolveSrv = (srvName) => new Promise((resolve, reject) => {
  execFile('powershell.exe', ['-NoProfile', '-NonInteractive', '-Command',
    'Resolve-DnsName -Type SRV "' + srvName + '" -ErrorAction Stop | Select-Object NameTarget,Port | ConvertTo-Json -Compress'],
    { windowsHide: true, timeout: 15000 }, (err, stdout) => {
      if (err) return reject(err);
      const parsed = JSON.parse(stdout);
      const list = Array.isArray(parsed) ? parsed : [parsed];
      resolve(list.filter(r => r && r.NameTarget && r.Port).map(r => ({ name: String(r.NameTarget).replace(/\.$/, ''), port: Number(r.Port) })));
    });
});
const srvToStandardUri = async (srvUri) => {
  const m = srvUri.match(/^mongodb\+srv:\/\/([^:/?#]+)(?::([^@/#]*))?@([^/?#]+)(\/[^?#]*)?(\?.*)?$/);
  const [, user, password, host, dbPath = '', query = ''] = m;
  let records;
  try { records = await dns.promises.resolveSrv('_mongodb._tcp.' + host); } catch { records = await osResolveSrv('_mongodb._tcp.' + host); }
  const hosts = records.map(r => r.name + ':' + r.port).join(',');
  let txt = '';
  try { txt = (await dns.promises.resolveTxt(host)).map(p => p.join('')).join('&'); } catch {}
  const params = new URLSearchParams(query ? query.slice(1) : '');
  for (const [k, v] of new URLSearchParams(txt)) if (!params.has(k)) params.set(k, v);
  if (!params.has('tls') && !params.has('ssl')) params.set('tls', 'true');
  if (!params.has('authSource')) params.set('authSource', 'admin');
  return 'mongodb://' + user + ':' + (password || '') + '@' + hosts + (dbPath || '/') + '?' + params.toString();
};
if (uri.startsWith('mongodb+srv://')) uri = await srvToStandardUri(uri);
await mongoose.connect(uri, { serverSelectionTimeoutMS: 20000, family: 4 });
const db = mongoose.connection.db;
const log = console.log;
const O = (id) => new mongoose.Types.ObjectId(id);

const NKIMI = '6a97b0d9ac4ccdf7ea024cb3';
const PERIODS = [[1,'04:30','05:15'],[2,'05:15','06:00'],[3,'06:00','06:45'],[4,'06:45','07:30'],[5,'07:30','08:15'],[6,'08:15','09:00']];
const DAYS_ALL = ['Monday','Tuesday','Wednesday','Thursday','Friday'];
const PLACE_DAYS = ['Monday','Tuesday','Wednesday'];
const tt = db.collection('timetables');
const OL5 = ['6a9706c7530d27459070478e','6a9706d7530d27459070478f','6a97aa0e909973238d6acc01'];
const COM_OL5 = '6a979e683c1247098a21e165';

const all = await tt.find({ academicYear: '2026-2027', isActive: true }).toArray();
const teachers = await db.collection('users').find({ role: 'teacher' }).toArray();
const avail = {};
teachers.forEach(u => { avail[u._id.toString()] = (u.availableDays && u.availableDays.length) ? u.availableDays : DAYS_ALL; });
const classDocs = await db.collection('schoolclasses').find({}).toArray();
const cname = {};
classDocs.forEach(c => { cname[c._id.toString()] = c.className + (c.department ? ' (' + c.department + ')' : ''); });

const occ = {};
for (const d of DAYS_ALL) { occ[d] = {}; for (let q = 1; q <= 6; q++) occ[d][q] = { classes: new Set(), teachers: new Set() }; }
for (const e of all) {
  if (occ[e.day] && occ[e.day][e.periodNumber]) {
    occ[e.day][e.periodNumber].classes.add(e.classId.toString());
    occ[e.day][e.periodNumber].teachers.add(e.teacherId.toString());
  }
}
const nkimiBusy = (d, p) => occ[d][p].teachers.has(NKIMI);
function canMoveAny(e, depth = 0) {
  const tid = e.teacherId.toString(), cid = e.classId.toString();
  const days = (avail[tid] || []);
  for (const pref of [['Thursday', 'Friday'], DAYS_ALL]) {
    for (const d of pref) {
      if (!days.includes(d)) continue;
      if (d === e.day && e.periodNumber === e.periodNumber) continue;
      if (occ[d][e.periodNumber].teachers.has(tid)) continue;
      if (occ[d][e.periodNumber].classes.has(cid)) continue;
      return { day: d, p: e.periodNumber };
    }
    for (const d of pref) {
      if (!days.includes(d)) continue;
      for (let p = 1; p <= 6; p++) {
        if (d === e.day && p === e.periodNumber) continue;
        if (occ[d][p].teachers.has(tid)) continue;
        if (occ[d][p].classes.has(cid)) continue;
        return { day: d, p };
      }
    }
    if (depth < 1) {
      for (const d of pref) {
        if (!days.includes(d)) continue;
        for (let p = 1; p <= 6; p++) {
          if (d === e.day && p === e.periodNumber) continue;
          if (occ[d][p].teachers.has(tid)) continue;
          if (occ[d][p].classes.has(cid)) continue;
          const occupants = all.filter(x => x.day === d && x.periodNumber === p && (x.classId.toString() === cid || x.teacherId.toString() === tid));
          if (!occupants.length) return { day: d, p };
          if (occupants.every(o => canMoveAny(o, depth + 1))) return { day: d, p };
        }
      }
    }
    if (pref[0] === 'Thursday') continue;
    break;
  }
  return null;
}
async function moveEntry(e, dest) {
  const tid = e.teacherId.toString(), cid = e.classId.toString();
  occ[e.day][e.periodNumber].classes.delete(cid);
  const still = all.some(x => x !== e && x.teacherId.toString() === tid && x.day === e.day && x.periodNumber === e.periodNumber);
  if (!still) occ[e.day][e.periodNumber].teachers.delete(tid);
  occ[dest.day][dest.p].classes.add(cid);
  occ[dest.day][dest.p].teachers.add(tid);
  await tt.updateOne({ _id: e._id }, { $set: { day: dest.day, startTime: PERIODS[dest.p-1][1], endTime: PERIODS[dest.p-1][2], periodNumber: dest.p } });
  e.day = dest.day; e.periodNumber = dest.p;
}
async function placeEntry(e, dest) {
  const occupants = all.filter(x => x !== e && x.day === dest.day && x.periodNumber === dest.p && (x.classId.toString() === e.classId.toString() || x.teacherId.toString() === e.teacherId.toString()));
  for (const o of occupants) {
    const odest = canMoveAny(o, 1);
    if (!odest) throw new Error('cannot displace occupant');
    await placeEntry(o, odest);
  }
  await moveEntry(e, dest);
}
// Idempotency check
const existing = await tt.countDocuments({ teacherId: O(NKIMI), subjectId: O(COM_OL5), academicYear: '2026-2027', classId: { $in: OL5.map(O) } });
const have = Math.floor(existing / 3);
log('Commerce OL5: Nkimi currently has ' + have + ' lesson(s)');
if (have >= 1) { log('Already placed - nothing to do.'); await mongoose.disconnect(); process.exit(0); }

// Find best slot: fewest movable blockers, earliest period then day
let best = null;
for (let p = 1; p <= 6; p++) for (const d of PLACE_DAYS) {
  if (nkimiBusy(d, p)) continue;
  const blockers = all.filter(e => e.day === d && e.periodNumber === p && OL5.includes(e.classId.toString()));
  const movable = blockers.filter(b => canMoveAny(b));
  log('  ' + d + ' P' + p + ': ' + blockers.length + ' blocker(s), ' + movable.length + ' movable' +
    (blockers.length ? ' [' + blockers.map(b => b.subjectName + '/' + (cname[b.classId.toString()] || '?') + '/' + b.teacherName).join('; ') + ']' : ' [ALL FREE]'));
  if (blockers.length === 0) { if (!best || 0 < best.blockers.length) best = { day: d, p, blockers: [] }; }
  else if (movable.length === blockers.length) { if (!best || movable.length < best.blockers.length) best = { day: d, p, blockers: movable }; }
}

if (!best) { log('NO SLOT POSSIBLE - Commerce OL5 cannot fit Mon-Wed.'); await mongoose.disconnect(); process.exit(0); }

let ok = true;
for (const b of best.blockers) {
  const dest = canMoveAny(b);
  if (!dest) { ok = false; break; }
  try {
    await placeEntry(b, dest);
    log('MOVED: ' + b.subjectName + '/' + (cname[b.classId.toString()] || '?') + ' (' + b.teacherName + ') ' + best.day + ' P' + best.p + ' -> ' + dest.day + ' P' + dest.p);
  } catch (err) { ok = false; log('chain move failed: ' + err.message); break; }
}
if (!ok) { log('MOVE FAILED - aborting without inserting.'); await mongoose.disconnect(); process.exit(0); }

const insertions = [];
for (const c of OL5) {
  insertions.push({
    teacherId: O(NKIMI), teacherName: 'nkimi',
    classId: O(c), subjectId: O(COM_OL5),
    subjectName: 'Commerce', subjectCode: '0530',
    day: best.day, startTime: PERIODS[best.p-1][1], endTime: PERIODS[best.p-1][2],
    periodNumber: best.p, cycle: 'first', ratePerPeriod: 500,
    academicYear: '2026-2027', isActive: true
  });
}
const r = await tt.insertMany(insertions);
log('INSERTED ' + r.insertedCount + ' Commerce OL5 entries at ' + best.day + ' P' + best.p);

// Verify: fresh Nkimi schedule + conflicts
const nk = await tt.find({ teacherId: O(NKIMI), academicYear: '2026-2027' }).toArray();
log('\n=== NKIMI FINAL: ' + nk.length + ' entries ===');
const byDay = {};
nk.forEach(e => { if (!byDay[e.day]) byDay[e.day] = []; byDay[e.day].push(e); });
for (const d of DAYS_ALL) {
  if (byDay[d]) {
    log(d + ': ' + byDay[d].length);
    byDay[d].sort((a, b) => a.periodNumber - b.periodNumber).forEach(e =>
      log('  P' + e.periodNumber + ' ' + e.startTime + '-' + e.endTime + ' ' + e.subjectName + ' ' + (cname[e.classId.toString()] || '?')));
  }
}
const fresh = await tt.find({ academicYear: '2026-2027', isActive: true }).toArray();
const seen = new Map();
let conf = 0;
for (const e of fresh) {
  const k = e.day + '|' + e.periodNumber + '|' + e.classId.toString();
  if (seen.has(k)) { conf++; log('CONFLICT: ' + k); } else seen.set(k, e.subjectName);
}
log('\nFresh class conflicts: ' + conf);
await mongoose.disconnect();
log('Done!');
