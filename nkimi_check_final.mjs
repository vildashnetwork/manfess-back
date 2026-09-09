// Rigorous final check: class double-bookings + same-teacher DIFFERENT-subject collisions + time sanity
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
const ACAD = '2026-2027';
const PS = { 1: '04:30', 2: '05:15', 3: '06:00', 4: '06:45', 5: '07:30', 6: '08:15' };
const PE = { 1: '05:15', 2: '06:00', 3: '06:45', 4: '07:30', 5: '08:15', 6: '09:00' };
const all = await db.collection('timetables').find({ academicYear: ACAD, isActive: true }).toArray();
const classDocs = await db.collection('schoolclasses').find({}).toArray();
const cname = {};
classDocs.forEach(c => { cname[c._id.toString()] = c.className + (c.department ? ' (' + c.department + ')' : ''); });

let classConf = 0, teacherConf = 0, timeBad = 0;
const seenC = new Map(), seenT = new Map();
for (const e of all) {
  if (PS[e.periodNumber] && (e.startTime !== PS[e.periodNumber] || e.endTime !== PE[e.periodNumber])) { timeBad++; console.log('BAD TIME: ' + e.day + ' P' + e.periodNumber + ' ' + e.subjectName); }
  const kc = e.day + '|' + e.periodNumber + '|' + e.classId.toString();
  if (seenC.has(kc)) { classConf++; console.log('CLASS CONFLICT: ' + (cname[e.classId.toString()] || '?') + ' ' + e.day + ' P' + e.periodNumber + ': ' + e.subjectName + ' vs ' + seenC.get(kc)); } else seenC.set(kc, e.subjectName);
  const kt = e.day + '|' + e.periodNumber + '|' + e.teacherId.toString();
  if (seenT.has(kt) && seenT.get(kt) !== e.subjectId.toString()) { teacherConf++; console.log('REAL TEACHER CONFLICT: ' + e.day + ' P' + e.periodNumber + ' teacher ' + e.teacherName + ': ' + e.subjectName + ' vs ' + seenT.get(kt + '|name')); }
  if (!seenT.has(kt)) { seenT.set(kt, e.subjectId.toString()); seenT.set(kt + '|name', e.subjectName); }
}
console.log('\nTime mismatches: ' + timeBad);
console.log('Class double-bookings: ' + classConf);
console.log('Teacher different-subject collisions: ' + teacherConf);

const nk = all.filter(e => e.teacherName === 'nkimi');
const lessons = new Set(nk.map(e => e.day + ' P' + e.periodNumber));
console.log('\nNkimi: ' + nk.length + ' entries / ' + lessons.size + ' lessons');
for (const l of [...lessons].sort()) {
  const e = nk.find(x => (x.day + ' P' + x.periodNumber) === l);
  console.log('  ' + l + ' | ' + e.subjectName + ' | ' + nk.filter(x => (x.day + ' P' + x.periodNumber) === l).map(x => cname[x.classId.toString()] || '?').join(' + '));
}
console.log('Thursday entries for Nkimi: ' + nk.filter(e => e.day === 'Thursday').length + ' (expect 0)');
await mongoose.disconnect();
console.log('\nVerify done');
