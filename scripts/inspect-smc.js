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
  const days = ['Monday', 'Tuesday', 'Wednesday', 'Thursday', 'Friday'];
  // Find class ids
  const o4com = await db.collection('schoolclasses').findOne({ className: 'Olevel 4', department: 'Commercial' });
  const o5com = await db.collection('schoolclasses').findOne({ className: 'Olevel 5', department: 'Commercial' });
  console.log('O4COM=' + (o4com && o4com._id) + ' O5COM=' + (o5com && o5com._id));
  const epie = await db.collection('users').findOne({ name: 'Mr Epie' });
  for (const d of days) {
    let line = d + ': ';
    for (let p = 1; p <= 6; p++) {
      const tBusy = await TT.countDocuments({ teacherId: epie._id, day: d, periodNumber: p });
      const c4Busy = o4com ? await TT.countDocuments({ classId: o4com._id, day: d, periodNumber: p }) : -1;
      const c5Busy = o5com ? await TT.countDocuments({ classId: o5com._id, day: d, periodNumber: p }) : -1;
      line += 'p' + p + '(T' + tBusy + '/4:' + c4Busy + '/5:' + c5Busy + ') ';
    }
    console.log(line);
  }
  // Detail what occupies candidate slots
  for (const d of ['Monday', 'Wednesday', 'Friday']) {
    for (let p = 1; p <= 6; p++) {
      const c4 = o4com ? await TT.find({ classId: o4com._id, day: d, periodNumber: p }).toArray() : [];
      if (c4.length) {
        for (const e of c4) {
          const s = await db.collection('subjects').findOne({ _id: e.subjectId });
          const u = await db.collection('users').findOne({ _id: e.teacherId });
          console.log('O4COM busy ' + d + ' p' + p + ' | ' + (s && s.name) + ' | ' + (u && u.name));
        }
      }
    }
  }
  await mongoose.disconnect();
  console.log('DONE');
}
main().catch((e) => { console.error(e); process.exit(1); });
