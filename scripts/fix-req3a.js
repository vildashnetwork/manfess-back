import 'dotenv/config';
import mongoose from 'mongoose';
import { connUri } from './dbhelper.js';
const TIMES = { 1: ['04:30','05:15'], 2: ['05:15','06:00'], 3: ['06:00','06:45'], 4: ['06:45','07:30'], 5: ['07:30','08:15'], 6: ['08:15','09:00'] };
async function main() {
  await mongoose.connect(await connUri(process.env.MONGOURI));
  const db = mongoose.connection.db;
  const TT = db.collection('timetables');
  const epie = await db.collection('users').findOne({ name: 'Mr Epie' });
  const evar = await db.collection('users').findOne({ name: 'Mr Evaristus' });
  const delT = await TT.deleteMany({ teacherId: evar._id, day: 'Tuesday' });
  console.log('1) Deleted Evaristus Tuesday docs: ' + delT.deletedCount);
  const monDoc = await TT.findOne({ teacherId: epie._id, day: 'Monday', periodNumber: 1 });
  if (monDoc) {
    const tB = await TT.countDocuments({ teacherId: epie._id, day: 'Thursday', periodNumber: 6 });
    const cB = await TT.countDocuments({ classId: monDoc.classId, day: 'Thursday', periodNumber: 6 });
    if (!tB && !cB) {
      await TT.updateOne({ _id: monDoc._id }, { $set: { day: 'Thursday', periodNumber: 6, startTime: TIMES[6][0], endTime: TIMES[6][1] } });
      console.log('2) Moved Epie SM&C O4Com Mon p1 -> Thu p6');
    } else console.log('2) SKIP Thu p6 busy (T=' + tB + ' C=' + cB + ')');
  }
  const wedDoc = await TT.findOne({ teacherId: epie._id, day: 'Wednesday', periodNumber: 1 });
  if (wedDoc) {
    const tB = await TT.countDocuments({ teacherId: epie._id, day: 'Tuesday', periodNumber: 3 });
    const cB = await TT.countDocuments({ classId: wedDoc.classId, day: 'Tuesday', periodNumber: 3 });
    if (!tB && !cB) {
      await TT.updateOne({ _id: wedDoc._id }, { $set: { day: 'Tuesday', periodNumber: 3, startTime: TIMES[3][0], endTime: TIMES[3][1] } });
      console.log('3) Moved Epie SM&C O4Com Wed p1 -> Tue p3');
    } else console.log('3) SKIP Tue p3 busy (T=' + tB + ' C=' + cB + ')');
  }
  console.log('Epie Mon=' + await TT.countDocuments({ teacherId: epie._id, day: 'Monday' }) + ' Wed=' + await TT.countDocuments({ teacherId: epie._id, day: 'Wednesday' }) + ' Tue=' + await TT.countDocuments({ teacherId: epie._id, day: 'Tuesday' }) + ' Thu=' + await TT.countDocuments({ teacherId: epie._id, day: 'Thursday' }));
  console.log('Evaristus Tue=' + await TT.countDocuments({ teacherId: evar._id, day: 'Tuesday' }));
  await mongoose.disconnect();
  console.log('DONE-A');
}
main().catch((e) => { console.error(e); process.exit(1); });
