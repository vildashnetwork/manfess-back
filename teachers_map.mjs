// Who teaches what? Full teacher/subject map + slot usage per teacher
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
const users = await db.collection('users').find({ role: 'teacher' }).toArray();
const all = await db.collection('timetables').find({ academicYear: ACAD, isActive: true }).toArray();
for (const u of users) {
  const entries = all.filter(e => e.teacherId.toString() === u._id.toString());
  const subjects = [...new Set(entries.map(e => e.subjectName))];
  const slots = new Set(entries.map(e => e.day + ' P' + e.periodNumber));
  console.log(u.name + ' | id=' + u._id + ' | days=' + JSON.stringify(u.availableDays) + ' | entries=' + entries.length + ' | slotsUsed=' + slots.size + ' | subjects=' + subjects.join(', '));
}
// Literature coverage specifically
console.log('\n--- Literature in English entries ---');
all.filter(e => e.subjectName === 'Literature in English').sort((a, b) => (a.day + a.periodNumber).localeCompare(b.day + b.periodNumber))
  .forEach(e => console.log('  ' + e.day + ' P' + e.periodNumber + ' | ' + e.teacherName + ' | ' + e.classId));
await mongoose.disconnect();
console.log('\nDiag done');
