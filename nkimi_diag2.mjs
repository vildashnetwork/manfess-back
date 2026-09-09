// Focused diagnostic: why are marvis/mercy/epie/euinice immovable?
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
const NAMES = ['marvis', 'mercy', 'epie', 'euinice', 'fortune', 'ando', 'martin', 'gildeon', 'yoland'];
const users = await db.collection('users').find({}).toArray();
const classDocs = await db.collection('schoolclasses').find({}).toArray();
const cname = {};
classDocs.forEach(c => { cname[c._id.toString()] = c.className + (c.department ? ' (' + c.department + ')' : ''); });
const all = await db.collection('timetables').find({ academicYear: ACAD, isActive: true }).toArray();
for (const n of NAMES) {
  const u = users.find(x => (x.name || '').toLowerCase().includes(n) || (x.username || '').toLowerCase().includes(n) || (x.email || '').toLowerCase().includes(n));
  if (!u) { console.log('\n=== ' + n + ': NO USER DOC FOUND'); continue; }
  console.log('\n=== ' + n + ' | _id=' + u._id.toString() + ' | role=' + JSON.stringify(u.role) + ' | availableDays=' + JSON.stringify(u.availableDays));
  const entries = all.filter(e => e.teacherId.toString() === u._id.toString());
  entries.sort((a, b) => (a.day + a.periodNumber).localeCompare(b.day + b.periodNumber));
  entries.forEach(e => console.log('   ' + e.day + ' P' + e.periodNumber + ' | ' + e.subjectName + ' | ' + (cname[e.classId.toString()] || '?')));
}
await mongoose.disconnect();
console.log('\nDiag done');
