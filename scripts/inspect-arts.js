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
  const clsDocs = await db.collection('schoolclasses').find({}).toArray();
  const clsById = Object.fromEntries(clsDocs.map((c) => [String(c._id), c]));
  const clsByName = Object.fromEntries(clsDocs.map((c) => [`${c.className} (${c.department || ''})`, c]));
  const users = await db.collection('users').find({}).toArray();
  const uMap = Object.fromEntries(users.map((u) => [String(u._id), u.name]));
  const subjDocs = await db.collection('subjects').find({}).toArray();
  const sMap = Object.fromEntries(subjDocs.map((s) => [String(s._id), s.name]));
  const showClass = async (label) => {
    const c = clsByName[label];
    if (!c) { console.log('CLASS NOT FOUND: ' + label); return; }
    console.log('=== ' + label + ' Tue+Fri ===');
    const list = await db.collection('timetables').find({ classId: c._id, day: { $in: ['Tuesday', 'Friday'] } }).sort({ day: 1, periodNumber: 1 }).toArray();
    for (const e of list) console.log(` ${e.day} p${e.periodNumber} ${e.startTime}-${e.endTime} | ${sMap[String(e.subjectId)]} | t=${uMap[String(e.teacherId)]}`);
  };
  await showClass('Olevel 4 (Arts)');
  await showClass('Olevel 3 (General)');
  // teacher Tuesday occupancy for potential swap teachers
  for (const tn of ['Madam Nsoseh', 'Mr Billa', 'Madam Mercy', 'Mr Evaristus', 'Mr Fortune', 'Mr Epie', 'Madam Marvis']) {
    const u = users.find((x) => x.name === tn);
    if (!u) continue;
    const tue = await db.collection('timetables').find({ teacherId: u._id, day: 'Tuesday' }).sort({ periodNumber: 1 }).toArray();
    console.log(`--- ${tn} Tuesday: ` + tue.map((e) => `p${e.periodNumber}(${sMap[String(e.subjectId)]}@${clsById[String(e.classId)] ? clsById[String(e.classId)].className + '/' + clsById[String(e.classId)].department : '?'})`).join(', '));
  }
  await mongoose.disconnect();
}
main().catch((e) => { console.error(e); process.exit(1); });
