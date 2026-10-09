import 'dotenv/config';
import mongoose from 'mongoose';
import dns from 'node:dns';
import { execFile } from 'node:child_process';
import { promisify } from 'node:util';
const execFileAsync = promisify(execFile);
async function connUri(srvUri) {
  const m = srvUri.match(/^mongodb\+srv:\/\/([^/]+)@([^/]+)(\/[^?]*)?(\?.*)?$/);
  if (!m) return srvUri;
  const [, creds, host, dbPath = '', query = ''] = m;
  let recs;
  try { recs = await dns.promises.resolveSrv('_mongodb._tcp.' + host); }
  catch {
    const cmd = 'Resolve-DnsName -Type SRV "_mongodb._tcp.' + host + '" -ErrorAction Stop | Select-Object NameTarget,Port | ConvertTo-Json -Compress';
    const out = await execFileAsync('powershell.exe', ['-NoProfile', '-NonInteractive', '-Command', cmd], { windowsHide: true, timeout: 15000 });
    const p = JSON.parse(out.stdout.trim());
    const list = Array.isArray(p) ? p : [p];
    recs = list.map((r) => ({ name: String(r.NameTarget).replace(/\.$/, ''), port: Number(r.Port) }));
  }
  const hosts = recs.map((r) => r.name + ':' + r.port).join(',');
  const prm = new URLSearchParams(query ? query.slice(1) : '');
  if (!prm.has('tls')) prm.set('tls', 'true');
  if (!prm.has('authSource')) prm.set('authSource', 'admin');
  return 'mongodb://' + creds + '@' + hosts + (dbPath || '/') + '?' + prm.toString();
}
async function main() {
  const uri = await connUri(process.env.MONGOURI);
  await mongoose.connect(uri);
  const db = mongoose.connection.db;
  const TT = db.collection('timetables');
  for (const nm of ['Mr Epie', 'Mr Evaristus', 'Mr Nkimi']) {
    const t = await db.collection('users').findOne({ name: nm });
    if (!t) { console.log('NOT FOUND teacher ' + nm); continue; }
    console.log('=== ' + nm + ' _id=' + t._id + ' ===');
    const all = await TT.find({ teacherId: t._id }).sort({ day: 1, periodNumber: 1 }).toArray();
    for (const e of all) {
      const c = await db.collection('schoolclasses').findOne({ _id: e.classId });
      const s = await db.collection('subjects').findOne({ _id: e.subjectId });
      console.log(e.day + ' p' + e.periodNumber + ' ' + e.startTime + '-' + e.endTime + ' | ' + (s && s.name) + ' | ' + (c && (c.className + ' (' + c.department + ')')) + ' | id=' + e._id);
    }
    console.log('TOTAL ' + nm + '=' + all.length);
  }
  // Wednesday grid: teacher busy + Olevel4 geo class busy + Alevel + Olevel5 busy
  const nkimi = await db.collection('users').findOne({ name: 'Mr Nkimi' });
  const evar = await db.collection('users').findOne({ name: 'Mr Evaristus' });
  const o4 = await db.collection('schoolclasses').find({ className: 'Olevel 4' }).toArray();
  const o5 = await db.collection('schoolclasses').find({ className: 'Olevel 5' }).toArray();
  const al = await db.collection('schoolclasses').find({ className: { $regex: '^Alevel' } }).toArray();
  console.log('--- Wednesday occupancy ---');
  for (let p = 1; p <= 6; p++) {
    const nN = await TT.countDocuments({ teacherId: nkimi._id, day: 'Wednesday', periodNumber: p });
    const nE = await TT.countDocuments({ teacherId: evar._id, day: 'Wednesday', periodNumber: p });
    let s = 'Wed p' + p + ' NkimiBusy=' + nN + ' EvaristusBusy=' + nE;
    for (const c of o4) {
      const n = await TT.countDocuments({ classId: c._id, day: 'Wednesday', periodNumber: p });
      s += ' | O4(' + c.department + ')=' + n;
    }
    for (const c of o5) {
      const n = await TT.countDocuments({ classId: c._id, day: 'Wednesday', periodNumber: p });
      s += ' | O5(' + c.department + ')=' + n;
    }
    for (const c of al) {
      const n = await TT.countDocuments({ classId: c._id, day: 'Wednesday', periodNumber: p });
      s += ' | ' + c.className + '(' + c.department + ')=' + n;
    }
    console.log(s);
  }
  // Tuesday Evaristus detail + Mon-Fri Evaristus detail
  console.log('--- Evaristus Tuesday detail ---');
  const tues = await TT.find({ teacherId: evar._id, day: 'Tuesday' }).toArray();
  for (const e of tues) {
    const c = await db.collection('schoolclasses').findOne({ _id: e.classId });
    const s2 = await db.collection('subjects').findOne({ _id: e.subjectId });
    console.log('Tue p' + e.periodNumber + ' | ' + (s2 && s2.name) + ' | ' + (c && (c.className + ' (' + c.department + ')')) + ' | id=' + e._id);
  }
  // Subjects: Geography, Economics ids
  const geo = await db.collection('subjects').find({ name: { $regex: 'geograph', $options: 'i' } }).toArray();
  const eco = await db.collection('subjects').find({ name: { $regex: 'econom', $options: 'i' } }).toArray();
  console.log('GEO subjects: ' + geo.map((g) => g.name + '=' + g._id).join(' ; '));
  console.log('ECO subjects: ' + eco.map((g) => g.name + '=' + g._id).join(' ; '));
  await mongoose.disconnect();
  console.log('DONE');
}
main().catch((e) => { console.error(e); process.exit(1); });
