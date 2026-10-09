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
  const O = mongoose.Types.ObjectId;
  const moves = [
    // O4COM SM&C Thu p5 -> Monday p1 (own slot)
    { id: '6a9f814de1c8fb4ed3c14f0d', day: 'Monday', p: 1, start: '04:30', end: '05:15' },
    // O4COM SM&C Tue p6 -> Wednesday p1 (own slot)
    { id: '6a9f814de1c8fb4ed3c14f1e', day: 'Wednesday', p: 1, start: '04:30', end: '05:15' },
  ];
  for (const m of moves) {
    const e = await TT.findOne({ _id: new O(m.id) });
    if (!e) { console.log('NOT FOUND ' + m.id); continue; }
    const tBusy = await TT.find({ teacherId: e.teacherId, day: m.day, periodNumber: m.p }).toArray();
    if (tBusy.length) { console.log('SKIP teacher busy ' + m.day + ' p' + m.p); continue; }
    const cBusy = await TT.find({ classId: e.classId, day: m.day, periodNumber: m.p }).toArray();
    if (cBusy.length) { console.log('SKIP class busy ' + m.day + ' p' + m.p); continue; }
    await TT.updateOne({ _id: e._id }, { $set: { day: m.day, periodNumber: m.p, startTime: m.start, endTime: m.end } });
    console.log('MOVED ' + m.id + ' -> ' + m.day + ' p' + m.p);
  }
  const epie = await db.collection('users').findOne({ name: 'Mr Epie' });
  const all = await TT.find({ teacherId: epie._id }).sort({ day: 1, periodNumber: 1 }).toArray();
  for (const e of all) {
    const c = await db.collection('schoolclasses').findOne({ _id: e.classId });
    const s = await db.collection('subjects').findOne({ _id: e.subjectId });
    console.log(e.day + ' p' + e.periodNumber + ' | ' + (s && s.name) + ' | ' + (c && c.className) + ' (' + (c && c.department) + ')');
  }
  await mongoose.disconnect();
  console.log('DONE');
}
main().catch((e) => { console.error(e); process.exit(1); });
