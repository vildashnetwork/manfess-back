// Final piece: free Tue P2 via Marvis self-swap, place Nkimi Commerce OL5 (idempotent, validated)
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
const MARVIS = '6a97a577909973238d6acbf9';
const PERIODS = [[1,'04:30','05:15'],[2,'05:15','06:00'],[3,'06:00','06:45'],[4,'06:45','07:30'],[5,'07:30','08:15'],[6,'08:15','09:00']];
const DAYS_ALL = ['Monday','Tuesday','Wednesday','Thursday','Friday'];
const tt = db.collection('timetables');
const OL5 = ['6a9706c7530d27459070478e','6a9706d7530d27459070478f','6a97aa0e909973238d6acc01'];
const COM_OL5 = '6a979e683c1247098a21e165';

const all = await tt.find({ academicYear: '2026-2027', isActive: true }).toArray();
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
function freeFor(day, p, teacherId, classId) {
  return !occ[day][p].teachers.has(teacherId) && !occ[day][p].classes.has(classId);
}
async function moveEntry(e, day, p) {
  occ[e.day][e.periodNumber].classes.delete(e.classId.toString());
  const still = all.some(x => x !== e && x.teacherId.toString() === e.teacherId.toString() && x.day === e.day && x.periodNumber === e.periodNumber);
  if (!still) occ[e.day][e.periodNumber].teachers.delete(e.teacherId.toString());
  occ[day][p].classes.add(e.classId.toString());
  occ[day][p].teachers.add(e.teacherId.toString());
  await tt.updateOne({ _id: e._id }, { $set: { day, startTime: PERIODS[p-1][1], endTime: PERIODS[p-1][2], periodNumber: p } });
  e.day = day; e.periodNumber = p;
}
// Idempotency
const have = await tt.countDocuments({ teacherId: O(NKIMI), subjectId: O(COM_OL5), academicYear: '2026-2027' });
log('Nkimi Commerce OL5 entries: ' + have);
if (have >= 3) { log('Already placed - nothing to do.'); await mongoose.disconnect(); process.exit(0); }

// Locate the two Marvis entries to swap
const mComm = all.find(e => e.teacherId.toString() === MARVIS && e.day === 'Thursday' && e.periodNumber === 2);
const mPM = all.find(e => e.teacherId.toString() === MARVIS && e.day === 'Tuesday' && e.periodNumber === 2 && e.subjectName === 'Product Mastery' && e.classId.toString() === OL5[1]);
if (!mComm || !mPM) { log('EXPECTED ENTRIES NOT FOUND: mComm=' + !!mComm + ' mPM=' + !!mPM); await mongoose.disconnect(); process.exit(1); }
log('Swap source A: ' + mComm.subjectName + '/' + (cname[mComm.classId.toString()] || '?') + ' at ' + mComm.day + ' P' + mComm.periodNumber);
log('Swap source B: ' + mPM.subjectName + '/' + (cname[mPM.classId.toString()] || '?') + ' at ' + mPM.day + ' P' + mPM.periodNumber);

// Step 1: Marvis Commerce OL3  Thu P2 -> Thu P5  (Marvis free at P5; OL3 free at P5)
if (!(mComm.subjectName === 'Commerce')) { log('ABORT: unexpected subject at Thu P2'); await mongoose.disconnect(); process.exit(1); }
if (!freeFor('Thursday', 5, MARVIS, mComm.classId.toString())) { log('ABORT: Thu P5 not free for Marvis/OL3'); await mongoose.disconnect(); process.exit(1); }
await moveEntry(mComm, 'Thursday', 5);
log('STEP1 OK: Marvis Commerce OL3 -> Thursday P5');

// Step 2: Marvis PM OL5C  Tue P2 -> Thu P2  (now free; OL5C free at Thu P2)
if (!freeFor('Thursday', 2, MARVIS, mPM.classId.toString())) { log('ABORT: Thu P2 not free for Marvis/OL5C'); await mongoose.disconnect(); process.exit(1); }
await moveEntry(mPM, 'Thursday', 2);
log('STEP2 OK: Marvis Product Mastery OL5C -> Thursday P2');

// Step 3: validate Tue P2 fully open for Nkimi + all three OL5 docs
const okSlot = freeFor('Tuesday', 2, NKIMI, OL5[0]) && freeFor('Tuesday', 2, NKIMI, OL5[1]) && freeFor('Tuesday', 2, NKIMI, OL5[2]);
if (!okSlot) { log('ABORT: Tue P2 not fully free after swaps'); await mongoose.disconnect(); process.exit(1); }
const ins = OL5.map(c => ({
  teacherId: O(NKIMI), teacherName: 'nkimi',
  classId: O(c), subjectId: O(COM_OL5),
  subjectName: 'Commerce', subjectCode: '0530',
  day: 'Tuesday', startTime: PERIODS[1][1], endTime: PERIODS[1][2],
  periodNumber: 2, cycle: 'first', ratePerPeriod: 500,
  academicYear: '2026-2027', isActive: true
}));
const r = await tt.insertMany(ins);
log('STEP3 OK: inserted ' + r.insertedCount + ' Nkimi Commerce OL5 entries at Tuesday P2');

// Full verification on fresh read
const fresh = await tt.find({ academicYear: '2026-2027', isActive: true }).toArray();
const seenC = new Map(), seenT = new Map();
let conf = 0;
for (const e of fresh) {
  const kc = e.day + '|' + e.periodNumber + '|' + e.classId.toString();
  if (seenC.has(kc)) { conf++; log('CLASS CONFLICT: ' + kc + ' ' + e.subjectName + ' vs ' + seenC.get(kc)); } else seenC.set(kc, e.subjectName);
  const kt = e.day + '|' + e.periodNumber + '|' + e.teacherId.toString();
  if (seenT.has(kt)) { conf++; log('TEACHER CONFLICT: ' + kt + ' ' + e.subjectName + ' vs ' + seenT.get(kt)); } else seenT.set(kt, e.subjectName);
}
log('Fresh conflicts: ' + conf);

const nk = fresh.filter(e => e.teacherId.toString() === NKIMI);
log('\n=== NKIMI FINAL: ' + nk.length + ' entries, ' + new Set(nk.map(e => e.day + ' P' + e.periodNumber)).size + ' lessons ===');
const byDay = {};
nk.forEach(e => { if (!byDay[e.day]) byDay[e.day] = []; byDay[e.day].push(e); });
for (const d of DAYS_ALL) {
  if (byDay[d]) {
    log(d + ': ' + byDay[d].length);
    byDay[d].sort((a, b) => a.periodNumber - b.periodNumber).forEach(e =>
      log('  P' + e.periodNumber + ' ' + e.startTime + '-' + e.endTime + ' ' + e.subjectName + ' ' + (cname[e.classId.toString()] || '?')));
  }
}
const marvis2 = fresh.filter(e => e.teacherId.toString() === MARVIS);
log('\nMarvis entries: ' + marvis2.length + ' (expect 14, relocated 2)');
marvis2.sort((a, b) => (a.day + a.periodNumber).localeCompare(b.day + b.periodNumber));
marvis2.forEach(e => log('  ' + e.day + ' P' + e.periodNumber + ' ' + e.subjectName + ' ' + (cname[e.classId.toString()] || '?')));
await mongoose.disconnect();
log('\nDone!');
