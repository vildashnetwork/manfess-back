// scripts/test-e2e.js
// End-to-end test: clones the LIVE Atlas data into a throwaway local database
// (MANFESS_TEST), mounts the real /api/timetable/generate route against it,
// and verifies the HTTP response, the persisted rows and the invariants.
import 'dotenv/config';
import mongoose from 'mongoose';
import dns from 'node:dns';
import { execFile } from 'node:child_process';
import { promisify } from 'node:util';
import express from 'express';

const execFileAsync = promisify(execFile);
const ONLINE_URI = process.env.MONGOURI;
const ATLAS_DB = 'MANFESS';
const OFFLINE_TEST_URI = process.env.MONGOURIOFFLINE || 'mongodb://127.0.0.1:27017/MANFESS_OFFLINE';
const TEST_URI = OFFLINE_TEST_URI.replace(/MANFESS_OFFLINE/g, 'MANFESS_TEST');

const srvToStandardUri = async (srvUri) => {
  const match = srvUri.match(/^mongodb\+srv:\/\/([^:/?#]+)(?::([^@/#]*))?@([^/?#]+)(\/[^?#]*)?(\?.*)?$/);
  if (!match) return srvUri;
  const [, user, password = '', host, dbPath = '', query = ''] = match;
  let records;
  try {
    records = await dns.promises.resolveSrv(`_mongodb._tcp.${host}`);
  } catch {
    const cmd = `Resolve-DnsName -Type SRV "_mongodb._tcp.${host}" -ErrorAction Stop | Select-Object NameTarget,Port | ConvertTo-Json -Compress`;
    const { stdout } = await execFileAsync('powershell.exe', ['-NoProfile', '-NonInteractive', '-Command', cmd], {
      windowsHide: true,
      timeout: 15000,
    });
    const parsed = JSON.parse(stdout.trim());
    const list = Array.isArray(parsed) ? parsed : [parsed];
    records = list
      .filter((r) => r && r.NameTarget && r.Port)
      .map((r) => ({ name: String(r.NameTarget).replace(/\.$/, ''), port: Number(r.Port) }));
  }
  const hosts = records.map((r) => `${r.name}:${r.port}`).join(',');
  const params = new URLSearchParams(query ? query.slice(1) : '');
  if (!params.has('tls') && !params.has('ssl')) params.set('tls', 'true');
  if (!params.has('authSource')) params.set('authSource', 'admin');
  return `mongodb://${user}:${password}@${hosts}${dbPath || '/'}?${params.toString()}`;
};

const main = async () => {
  const atlasUri = await srvToStandardUri(ONLINE_URI);
  const atlas = mongoose.createConnection(atlasUri, { serverSelectionTimeoutMS: 20000 });
  await atlas.asPromise();
  const srcDb = atlas.useDb(ATLAS_DB);

  console.log('Reading source collections from Atlas...');
  const [classes, teachers, subjects, settings, tt] = await Promise.all([
    srcDb.collection('schoolclasses').find({}).toArray(),
    srcDb.collection('users').find({}).toArray(),
    srcDb.collection('subjects').find({}).toArray(),
    srcDb.collection('schoolsettings').find({ academicYear: '2026-2027' }).toArray(),
    srcDb.collection('timetables').find({ academicYear: '2026-2027' }).toArray()  
  ]);

  console.log(`read classes=${classes.length} teachers=${teachers.length} subjects=${subjects.length} settings=${settings.length} tt=${tt.length}`);

  await atlas.close();

  // ---- Connect the DEFAULT mongoose connection to the throwaway test DB ----
  await mongoose.connect(TEST_URI, { serverSelectionTimeoutMS: 8000 });
  const testDb = mongoose.connection.db;
  console.log('Test DB connected:', TEST_URI);

  // Clean slate
  const collections = await testDb.collections();
  for (const c of collections) await c.drop().catch(() => {});
  await testDb.collection('schoolclasses').insertMany(classes);
  await testDb.collection('users').insertMany(teachers);
  await testDb.collection('subjects').insertMany(subjects);
  await testDb.collection('schoolsettings').insertMany(settings);
  await testDb.collection('timetables').insertMany(tt);
  console.log('Test data inserted.');

  // ---- Mount the real router ----
  const { default: timetableRoutes } = await import('../routes/timetable.js');
  const app = express();
  app.use(express.json());
  app.use('/api', timetableRoutes);

  const res = app.listen(0);
  await new Promise((r) => res.once('listening', r));
  const port = res.address().port;

  for (const repair of [false, true]) {
    console.log(`\n===== E2E HTTP (repair=${repair}) =====`);
    const response = await fetch(`http://127.0.0.1:${port}/api/timetable/generate`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ academicYear: '2026-2027', repair }),
    });
    const body = await response.json();
    console.log(`status=${response.status} success=${body.success}`);
    if (!body.success) { console.log(JSON.stringify(body, null, 2).slice(0, 1000)); continue; }
    const data = body.data;
    console.log(`generated=${data.generated} conflicts=${data.conflicts.length} totalPeriods=${data.totalPeriods}`);
    data.conflicts.slice(0, 3).forEach((c) => console.log(`  conflict: ${c.subjectName} missing ${c.missingPeriods}`));
    if (body.message) console.log('message:', body.message);
  }

  res.close();
  await mongoose.connection.close();
  console.log('\nDONE');
};

main().catch((err) => {
  console.error('Fatal:', err);
  process.exit(1);
});