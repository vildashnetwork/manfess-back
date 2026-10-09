import 'dotenv/config';
import mongoose from 'mongoose';
import { connUri } from './dbhelper.js';
const TIMES = { 1: ['04:30','05:15'], 5: ['07:30','08:15'] };
async function main() {
  await mongoose.connect(await connUri(process.env.MONGOURI));
  const db = mongoose.connection.db;
  const TT = db.collection('timetables');
  const evar = await db.collection('users').findOne({ name: 'Mr Evaristus' });
  const geoSubj = await db.collection('subjects').findOne({ name: 'Geography' });
  const thu = await TT.find({ teacherId: evar._id, subjectId: geoSubj._id, day: 'Thursday' }).toArray();
  console.log('Thursday GEO docs: ' + thu.length);
  const arts = thu.filter((e) => String(e.classId) !== '');
  const byClass = {};
  for (const e of thu) {
    const k = String(e.classId);
    if (!byClass[k]) byClass[k] = [];
    byClass[k].push(e);
  }
  const classes = Object.keys(byClass);
  console.log('classes: ' + classes.length);
  // Move: first doc of each class -> Wed p1, second doc of each class -> Wed p5
  let i = 0;
  for (const k of classes) {
    const docs = byClass[k].sort((a, b) => a.periodNumber - b.periodNumber);
    for (let j = 0; j < docs.length; j++) {
      const p = j === 0 ? 1 : 5;
      await TT.updateOne({ _id: docs[j]._id }, { $set: { day: 'Wednesday', periodNumber: p, startTime: TIMES[p][0], endTime: TIMES[p][1] } });
      console.log('Moved ' + docs[j]._id + ' Thu p' + docs[j].periodNumber + ' -> Wed p' + p);
    }
    i++;
  }
  const g = await TT.find({ teacherId: evar._id, subjectId: geoSubj._id }).toArray();
  for (const e of g) {
    const c = await db.collection('schoolclasses').findOne({ _id: e.classId });
    console.log('Evaristus GEO: ' + e.day + ' p' + e.periodNumber + ' ' + (c && (c.className + '(' + c.department + ')')));
  }
  await mongoose.disconnect();
  console.log('DONE');
}
main().catch((e) => { console.error(e); process.exit(1); });
