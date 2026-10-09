import 'dotenv/config';
import mongoose from 'mongoose';
import { connUri } from './dbhelper.js';
const TIMES = { 1: ['04:30','05:15'], 4: ['06:45','07:30'], 5: ['07:30','08:15'] };
async function main() {
  await mongoose.connect(await connUri(process.env.MONGOURI));
  const db = mongoose.connection.db;
  const TT = db.collection('timetables');
  const evar = await db.collection('users').findOne({ name: 'Mr Evaristus' });
  const nkimi = await db.collection('users').findOne({ name: 'Mr Nkimi' });
  const o4arts = await db.collection('schoolclasses').findOne({ className: 'Olevel 4', department: 'Arts' });
  const o4com = await db.collection('schoolclasses').findOne({ className: 'Olevel 4', department: 'Commercial' });
  const o5com = await db.collection('schoolclasses').findOne({ className: 'Olevel 5', department: 'Commercial' });
  const alSci = await db.collection('schoolclasses').findOne({ className: 'Alevel', department: 'Science' });
  const geoSubj = await db.collection('subjects').findOne({ name: 'Geography' });
  const ecoSubj = await db.collection('subjects').findOne({ name: 'Economics' });
  console.log('GEO=' + geoSubj._id + ' ECO=' + ecoSubj._id);
  const tmpl = await TT.findOne({ teacherId: evar._id, day: 'Monday', periodNumber: 4 });
  for (const p of [4, 5]) {
    for (const c of [o4arts, o4com]) {
      const tB = await TT.countDocuments({ teacherId: evar._id, day: 'Thursday', periodNumber: p });
      const cB = await TT.countDocuments({ classId: c._id, day: 'Thursday', periodNumber: p });
      if (tB || cB) { console.log('4) SKIP Thu p' + p + ' ' + c.department + ' (T=' + tB + ' C=' + cB + ')'); continue; }
      const doc = { teacherId: evar._id, teacherName: tmpl.teacherName, classId: c._id, className: o4arts.className, subjectId: geoSubj._id, subjectName: geoSubj.name, day: 'Thursday', startTime: TIMES[p][0], endTime: TIMES[p][1], periodNumber: p, cycle: tmpl.cycle, ratePerPeriod: tmpl.ratePerPeriod, academicYear: tmpl.academicYear, isActive: true };
      if (tmpl.schoolId) doc.schoolId = tmpl.schoolId;
      const r = await TT.insertOne(doc);
      console.log('4) Added Geography O4(' + c.department + ') Thu p' + p + ' id=' + r.insertedId);
    }
  }
  const tmplA = await TT.findOne({ teacherId: nkimi._id, day: 'Monday', periodNumber: 1 });
  let tB = await TT.countDocuments({ teacherId: nkimi._id, day: 'Wednesday', periodNumber: 5 });
  let cB = await TT.countDocuments({ classId: alSci._id, day: 'Wednesday', periodNumber: 5 });
  if (!tB && !cB) {
    const doc = { teacherId: nkimi._id, teacherName: tmplA.teacherName, classId: alSci._id, className: alSci.className, subjectId: ecoSubj._id, subjectName: ecoSubj.name, day: 'Wednesday', startTime: TIMES[5][0], endTime: TIMES[5][1], periodNumber: 5, cycle: tmplA.cycle, ratePerPeriod: tmplA.ratePerPeriod, academicYear: tmplA.academicYear, isActive: true };
    if (tmplA.schoolId) doc.schoolId = tmplA.schoolId;
    const r = await TT.insertOne(doc);
    console.log('5) Added Economics Alevel(Science) Wed p5 id=' + r.insertedId);
  } else console.log('5) SKIP Wed p5 (T=' + tB + ' C=' + cB + ')');
  const tmpl5 = await TT.findOne({ teacherId: nkimi._id, day: 'Monday', periodNumber: 3 });
  tB = await TT.countDocuments({ teacherId: nkimi._id, day: 'Wednesday', periodNumber: 1 });
  cB = await TT.countDocuments({ classId: o5com._id, day: 'Wednesday', periodNumber: 1 });
  if (!tB && !cB) {
    const doc = { teacherId: nkimi._id, teacherName: tmpl5.teacherName, classId: o5com._id, className: o5com.className, subjectId: ecoSubj._id, subjectName: ecoSubj.name, day: 'Wednesday', startTime: TIMES[1][0], endTime: TIMES[1][1], periodNumber: 1, cycle: tmpl5.cycle, ratePerPeriod: tmpl5.ratePerPeriod, academicYear: tmpl5.academicYear, isActive: true };
    if (tmpl5.schoolId) doc.schoolId = tmpl5.schoolId;
    const r = await TT.insertOne(doc);
    console.log('6) Added Economics O5(Commercial) Wed p1 id=' + r.insertedId);
  } else console.log('6) SKIP Wed p1 (T=' + tB + ' C=' + cB + ')');
  console.log('--- VERIFY ---');
  const g4 = await TT.find({ teacherId: evar._id, subjectId: geoSubj._id }).toArray();
  for (const e of g4) {
    const c = await db.collection('schoolclasses').findOne({ _id: e.classId });
    console.log('Evaristus GEO: ' + e.day + ' p' + e.periodNumber + ' ' + (c && (c.className + '(' + c.department + ')')));
  }
  const nW = await TT.find({ teacherId: nkimi._id, day: 'Wednesday' }).toArray();
  for (const e of nW) {
    const c = await db.collection('schoolclasses').findOne({ _id: e.classId });
    const s = await db.collection('subjects').findOne({ _id: e.subjectId });
    console.log('Nkimi Wed: p' + e.periodNumber + ' ' + (s && s.name) + ' ' + (c && (c.className + '(' + c.department + ')')));
  }
  await mongoose.disconnect();
  console.log('DONE-B');
}
main().catch((e) => { console.error(e); process.exit(1); });
