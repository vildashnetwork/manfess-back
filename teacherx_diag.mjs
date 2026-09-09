// teacherx identity + EPOLE schedule + OL5A free slots on Tue/Thu
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
const all = await db.collection('timetables').find({ academicYear: ACAD, isActive: true }).toArray();
const classDocs = await db.collection('schoolclasses').find({}).toArray();
const cname = {};
classDocs.forEach(c => { cname[c._id.toString()] = c.className + (c.department ? ' (' + c.department + ')' : ''); });

// teacherx identity
const tx = all.filter(e => e.teacherName === 'teacherx');
const txIds = [...new Set(tx.map(e => e.teacherId.toString()))];
console.log('teacherx entries: ' + tx.length + ', teacherIds: ' + JSON.stringify(txIds));
for (const id of txIds) {
  const u = await db.collection('users').findOne({ _id: new mongoose.Types.ObjectId(id) });
  console.log('  user lookup ' + id + ': ' + (u ? JSON.stringify({ name: u.name, role: u.role, days: u.availableDays }) : 'NOT FOUND'));
}
tx.sort((a, b) => (a.day + a.periodNumber).localeCompare(b.day + b.periodNumber));
tx.forEach(e => console.log('  ' + e.day + ' P' + e.periodNumber + ' | ' + e.subjectName + ' | ' + (cname[e.classId.toString()] || '?')));

// EPOLE schedule
const ep = await db.collection('users').findOne({ name: /EPOLE/i }) || await db.collection('users').findOne({ _id: new mongoose.Types.ObjectId('6a97a806909973238d6acbfd') });
console.log('\nEPOLE: id=' + (ep && ep._id) + ' days=' + JSON.stringify(ep && ep.availableDays));
const epEntries = all.filter(e => e.teacherId.toString() === '6a97a806909973238d6acbfd');
epEntries.sort((a, b) => (a.day + a.periodNumber).localeCompare(b.day + b.periodNumber));
epEntries.forEach(e => console.log('  ' + e.day + ' P' + e.periodNumber + ' | ' + e.subjectName + ' | ' + (cname[e.classId.toString()] || '?')));

// OL5A occupancy Tue/Thu
const OL5A = '6a9706c7530d27459070478e';
console.log('\nOL5 (Arts) occupancy Tuesday/Thursday:');
for (const d of ['Tuesday', 'Thursday']) {
  for (let p = 1; p <= 6; p++) {
    const here = all.filter(e => e.day === d && e.periodNumber === p && e.classId.toString() === OL5A);
    console.log('  ' + d + ' P' + p + ': ' + (here.length ? here.map(e => e.subjectName + '/' + e.teacherName).join('; ') : 'FREE'));
  }
}
await mongoose.disconnect();
console.log('\nDiag done');
