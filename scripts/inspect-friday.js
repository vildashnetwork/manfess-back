import 'dotenv/config';
import mongoose from 'mongoose';
import dns from 'node:dns';
import { execFile } from 'node:child_process';
import { promisify } from 'node:util';

const execFileAsync = promisify(execFile);
const srvToStandardUri = async (srvUri) => {
  const m = srvUri.match(/^mongodb\+srv:\/\/([^:/?#]+)(?::([^@/#]*))?@([^/?#]+)(\/[^?#]*)?(\?.*)?$/);
  if (!m) return srvUri;
  const [, user, password = '', host, dbPath = '', query = ''] = m;
  let records;
  try { records = await dns.promises.resolveSrv(`_mongodb._tcp.${host}`); }
  catch {
    const cmd = `Resolve-DnsName -Type SRV "_mongodb._tcp.${host}" -ErrorAction Stop | Select-Object NameTarget,Port | ConvertTo-Json -Compress`;
    const { stdout } = await execFileAsync('powershell.exe', ['-NoProfile', '-NonInteractive', '-Command', cmd], { windowsHide: true, timeout: 15000 });
    const parsed = JSON.parse(stdout.trim());
    const list = Array.isArray(parsed) ? parsed : [parsed];
    records = list.filter((r) => r && r.NameTarget && r.Port).map((r) => ({ name: String(r.NameTarget).replace(/\.$/, ''), port: Number(r.Port) }));
  }
  const hosts = records.map((r) => `${r.name}:${r.port}`).join(',');
  const params = new URLSearchParams(query ? query.slice(1) : '');
  if (!params.has('tls') && !params.has('ssl')) params.set('tls', 'true');
  if (!params.has('authSource')) params.set('authSource', 'admin');
  return `mongodb://${user}:${password}@${hosts}${dbPath || '/'}?${params.toString()}`;
};

async function main() {
  const uri = await srvToStandardUri(process.env.MONGOURI);
  await mongoose.connect(uri);
  const db = mongoose.connection.db;
  const { ObjectId } = mongoose.Types;
  const clsDocs = await db.collection('schoolclasses').find({}).toArray();
  const clsMap = Object.fromEntries(clsDocs.map((c) => [String(c._id), `${c.className} (${c.department || ''})`]));
  const subjDocs = await db.collection('subjects').find({}).toArray();
  const subjMap = Object.fromEntries(subjDocs.map((s) => [String(s._id), s.name]));
  const byName = (n) => clsDocs.find((c) => `${c.className} (${c.department || ''})` === n);
  const targets = ['Olevel 4 (Commercial)', 'Olevel 4 (Science)'];
  for (const t of targets) {
    const c = byName(t);
    if (!c) { console.log('CLASS NOT FOUND: ' + t); continue; }
    console.log('=== Friday schedule for ' + t + ' ===');
    const fri = await db.collection('timetables').find({ classId: c._id, day: 'Friday' }).sort({ periodNumber: 1 }).toArray();
    const users = await db.collection('users').find({}).toArray();
    const uMap = Object.fromEntries(users.map((u) => [String(u._id), u.name]));
    for (const e of fri) console.log(` p${e.periodNumber} ${e.startTime}-${e.endTime} | ${subjMap[String(e.subjectId)]} | teacher=${uMap[String(e.teacherId)]} | id=${e._id}`);
    if (!fri.length) console.log(' (none)');
    console.log('=== All-days occupancy for ' + t + ' ===');
    const all = await db.collection('timetables').find({ classId: c._id }).sort({ day: 1, periodNumber: 1 }).toArray();
    for (const e of all) console.log(` ${e.day} p${e.periodNumber} | ${subjMap[String(e.subjectId)]} | teacher=${uMap[String(e.teacherId)]}`);
  }
  // Marvis Friday usage
  const marvis = await db.collection('users').findOne({ name: 'Madam Marvis' });
  const mf = await db.collection('timetables').find({ teacherId: marvis._id, day: 'Friday' }).sort({ periodNumber: 1 }).toArray();
  console.log('=== Marvis Friday usage ===');
  for (const e of mf) console.log(` p${e.periodNumber} | ${subjMap[String(e.subjectId)]} | ${clsMap[String(e.classId)]}`);
  await mongoose.disconnect();
}
main().catch((e) => { console.error(e); process.exit(1); });
