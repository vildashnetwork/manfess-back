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
  try {
    records = await dns.promises.resolveSrv(`_mongodb._tcp.${host}`);
  } catch {
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
  const marvis = await db.collection('users').findOne({ name: 'Madam Marvis' });
  console.log('MARVIS _id=' + marvis?._id);
  const entries = await db.collection('timetables').find({ teacherId: marvis._id }).toArray();
  const classIds = [...new Set(entries.map((e) => String(e.classId)))];
  const subjIds = [...new Set(entries.map((e) => String(e.subjectId)))];
  const { ObjectId } = mongoose.Types;
  const clsDocs = await db.collection('schoolclasses').find({ _id: { $in: classIds.map((id) => new ObjectId(id)) } }).toArray();
  const subjDocs = await db.collection('subjects').find({ _id: { $in: subjIds.map((id) => new ObjectId(id)) } }).toArray();
  const clsMap = Object.fromEntries(clsDocs.map((c) => [String(c._id), `${c.className} (${c.department || ''})`]));
  const subjMap = Object.fromEntries(subjDocs.map((s) => [String(s._id), s.name]));
  entries.sort((a, b) => String(a.day).localeCompare(String(b.day)) || (a.periodNumber - b.periodNumber));
  for (const e of entries) {
    console.log(`${e.day} p${e.periodNumber} ${e.startTime}-${e.endTime} | ${subjMap[String(e.subjectId)] || e.subjectId} | ${clsMap[String(e.classId)] || e.classId} | id=${e._id}`);
  }
  console.log('TOTAL=' + entries.length);
  await mongoose.disconnect();
}
main().catch((e) => { console.error(e); process.exit(1); });
