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
  const days = ['Tuesday', 'Wednesday'];
  const classes = await db.collection('schoolclasses').find({}).toArray();
  for (const d of days) {
    for (const c of classes) {
      let l = d + ' ' + c.className + '(' + c.department + '):';
      for (let p = 1; p <= 6; p++) {
        const docs = await TT.find({ classId: c._id, day: d, periodNumber: p }).toArray();
        if (!docs.length) l += ' p' + p + '=free';
        else {
          const parts = [];
          for (const e of docs) {
            const s = await db.collection('subjects').findOne({ _id: e.subjectId });
            const u = await db.collection('users').findOne({ _id: e.teacherId });
            parts.push((s && s.name) + '/' + (u && u.name));
          }
          l += ' p' + p + '=[' + parts.join(',') + ']';
        }
      }
      console.log(l);
    }
  }
  await mongoose.disconnect();
  console.log('DONE');
}
main().catch((e) => { console.error(e); process.exit(1); });
