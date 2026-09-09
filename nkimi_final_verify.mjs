// Final verify: Nkimi complete, moved entries sane, no conflicts
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
const PERIOD_START = { 1: '04:30', 2: '05:15', 3: '06:00', 4: '06:45', 5: '07:30', 6: '08:15' };
const PERIOD_END = { 1: '05:15', 2: '06:00', 3: '06:45', 4: '07:30', 5: '08:15', 6: '09:00' };

let issues = 0;
for (const e of all) {
  if (PERIOD_START[e.periodNumber] && (e.startTime !== PERIOD_START[e.periodNumber] || e.endTime !== PERIOD_END[e.periodNumber])) {
    issues++; console.log('BAD TIME: ' + cname[e.classId.toString()] + ' ' + e.subjectName + ' ' + e.day + ' P' + e.periodNumber + ' ' + e.startTime + '-' + e.endTime);
  }
}
console.log('Time mismatches: ' + issues);

// Per-class schedule + Nkimi totals
const nk = all.filter(e => e.teacherName === 'nkimi');
console.log('\nNkimi lessons (distinct slots): ' + new Set(nk.map(e => e.day + ' P' + e.periodNumber)).size);
for (const cid of new Set(nk.map(e => e.classId.toString()))) {
  const cnt = nk.filter(e => e.classId.toString() === cid);
  console.log('  ' + (cname[cid] || '?') + ': ' + cnt.length + ' entries');
}
console.log('\nFortune (moved) entries:');
const fortune = all.filter(e => e.teacherName === 'fortune');
fortune.sort((a, b) => (a.day + a.periodNumber).localeCompare(b.day + b.periodNumber));
fortune.forEach(e => console.log('  ' + (cname[e.classId.toString()] || '?') + ' | ' + e.subjectName + ' | ' + e.day + ' P' + e.periodNumber));

// Global conflict re-check on fresh data
const seen = new Map();
let conf = 0;
for (const e of all) {
  const k = e.day + '|' + e.periodNumber + '|' + e.classId.toString();
  if (seen.has(k)) { conf++; console.log('CONFLICT: ' + k + ' -> ' + e.subjectName + ' vs ' + seen.get(k)); }
  else seen.set(k, e.subjectName);
}
console.log('\nFresh class conflicts: ' + conf);
await mongoose.disconnect();
