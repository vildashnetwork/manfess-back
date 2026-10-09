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
  const evar = await db.collection('users').findOne({ name: 'Mr Evaristus' });
  const nkimi = await db.collection('users').findOne({ name: 'Mr Nkimi' });
  const classes = await db.collection('schoolclasses').find({}).toArray();
  const byName = {};
  for (const c of classes) byName[c.className + '|' + c.department] = c;
  const days = ['Monday', 'Tuesday', 'Wednesday', 'Thursday', 'Friday'];
  const show = ['Olevel 4|Arts', 'Olevel 4|Commercial', 'Olevel 4|Science', 'Olevel 5|Arts', 'Olevel 5|Commercial', 'Olevel 5|Science', 'Olevel 3|General'];
  const alevels = classes.filter((c) => /^Alevel/i.test(c.className));
  console.log('ALEVELS: ' + alevels.map((c) => c.className + ' (' + c.department + ')=' + c._id).join(' ; '));
  for (const d of days) {
    let l1 = d + ' Epie:'; let l2 = d + ' Evar:'; let l3 = d + ' Nkimi:';
    for (let p = 1; p <= 6; p++) {
      l1 += ' p' + p + '=' + await TT.countDocuments({ teacherId: epie._id, day: d, periodNumber: p });
      l2 += ' p' + p + '=' + await TT.countDocuments({ teacherId: evar._id, day: d, periodNumber: p });
      l3 += ' p' + p + '=' + await TT.countDocuments({ teacherId: nkimi._id, day: d, periodNumber: p });
    }
    console.log(l1); console.log(l2); console.log(l3);
    for (const k of show) {
      const c = byName[k]; if (!c) { console.log(d + ' ' + k + ' MISSING CLASS'); continue; }
      let l = d + ' ' + k + ':';
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
    for (const c of alevels) {
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
  // sample docs for cloning: Nkimi Alevel Economics, Nkimi O5 Economics, Evaristus Geography
  const ecoSub = await db.collection('subjects').findOne({ name: 'Economics' });
  const smp1 = await TT.findOne({ teacherId: nkimi._id, day: 'Monday', periodNumber: 1 });
  console.log('SAMPLE NkimiDoc: ' + JSON.stringify(smp1));
  const geoSmp = await TT.findOne({ teacherId: evar._id, day: 'Friday', periodNumber: 1 });
  console.log('SAMPLE EvaristusDoc: ' + JSON.stringify(geoSmp));
  console.log('ECO subjectIds count: ' + await db.collection('subjects').countDocuments({ name: 'Economics' }));
  await mongoose.disconnect();
  console.log('DONE');
}
main().catch((e) => { console.error(e); process.exit(1); });
