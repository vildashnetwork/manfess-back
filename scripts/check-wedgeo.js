import 'dotenv/config';
import mongoose from 'mongoose';
import { connUri } from './dbhelper.js';
async function main() {
  await mongoose.connect(await connUri(process.env.MONGOURI));
  const db = mongoose.connection.db;
  const TT = db.collection('timetables');
  const evar = await db.collection('users').findOne({ name: 'Mr Evaristus' });
  const o4arts = await db.collection('schoolclasses').findOne({ className: 'Olevel 4', department: 'Arts' });
  const o4com = await db.collection('schoolclasses').findOne({ className: 'Olevel 4', department: 'Commercial' });
  for (let p = 1; p <= 6; p++) {
    const tB = await TT.countDocuments({ teacherId: evar._id, day: 'Wednesday', periodNumber: p });
    const aB = await TT.find({ classId: o4arts._id, day: 'Wednesday', periodNumber: p }).toArray();
    const cB = await TT.find({ classId: o4com._id, day: 'Wednesday', periodNumber: p }).toArray();
    const nm = async (arr) => {
      const o = [];
      for (const e of arr) {
        const s = await db.collection('subjects').findOne({ _id: e.subjectId });
        const u = await db.collection('users').findOne({ _id: e.teacherId });
        o.push((s && s.name) + '/' + (u && u.name));
      }
      return o.join(',');
    };
    console.log('Wed p' + p + ' Evaristus=' + tB + ' O4Arts=[' + await nm(aB) + '] O4Com=[' + await nm(cB) + ']');
  }
  await mongoose.disconnect();
  console.log('DONE');
}
main().catch((e) => { console.error(e); process.exit(1); });
