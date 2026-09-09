// Fix Nkimi: availability Mon/Tue/Wed, redistribute periods, remove Thursday
import mongoose from 'mongoose';
import { ObjectId } from 'mongodb';
const uri = 'mongodb://manfess_admin:GOLDBLISSZ33@ac-88ksdaw-shard-00-00.bf8h1wy.mongodb.net:27017,ac-88ksdaw-shard-00-01.bf8h1wy.mongodb.net:27017,ac-88ksdaw-shard-00-02.bf8h1wy.mongodb.net:27017/MANFESS?tls=true&authSource=admin&replicaSet=atlas-10fmul-shard-0&retryWrites=true&w=majority';
await mongoose.connect(uri, { serverSelectionTimeoutMS: 45000 });
const db = mongoose.connection.db;
const log = console.log;

const NKIMI = '6a97b0d9ac4ccdf7ea024cb3';
const ACAD = '2026-2027';

// Update availability
await db.collection('users').updateOne(
  { _id: new ObjectId(NKIMI) },
  { $set: { availableDays: ['Monday', 'Tuesday', 'Wednesday'], updatedAt: new Date() } }
);
log('Updated Nkimi availability to Mon/Tue/Wed');

// Delete existing
const del = await db.collection('timetables').deleteMany({ teacherId: new ObjectId(NKIMI), academicYear: ACAD });
log(`Deleted ${del.deletedCount} old entries`);

const PERIODS = [[1,'04:30','05:15'],[2,'05:15','06:00'],[3,'06:00','06:45'],[4,'06:45','07:30'],[5,'07:30','08:15'],[6,'08:15','09:00']];

// Class IDs
const OL5 = ['6a9706c7530d27459070478e', '6a9706d7530d27459070478f', '6a97aa0e909973238d6acc01'];
const OL4 = ['6a9706a5530d27459070478c', '6a9706b4530d27459070478d', '6a97aa36909973238d6acc02'];
const OL3 = '6a970694530d27459070478b';
const ALAR = '6a97a2079f9c0d8ee43447d3';

// Subject IDs
const COMMERCE_OL5 = '6a979e683c1247098a21e165';
const ECON_OL5 = '6a97f6bd3e41b0fcc3fa1deb';
const ECON_AL = '6a97f70d3e41b0fcc3fa1dec';

// Get existing bookings on Mon/Tue/Wed for the classes Nkimi needs
const classesToCheck = [...OL5, ...OL4, OL3, ALAR];
const existing = await db.collection('timetables').find({
  academicYear: ACAD, day: { $in: ['Monday', 'Tuesday', 'Wednesday'] }, isActive: true
}).toArray();

const occ = {};
for (const day of ['Monday', 'Tuesday', 'Wednesday']) {
  occ[day] = {};
  for (let p = 1; p <= 6; p++) occ[day][p] = new Set();
}
for (const e of existing) {
  for (const c of classesToCheck) {
    if (e.classId.toString() === c && occ[e.day] && occ[e.day][e.periodNumber]) {
      occ[e.day][e.periodNumber].add(c);
    }
  }
}

function findSlot(cids, days) {
  for (const day of days) {
    for (let p = 1; p <= 6; p++) {
      if (cids.every(c => !occ[day][p].has(c))) return { day, p };
    }
  }
  return null;
}

function markSlot(day, p, cids) {
  for (const c of cids) occ[day][p].add(c);
}

function makeEntry(cid, subjId, subjName, code, cycle, day, p) {
  return {
    teacherId: new ObjectId(NKIMI),
    teacherName: 'nkimi',
    classId: new ObjectId(cid),
    subjectId: new ObjectId(subjId),
    subjectName: subjName,
    subjectCode: code,
    day, startTime: PERIODS[p-1][1], endTime: PERIODS[p-1][2],
    periodNumber: p, cycle, ratePerPeriod: cycle === 'first' ? 500 : 700,
    academicYear: ACAD, isActive: true
  };
}

const newEntries = [];
const DAYS = ['Monday', 'Tuesday', 'Wednesday'];

// 1 OL5 Commerce
let slot = findSlot(OL5, DAYS);
if (slot) { markSlot(slot.day, slot.p, OL5); OL5.forEach(c => newEntries.push(makeEntry(c, COMMERCE_OL5, 'Commerce', '0530', 'first', slot.day, slot.p))); log('Commerce OL5:', slot.day, 'P'+slot.p); }
else log('FAILED: Commerce OL5');

// 2 OL5 Economics
for (let i = 0; i < 2; i++) {
  slot = findSlot(OL5, DAYS);
  if (slot) { markSlot(slot.day, slot.p, OL5); OL5.forEach(c => newEntries.push(makeEntry(c, ECON_OL5, 'Economics', '0525', 'first', slot.day, slot.p))); log('Econ OL5 #'+(i+1)+':', slot.day, 'P'+slot.p); }
  else { log('FAILED: Econ OL5 #'+(i+1)); }
}

// 2 OL4 Economics
for (let i = 0; i < 2; i++) {
  slot = findSlot(OL4, DAYS);
  if (slot) { markSlot(slot.day, slot.p, OL4); OL4.forEach(c => newEntries.push(makeEntry(c, ECON_OL5, 'Economics', '0525', 'first', slot.day, slot.p))); log('Econ OL4 #'+(i+1)+':', slot.day, 'P'+slot.p); }
  else { log('FAILED: Econ OL4 #'+(i+1)); }
}

// 1 OL3 Economics
slot = findSlot([OL3], DAYS);
if (slot) { markSlot(slot.day, slot.p, [OL3]); newEntries.push(makeEntry(OL3, ECON_OL5, 'Economics', '0525', 'second', slot.day, slot.p)); log('Econ OL3:', slot.day, 'P'+slot.p); }
else log('FAILED: Econ OL3');

// 3 AL AR Economics
for (let i = 0; i < 3; i++) {
  slot = findSlot([ALAR], DAYS);
    if (slot) { markSlot(slot.day, slot.p, [ALAR]); newEntries.push(makeEntry(ALAR, ECON_AL, 'Economics', '0725', 'second', slot.day, slot.p)); log('Econ ALAR #'+(i+1)+':', slot.day, 'P'+slot.p); }
  else { log('FAILED: Econ ALAR #'+(i+1)); }
}

if (newEntries.length > 0) {
  await db.collection('timetables').insertMany(newEntries);
  log(`Inserted ${newEntries.length} new entries`);
}

// Verify
const verify = await db.collection('timetables').find({ teacherId: new ObjectId(NKIMI), academicYear: ACAD }).toArray();
log(`\n=== NKIMI TOTAL: ${verify.length} entries ===`);
verify.sort((a,b) => a.periodNumber - b.periodNumber);
for (const day of DAYS_ORDERED2 = ['Monday','Tuesday','Wednesday','Thursday','Friday']) {
  const de = verify.filter(e => e.day === day);
  if (de.length) log(`${day}: ${de.length} - ${de.map(e=>`P${e.periodNumber} ${e.subjectName} ${e.className.split('(')[0].trim()}`).join(', ')}`);
}

await mongoose.disconnect();
log('Done!');
