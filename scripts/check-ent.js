import 'dotenv/config';
import mongoose from 'mongoose';
import { connUri } from './dbhelper.js';
async function main() {
  await mongoose.connect(await connUri(process.env.MONGOURI));
  const db = mongoose.connection.db;
  const TT = db.collection('timetables');
  const epie = await db.collection('users').findOne({ name: 'Mr Epie' });
  const entSub = await db.collection('subjects').findOne({ name: 'Entrepreneurship' });
  console.log('ENT id=' + (entSub && entSub._id));
  const classes = await db.collection('schoolclasses').find({}).toArray();
  for (const c of classes) {
    const docs = await TT.find({ subjectId: entSub._id, classId: c._id }).toArray();
    console.log(c.className + '(' + c.department + ') ENT count=' + docs.length);
    for (const e of docs.slice(0, 10)) {
      const u = await db.collection('users').findOne({ _id: e.teacherId });
      console.log('   ' + e.day + ' p' + e.periodNumber + ' ' + (u && u.name));
    }
  }
  console.log('--- Epie full grid ---');
  for (const d of ['Monday','Tuesday','Wednesday','Thursday','Friday']) {
    let l = d + ':';
    for (let p = 1; p <= 6; p++) {
      const n = await TT.countDocuments({ teacherId: epie._id, day: d, periodNumber: p });
      l += ' p' + p + '=' + n;
    }
    console.log(l);
  }
  // free slots for classes WITHOUT entrepreneurship
  const noEnt = [];
  for (const c of classes) {
    const n = await TT.countDocuments({ subjectId: entSub._id, classId: c._id });
    if (!n) noEnt.push(c);
  }
  console.log('--- classes with NO entrepreneurship ---');
  for (const c of noEnt) {
    console.log('NO-ENT: ' + c.className + '(' + c.department + ')=' + c._id);
    for (const d of ['Monday','Tuesday','Wednesday','Thursday','Friday']) {
      let l = '  ' + d + ':';
      for (let p = 1; p <= 6; p++) {
        const cB = await TT.countDocuments({ classId: c._id, day: d, periodNumber: p });
        const tB = await TT.countDocuments({ teacherId: epie._id, day: d, periodNumber: p });
        l += ' p' + p + (cB ? '[classBusy]' : (tB ? '(epieBusy)' : '=FREE'));
      }
      console.log(l);
    }
  }
  await mongoose.disconnect();
  console.log('DONE');
}
main().catch((e) => { console.error(e); process.exit(1); });
