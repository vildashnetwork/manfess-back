import 'dotenv/config';
import mongoose from 'mongoose';
import { connUri } from './dbhelper.js';
const TIMES = { 4: ['06:45','07:30'], 5: ['07:30','08:15'] };
async function main() {
  await mongoose.connect(await connUri(process.env.MONGOURI));
  const db = mongoose.connection.db;
  const TT = db.collection('timetables');
  const evar = await db.collection('users').findOne({ name: 'Mr Evaristus' });
  const o4com = await db.collection('schoolclasses').findOne({ className: 'Olevel 4', department: 'Commercial' });
  const geoSubj = await db.collection('subjects').findOne({ name: 'Geography' });
  const tmpl = await TT.findOne({ teacherId: evar._id, day: 'Thursday', periodNumber: 4 });
  for (const p of [4, 5]) {
    const exists = await TT.countDocuments({ teacherId: evar._id, day: 'Thursday', periodNumber: p, classId: o4com._id });
    if (exists) { console.log('Thu p' + p + ' Commercial already present'); continue; }
    const cB = await TT.countDocuments({ classId: o4com._id, day: 'Thursday', periodNumber: p });
    if (cB) { console.log('Thu p' + p + ' Commercial class busy'); continue; }
    const doc = { teacherId: evar._id, teacherName: tmpl.teacherName, classId: o4com._id, className: o4com.className, subjectId: geoSubj._id, subjectName: geoSubj.name, day: 'Thursday', startTime: TIMES[p][0], endTime: TIMES[p][1], periodNumber: p, cycle: tmpl.cycle, ratePerPeriod: tmpl.ratePerPeriod, academicYear: tmpl.academicYear, isActive: true };
    if (tmpl.schoolId) doc.schoolId = tmpl.schoolId;
    const r = await TT.insertOne(doc);
    console.log('Added Geography O4(Commercial) Thu p' + p + ' id=' + r.insertedId);
  }
  const g = await TT.find({ teacherId: evar._id, day: 'Thursday' }).toArray();
  for (const e of g) {
    const c = await db.collection('schoolclasses').findOne({ _id: e.classId });
    const s = await db.collection('subjects').findOne({ _id: e.subjectId });
    console.log('Evaristus Thu: p' + e.periodNumber + ' ' + (s && s.name) + ' ' + (c && (c.className + '(' + c.department + ')')));
  }
  await mongoose.disconnect();
  console.log('DONE-C');
}
main().catch((e) => { console.error(e); process.exit(1); });
