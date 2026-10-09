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
  const epie = await db.collection('users').findOne({ name: 'Mr Epie' });
  console.log('EPIE _id=' + epie._id);
  const all = await TT.find({ teacherId: epie._id }).sort({ day: 1, periodNumber: 1 }).toArray();
  for (const e of all) {
    const c = await db.collection('schoolclasses').findOne({ _id: e.classId });
    const s = await db.collection('subjects').findOne({ _id: e.subjectId });
    console.log(e.day + ' p' + e.periodNumber + ' ' + e.startTime + '-' + e.endTime + ' | ' + (s && s.name) + ' | ' + (c && c.className) + ' (' + (c && c.department) + ') | id=' + e._id);
  }
  console.log('TOTAL=' + all.length);
  await mongoose.disconnect();
  console.log('DONE');
}
main().catch((e) => { console.error(e); process.exit(1); });
