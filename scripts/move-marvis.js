// Move ALL Madam Marvis's Tuesday periods to Friday
import 'dotenv/config';
import mongoose from 'mongoose';
import dns from 'node:dns';
import { execFile } from 'node:child_process';
import { promisify } from 'node:util';

const execFileAsync = promisify(execFile);

const srvToStandardUri = async (srvUri) => {
  const match = srvUri.match(/^mongodb\+srv:\/\/([^:/?#]+)(?::([^@/#]*))?@([^/?#]+)(\/[^?#]*)?(\?.*)?$/);
  if (!match) return srvUri;
  const [, user, password = '', host, dbPath = '', query = ''] = match;
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
  console.log('Connected to Atlas');

  const users = mongoose.connection.db.collection('users');
  const timetables = mongoose.connection.db.collection('timetables');

  const marvis = await users.findOne({ name: 'Madam Marvis' });
  if (!marvis) { console.log('Madam Marvis not found'); return; }

  const tuesdayEntries = await timetables.find({ teacherId: marvis._id, day: 'Tuesday' }).toArray();
  console.log(`Found ${tuesdayEntries.length} Tuesday periods for Madam Marvis`);

  const fridayEntries = await timetables.find({ teacherId: marvis._id, day: 'Friday' }).toArray();
  const fridayUsed = new Set(fridayEntries.map(e => e.periodNumber));

  let moved = 0;
  for (const entry of tuesdayEntries) {
    let placed = false;
    for (let p = 1; p <= 6; p++) {
      if (fridayUsed.has(p)) continue;
      const classConflict = await timetables.findOne({
        classId: entry.classId, day: 'Friday', periodNumber: p, _id: { $ne: entry._id }
      });
      if (classConflict) continue;
      await timetables.updateOne({ _id: entry._id }, { $set: { day: 'Friday', periodNumber: p } });
      fridayUsed.add(p);
      console.log(`  Moved Tue p${entry.periodNumber} -> Fri p${p}`);
      moved++;
      placed = true;
      break;
    }
    if (!placed) {
      // Show what's blocking
      const blockers = [];
      for (let p = 1; p <= 6; p++) {
        const classConflict = await timetables.findOne({
          classId: entry.classId, day: 'Friday', periodNumber: p
        });
        const teacherConflict = fridayUsed.has(p);
        blockers.push(`p${p}:${classConflict ? 'class' : ''}${teacherConflict ? 'teacher' : ''}`);
      }
      console.log(`  Cannot move Tue p${entry.periodNumber} (class ${entry.classId}): ${blockers.join(', ')}`);
    }
  }
  console.log(`Moved ${moved}/${tuesdayEntries.length} to Friday`);

  await mongoose.disconnect();
  console.log('DONE');
}

main().catch(e => { console.error(e); process.exit(1); });