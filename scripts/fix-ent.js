import 'dotenv/config';
import mongoose from 'mongoose';
import { connUri } from './dbhelper.js';
async function main() {
  await mongoose.connect(await connUri(process.env.MONGOURI));
  const db = mongoose.connection.db;
  const TT = db.collection('timetables');
  const epie = await db.collection('users').findOne({ name: 'Mr Epie' });
  const entSub = await db.collection('subjects').findOne({ name: 'Entrepreneurship' });
  const tmpl = await TT.findOne({ teacherId: epie._id, day: 'Tuesday', periodNumber: 2 });
  const targets = [
    ['Beginers1', 'General'],
    ['Beginers2', 'General'],
    ['Alevel', 'Science'],
    ['Alevel', 'Arts'],
  ];
  for (const [cn, dep] of targets) {
    const c = await db.collection('schoolclasses').findOne({ className: cn, department: dep });
    if (!c) { console.log('MISSING CLASS ' + cn + ' ' + dep); continue; }
    const tB = await TT.countDocuments({ teacherId: epie._id, day: 'Tuesday', periodNumber: 4 });
    const cB = await TT.countDocuments({ classId: c._id, day: 'Tuesday', periodNumber: 4 });
    if (tB || cB) { console.log('SKIP Tue p4 ' + cn + '(' + dep + ') T=' + tB + ' C=' + cB); continue; }
    const isA = /^Alevel/i.test(cn);
    const doc = { teacherId: epie._id, teacherName: tmpl.teacherName, classId: c._id, className: c.className, subjectId: entSub._id, subjectName: entSub.name, day: 'Tuesday', startTime: '06:45', endTime: '07:30', periodNumber: 4, cycle: isA ? 'second' : tmpl.cycle, ratePerPeriod: isA ? 700 : tmpl.ratePerPeriod, academicYear: tmpl.academicYear, isActive: true };
    if (tmpl.schoolId) doc.schoolId = tmpl.schoolId;
    const r = await TT.insertOne(doc);
    console.log('Added ENT ' + cn + '(' + dep + ') Tue p4 id=' + r.insertedId);
  }
  console.log('--- Epie Tuesday ---');
  const t = await TT.find({ teacherId: epie._id, day: 'Tuesday' }).toArray();
  for (const e of t) {
    const c = await db.collection('schoolclasses').findOne({ _id: e.classId });
    const s = await db.collection('subjects').findOne({ _id: e.subjectId });
    console.log('Tue p' + e.periodNumber + ' ' + (s && s.name) + ' ' + (c && (c.className + '(' + c.department + ')')));
  }
  await mongoose.disconnect();
  console.log('DONE');
}
main().catch((e) => { console.error(e); process.exit(1); });
