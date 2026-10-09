import 'dotenv/config';
import mongoose from 'mongoose';
import { connUri } from './dbhelper.js';
async function main() {
  await mongoose.connect(await connUri(process.env.MONGOURI));
  const db = mongoose.connection.db;
  const TT = db.collection('timetables');
  const epie = await db.collection('users').findOne({ name: 'Mr Epie' });
  const entSub = await db.collection('subjects').findOne({ name: 'Entrepreneurship' });
  const anchor = await TT.findOne({ teacherId: epie._id, day: 'Tuesday', periodNumber: 4 });
  const targets = [
    ['Beginers2', 'General'],
    ['Alevel', 'Science'],
    ['Alevel', 'Arts'],
  ];
  for (const [cn, dep] of targets) {
    const c = await db.collection('schoolclasses').findOne({ className: cn, department: dep });
    if (!c) { console.log('MISSING ' + cn + ' ' + dep); continue; }
    const dup = await TT.countDocuments({ teacherId: epie._id, day: 'Tuesday', periodNumber: 4, classId: c._id });
    if (dup) { console.log('ALREADY Tue p4 ' + cn + '(' + dep + ')'); continue; }
    const cB = await TT.find({ classId: c._id, day: 'Tuesday', periodNumber: 4 }).toArray();
    if (cB.length) {
      const parts = [];
      for (const e of cB) {
        const s = await db.collection('subjects').findOne({ _id: e.subjectId });
        parts.push(s && s.name);
      }
      console.log('SKIP class busy Tue p4 ' + cn + '(' + dep + '): [' + parts.join(',') + ']');
      continue;
    }
    const isA = /^Alevel/i.test(cn);
    const doc = { teacherId: epie._id, teacherName: anchor.teacherName, classId: c._id, className: c.className, subjectId: entSub._id, subjectName: entSub.name, day: 'Tuesday', startTime: '06:45', endTime: '07:30', periodNumber: 4, cycle: isA ? 'second' : anchor.cycle, ratePerPeriod: isA ? 700 : anchor.ratePerPeriod, academicYear: anchor.academicYear, isActive: true };
    if (anchor.schoolId) doc.schoolId = anchor.schoolId;
    const r = await TT.insertOne(doc);
    console.log('Added ENT ' + cn + '(' + dep + ') Tue p4 joint id=' + r.insertedId);
  }
  console.log('--- Tue p4 joint ---');
  const t = await TT.find({ teacherId: epie._id, day: 'Tuesday', periodNumber: 4 }).toArray();
  for (const e of t) {
    const c = await db.collection('schoolclasses').findOne({ _id: e.classId });
    console.log('Tue p4 ' + (c && (c.className + '(' + c.department + ')')));
  }
  await mongoose.disconnect();
  console.log('DONE');
}
main().catch((e) => { console.error(e); process.exit(1); });
