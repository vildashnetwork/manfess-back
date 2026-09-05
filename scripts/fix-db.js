// Fix database mappings directly
import 'dotenv/config';
import mongoose from 'mongoose';
import dns from 'node:dns';
import { execFile } from 'node:child_process';
import { promisify } from 'node:util';

const execFileAsync = promisify(execFile);
const ObjectId = mongoose.Types.ObjectId;

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
  console.log('Resolving Atlas connection...');
  const uri = await srvToStandardUri(process.env.MONGOURI);
  await mongoose.connect(uri);
  console.log('Connected to Atlas');

  const users = mongoose.connection.db.collection('users');
  const subjectsColl = mongoose.connection.db.collection('subjects');
  const subjClasses = async (id) => {
    const s = await subjectsColl.findOne({ _id: new ObjectId(id) });
    return s ? s.classIds.map(String) : [];
  };

  // FIX 1: Madam Nsoseh - ONLY Beginers1 & Beginers2, Math & CS
  await users.updateOne(
    { name: 'Madam Nsoseh' },
    { $set: { classIds: ['6a9704c85032926f622478fe', '6a97cb51b9515c2fc9126dd1'], subjectIds: ['6a984a4980277c731bad9584', '6a984e7a80277c731bad9588'] } }
  );
  console.log('FIXED Madam Nsoseh');

  // FIX 2: Map teachers to ALL classes for their common subjects
  await users.updateOne({ name: 'Madam Mercy' }, { $set: { classIds: await subjClasses('6a97ec38d648cdd3b375ff04') } });
  console.log('FIXED Madam Mercy');

  await users.updateOne({ name: 'Mr Billa' }, { $set: { classIds: await subjClasses('6a984a4980277c731bad9584') } });
  console.log('FIXED Mr Billa');

  await users.updateOne({ name: 'Mr Fortune' }, { $set: { classIds: await subjClasses('6a984e7a80277c731bad9588') } });
  console.log('FIXED Mr Fortune');

  await users.updateOne({ name: 'Mr Martin' }, { $set: { classIds: await subjClasses('6a98579b80277c731bad9592') } });
  console.log('FIXED Mr Martin');

  await users.updateOne({ name: 'Mr Nkimi' }, { $set: { classIds: [...new Set([...await subjClasses('6a97bab1ac4ccdf7ea024cb9'), ...await subjClasses('6a97f6bd3e41b0fcc3fa1deb')])] } });
  console.log('FIXED Mr Nkimi');

  // Science teachers: Chemistry + Biology
  const chemCls = await subjClasses('6a98546b80277c731bad958d');
  const bioCls = await subjClasses('6a98552880277c731bad958f');
  const scienceCls = [...new Set([...chemCls, ...bioCls])];
  await users.updateOne({ name: 'Madam Yoland' }, { $set: { classIds: scienceCls } });
  await users.updateOne({ name: 'Madam Euinice' }, { $set: { classIds: scienceCls } });
  console.log('FIXED Science teachers');

  // Physics teachers
  const physicsCls = await subjClasses('6a984b7080277c731bad9587');
  const billaCls = await subjClasses('6a984a4980277c731bad9584');
  const fortuneCls = await subjClasses('6a984e7a80277c731bad9588');
  await users.updateOne({ name: 'Mr Billa' }, { $set: { classIds: [...new Set([...billaCls, ...physicsCls])] } });
  await users.updateOne({ name: 'Mr Fortune' }, { $set: { classIds: [...new Set([...fortuneCls, ...physicsCls])] } });
  console.log('FIXED Physics teachers');

  // citizenship + Geography -> Mr Evaristus
  await users.updateOne({ name: 'Mr Evaristus' }, { $set: { classIds: [...new Set([...await subjClasses('6a97b8f4ac4ccdf7ea024cb8'), ...await subjClasses('6a97b6eeac4ccdf7ea024cb6')])] } });
  console.log('FIXED Mr Evaristus');

  // Entrepreneurship -> Mr Epie
  await users.updateOne({ name: 'Mr Epie' }, { $set: { classIds: await subjClasses('6a979e683c1247098a21e165') } });
  console.log('FIXED Mr Epie');

  // History + Geography -> Mr Ando
  await users.updateOne({ name: 'Mr Ando' }, { $set: { classIds: [...new Set([...await subjClasses('6a97fb972953f86db205a79e'), ...await subjClasses('6a97b6eeac4ccdf7ea024cb6')])] } });
  console.log('FIXED Mr Ando');

  // History -> Mr Gildeon
  await users.updateOne({ name: 'Mr Gildeon' }, { $set: { classIds: await subjClasses('6a97fb972953f86db205a79e') } });
  console.log('FIXED Mr Gildeon');

  // FIX 3: Reassign subjects that Madam Nsoseh no longer teaches
  // Business Mathematics (5073) -> Mr Billa (he's already mapped to all classes)
  await users.updateOne({ name: 'Mr Billa' }, { $set: { subjectIds: ['6a984ad680277c731bad9586', '6a984b7080277c731bad9587', '6a984a8880277c731bad9585', '6a984a4980277c731bad9584', '6a984f9680277c731bad958a'] } });
  console.log('FIXED Business Mathematics -> Mr Billa');

  // Accounting (0505) -> Mr Nkimi
  await users.updateOne({ name: 'Mr Nkimi' }, { $set: { subjectIds: ['6a97bab1ac4ccdf7ea024cb9', '6a97f6bd3e41b0fcc3fa1deb', '6a97f70d3e41b0fcc3fa1dec', '6a9850a080277c731bad958b'] } });
  console.log('FIXED Accounting -> Mr Nkimi');

  // Digital Marketing (5070) -> Madam Marvis
  await users.updateOne({ name: 'Madam Marvis' }, { $set: { subjectIds: ['6a97bb25ac4ccdf7ea024cba', '6a97bab1ac4ccdf7ea024cb9', '6a98520a80277c731bad958c'] } });
  console.log('FIXED Digital Marketing -> Madam Marvis');

  // FIX 4: Add Alevel mappings for teachers who need them
  const alevelArtsId = '6a97a2079f9c0d8ee43447d3';
  const alevelScienceId = '6a97a1e89f9c0dee43447d2';

  // PMS (0770) -> Mr Billa needs Alevel
  const pmsCls = await subjClasses('6a984a8880277c731bad9585');
  await users.updateOne({ name: 'Mr Billa' }, { $set: { classIds: [...new Set([...billaCls, ...pmsCls])] } });
  console.log('FIXED Mr Billa: added Alevel for PMS');

  // ICT (0796) -> Mr Fortune needs Alevel
  const ictCls = await subjClasses('6a9b96c1599adbcb7398ee31');
  await users.updateOne({ name: 'Mr Fortune' }, { $set: { classIds: [...new Set([...fortuneCls, ...ictCls])] } });
  console.log('FIXED Mr Fortune: added Alevel for ICT');

  // French (0745) -> Mr Martin needs Alevel
  const frenchAlevelCls = await subjClasses('6a9857ce80277c731bad9593');
  const martinCls = await subjClasses('6a98579b80277c731bad9592');
  await users.updateOne({ name: 'Mr Martin' }, { $set: { classIds: [...new Set([...martinCls, ...frenchAlevelCls])] } });
  console.log('FIXED Mr Martin: added Alevel for French');

  // Economics (0725) -> Mr Nkimi needs Alevel
  const econAlevelCls = await subjClasses('6a97f70d3e41b0fcc3fa1dec');
  const nkimiCls = [...new Set([...await subjClasses('6a97bab1ac4ccdf7ea024cb9'), ...await subjClasses('6a97f6bd3e41b0fcc3fa1deb')])];
  await users.updateOne({ name: 'Mr Nkimi' }, { $set: { classIds: [...new Set([...nkimiCls, ...econAlevelCls])] } });
  console.log('FIXED Mr Nkimi: added Alevel for Economics');

  await mongoose.disconnect();
  console.log('DONE');
}

main().catch(e => { console.error(e); process.exit(1); });
