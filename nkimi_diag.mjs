// Diagnostic: why can't Commerce OL5 fit Mon-Wed?
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
const O = (id) => new mongoose.Types.ObjectId(id);
const NKIMI = '6a97b0d9ac4ccdf7ea024cb3';
const ACAD = '2026-2027';
const OL5 = ['6a9706c7530d27459070478e','6a9706d7530d27459070478f','6a97aa0e909973238d6acc01'];
const all = await db.collection('timetables').find({ academicYear: ACAD, isActive: true }).toArray();
const teachers = await db.collection('users').find({}).toArray();
const tinfo = {};
teachers.forEach(u => { tinfo[u._id.toString()] = { name: u.name || u.username || u.email, days: (u.availableDays && u.availableDays.length) ? u.availableDays : ['Mon-Wed? all'] }; });
const classDocs = await db.collection('schoolclasses').find({}).toArray();
const cname = {};
classDocs.forEach(c => { cname[c._id.toString()] = c.className + (c.department ? ' (' + c.department + ')' : ''); });
const DAYS = ['Monday','Tuesday','Wednesday'];
for (let p = 1; p <= 6; p++) for (const d of DAYS) {
  const here = all.filter(e => e.day === d && e.periodNumber === p && OL5.includes(e.classId.toString()));
  const nk = here.some(e => e.teacherId.toString() === NKIMI);
  console.log('--- ' + d + ' P' + p + (nk ? '  [NKIMI BUSY]' : ''));
  here.forEach(e => {
    const t = tinfo[e.teacherId.toString()] || { name: '?', days: [] };
    console.log('    ' + (cname[e.classId.toString()] || '?') + ' | ' + e.subjectName + ' | teacher=' + t.name + ' | days=' + t.days.join(','));
  });
}
await mongoose.disconnect();
