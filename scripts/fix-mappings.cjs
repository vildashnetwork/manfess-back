// Fix missing class mappings for teachers
// Mr Billa needs Alevel for PMS, Mr Fortune needs Alevel for ICT

const mongoose = require('mongoose');
const dns = require('dns');
const { execFile } = require('child_process');
const { promisify } = require('util');
require('dotenv').config();
const execFileAsync = promisify(execFile);

// Convert mongodb+srv:// to standard mongodb:// using OS DNS fallback
async function srvToStandardUri(srvUri) {
  const match = srvUri.match(/^mongodb\+srv:\/\/([^:/?#]+)(?::([^@/#]*))?@[^/?#]+(\/[^?#]*)?(\?.*)?$/);
  if (!match) return srvUri;
  const [, user, password = '', dbPath = '', query = ''] = match;
  const host = srvUri.match(/@([^/?#]+)/)[1];

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
}

async function main() {
  const ONLINE_URI = process.env.MONGOURI;
  const standardUri = await srvToStandardUri(ONLINE_URI);
  await mongoose.connect(standardUri, {
    serverSelectionTimeoutMS: 10000,
    socketTimeoutMS: 45000,
    family: 4
  });

  const db = mongoose.connection.db;

  // Find subjects PMS and ICT
  const pms = await db.collection('subjects').findOne({ name: 'PMS' });
  const ict = await db.collection('subjects').findOne({ name: 'ICT' });
  console.log('PMS subject:', pms?._id?.toString(), pms?.name);
  console.log('ICT subject:', ict?._id?.toString(), ict?.name);

  // Find Alevel classes
  const alevelClasses = await db.collection('schoolclasses').find({
    className: { $regex: /alevel/i }
  }).toArray();
  console.log('Alevel classes:', alevelClasses.map(c => ({ id: c._id?.toString(), name: c.className, dept: c.department })));

  const alevelIds = alevelClasses.map(c => c._id.toString());

  // Find Mr Billa and Mr Fortune
  const billa = await db.collection('users').findOne({ name: 'Mr Billa' });
  const fortune = await db.collection('users').findOne({ name: 'Mr Fortune' });
  console.log('Mr Billa classIds:', billa?.classIds);
  console.log('Mr Fortune classIds:', fortune?.classIds);

  // Add Alevel classes to Mr Billa (for PMS)
  if (billa) {
    const billaClassIds = (billa.classIds || []).map(String);
    const missing = alevelIds.filter(id => !billaClassIds.includes(id));
    if (missing.length) {
      const updated = [...billaClassIds, ...missing];
      await db.collection('users').updateOne(
        { _id: billa._id },
        { $set: { classIds: updated } }
      );
      console.log(`✅ Mr Billa: added ${missing.length} Alevel classes`);
    } else {
      console.log('Mr Billa already has all Alevel classes');
    }
  }

  // Add Alevel classes to Mr Fortune (for ICT)
  if (fortune) {
    const fortuneClassIds = (fortune.classIds || []).map(String);
    const missing = alevelIds.filter(id => !fortuneClassIds.includes(id));
    if (missing.length) {
      const updated = [...fortuneClassIds, ...missing];
      await db.collection('users').updateOne(
        { _id: fortune._id },
        { $set: { classIds: updated } }
      );
      console.log(`✅ Mr Fortune: added ${missing.length} Alevel classes`);
    } else {
      console.log('Mr Fortune already has all Alevel classes');
    }
  }

  // Add Alevel classes to Madam Mercy (for Literature in English)
  const mercy = await db.collection('users').findOne({ name: 'Madam Mercy' });
  if (mercy) {
    const mercyClassIds = (mercy.classIds || []).map(String);
    const missing = alevelIds.filter(id => !mercyClassIds.includes(id));
    if (missing.length) {
      const updated = [...mercyClassIds, ...missing];
      await db.collection('users').updateOne(
        { _id: mercy._id },
        { $set: { classIds: updated } }
      );
      console.log(`✅ Madam Mercy: added ${missing.length} Alevel classes`);
    } else {
      console.log('Madam Mercy already has all Alevel classes');
    }
  }

  // Add Olevel 5 classes to Madam Nsoseh (for Mathematics)
  const nsoseh = await db.collection('users').findOne({ name: 'Madam Nsoseh' });
  const olevel5Classes = await db.collection('schoolclasses').find({
    className: { $regex: /olevel 5/i }
  }).toArray();
  const olevel5Ids = olevel5Classes.map(c => c._id.toString());
  if (nsoseh) {
    const nsosehClassIds = (nsoseh.classIds || []).map(String);
    const missing = olevel5Ids.filter(id => !nsosehClassIds.includes(id));
    if (missing.length) {
      const updated = [...nsosehClassIds, ...missing];
      await db.collection('users').updateOne(
        { _id: nsoseh._id },
        { $set: { classIds: updated } }
      );
      console.log(`✅ Madam Nsoseh: added ${missing.length} Olevel 5 classes`);
    } else {
      console.log('Madam Nsoseh already has all Olevel 5 classes');
    }
  }

  await mongoose.disconnect();
  console.log('\nDone! Now click "Fix All Conflicts" in the timetable.');
}

main().catch(err => {
  console.error('Error:', err.message);
  process.exit(1);
});
