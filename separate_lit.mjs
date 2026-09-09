// Separate Lit OL5A from Lit OL4A: remove Mercy's combined entries, add EPOLE standalone
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
const tt = db.collection('timetables');
const ACAD = '2026-2027';
const MERCY = '6a97afb5ac4ccdf7ea024cb1';
const EPOLE = '6a97a806909973238d6acbfd';
const OL5A = '6a9706c7530d27459070478e';
const PERIODS = [[1,'04:30','05:15'],[2,'05:15','06:00'],[3,'06:00','06:45'],[4,'06:45','07:30'],[5,'07:30','08:15'],[6,'08:15','09:00']];
const all = await tt.find({ academicYear: ACAD, isActive: true }).toArray();
// 1) Find Mercy's combined Lit OL5A entries (Tue P6, Wed P6)
const toRemove = all.filter(e => e.teacherId.toString() === MERCY && e.classId.toString() === OL5A && e.subjectName === 'Literature in English');
log('Mercy Lit OL5A entries to remove: ' + toRemove.length);
toRemove.forEach(e => log('  ' + e.day + ' P' + e.periodNumber + ' ' + e.subjectName + ' ' + e._id));
if (toRemove.length !== 2) { log('ABORT: expected exactly 2 entries'); await mongoose.disconnect(); process.exit(1); }

// 2) Check EPOLE Tue P5 free (teacher + OL5A class)
const epTueP5 = all.filter(e => e.day === 'Tuesday' && e.periodNumber === 5 && (e.teacherId.toString() === EPOLE || e.classId.toString() === OL5A));
if (epTueP5.length) { log('ABORT: Tue P5 not free: ' + JSON.stringify(epTueP5.map(e => e.subjectName + '/' + e.teacherName))); await mongoose.disconnect(); process.exit(1); }

// 3) Remove Mercy's combined OL5A entries
const dr = await tt.deleteMany({ _id: { $in: toRemove.map(e => e._id) } });
log('DELETED ' + dr.deletedCount + ' Mercy Lit OL5A entries');

// 4) Insert EPOLE standalone Lit OL5A at Tuesday P5 (copy subject/cycle/rate from removed entries)
const tpl = toRemove[0];
const ins = {
  teacherId: O(EPOLE), teacherName: 'MADAM EPOLE',
  classId: O(OL5A), subjectId: tpl.subjectId,
  subjectName: tpl.subjectName, subjectCode: tpl.subjectCode,
  day: 'Tuesday', startTime: PERIODS[4][1], endTime: PERIODS[4][2],
  periodNumber: 5, cycle: tpl.cycle, ratePerPeriod: tpl.ratePerPeriod,
  academicYear: ACAD, isActive: true
};
log('Template: cycle=' + tpl.cycle + ' rate=' + tpl.ratePerPeriod + ' subjectId=' + tpl.subjectId);
const r = await tt.insertMany([ins]);
log('INSERTED EPOLE Lit OL5A at Tuesday P5 (' + r.insertedCount + ')');

// 5) Fix stale teacherName on EPOLE's other entries
const du = await tt.updateMany({ teacherId: O(EPOLE), teacherName: { $ne: 'MADAM EPOLE' } }, { $set: { teacherName: 'MADAM EPOLE' } });
log('UPDATED teacherName on ' + du.modifiedCount + ' EPOLE entries');

// 6) Verify
const fresh = await tt.find({ academicYear: ACAD, isActive: true }).toArray();
const seenC = new Map(), seenT = new Map();
let conf = 0;
for (const e of fresh) {
  const kc = e.day + '|' + e.periodNumber + '|' + e.classId.toString();
  if (seenC.has(kc)) { conf++; log('CLASS CONFLICT: ' + kc); } else seenC.set(kc, e.subjectName);
  const kt = e.day + '|' + e.periodNumber + '|' + e.teacherId.toString();
  if (seenT.has(kt) && seenT.get(kt) !== e.subjectId.toString()) { conf++; log('TEACHER CONFLICT: ' + kt); }
  if (!seenT.has(kt)) seenT.set(kt, e.subjectId.toString());
}
log('Conflicts: ' + conf);
log('\nAll Literature in English entries now:');
fresh.filter(e => e.subjectName === 'Literature in English').sort((a, b) => (a.day + a.periodNumber).localeCompare(b.day + b.periodNumber))
  .forEach(e => log('  ' + e.day + ' P' + e.periodNumber + ' | ' + e.teacherName + ' | class ' + e.classId.toString()));
const mercyLit = fresh.filter(e => e.teacherId.toString() === MERCY && e.periodNumber === 6);
log('\nMercy P6 now: ' + mercyLit.map(e => e.day + ':' + e.subjectName + '/' + e.classId.toString()).join(', '));
await mongoose.disconnect();
log('Done!');
