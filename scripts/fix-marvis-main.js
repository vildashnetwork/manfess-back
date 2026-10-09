async function main() {
  const uri = await connUri(process.env.MONGOURI);
  await mongoose.connect(uri);
  const db = mongoose.connection.db;
  const TT = db.collection('timetables');
  const O = mongoose.Types.ObjectId;
  const show = async (e) => {
    const u = await db.collection('users').findOne({ _id: e.teacherId });
    const c = await db.collection('schoolclasses').findOne({ _id: e.classId });
    const s = await db.collection('subjects').findOne({ _id: e.subjectId });
    return e.day + ' p' + e.periodNumber + ' ' + e.startTime + '-' + e.endTime + ' | ' + (s && s.name) + ' | ' + (u && u.name) + ' | ' + (c && c.className) + ' (' + (c && c.department) + ')';
  };
  const swaps = [
    ['6a9f814de1c8fb4ed3c14ebd', '6a9f814de1c8fb4ed3c14ed4'],
    ['6a9f814de1c8fb4ed3c14ebe', '6a9f814de1c8fb4ed3c14ed5'],
    ['6a9f814de1c8fb4ed3c14ee6', '6a9f814de1c8fb4ed3c14ef7'],
  ];
  for (const pair of swaps) {
    const a = await TT.findOne({ _id: new O(pair[0]) });
    const b = await TT.findOne({ _id: new O(pair[1]) });
    if (!a || !b) { console.log('SKIP not found ' + pair[0]); continue; }
    console.log('SWAP: A=' + await show(a) + ' || B=' + await show(b));
    if (a.day !== 'Tuesday' || b.day !== 'Friday') { console.log('SKIP days'); continue; }
    const chk1 = await TT.find({ teacherId: a.teacherId, day: 'Friday', periodNumber: b.periodNumber }).toArray();
    if (chk1.some((x) => String(x.subjectId) !== String(a.subjectId))) { console.log('SKIP A-teacher busy Fri p' + b.periodNumber); continue; }
    const chk2 = await TT.find({ teacherId: b.teacherId, day: 'Tuesday', periodNumber: a.periodNumber }).toArray();
    if (chk2.some((x) => String(x.subjectId) !== String(b.subjectId))) { console.log('SKIP B-teacher busy Tue p' + a.periodNumber); continue; }
    const chk3 = await TT.find({ classId: a.classId, day: 'Friday', periodNumber: b.periodNumber }).toArray();
    if (chk3.some((x) => String(x._id) !== String(b._id))) { console.log('SKIP A-class busy Fri p' + b.periodNumber); continue; }
    const chk4 = await TT.find({ classId: b.classId, day: 'Tuesday', periodNumber: a.periodNumber }).toArray();
    if (chk4.some((x) => String(x._id) !== String(a._id))) { console.log('SKIP B-class busy Tue p' + a.periodNumber); continue; }
    await TT.updateOne({ _id: a._id }, { $set: { day: 'Friday', periodNumber: b.periodNumber, startTime: b.startTime, endTime: b.endTime } });
    await TT.updateOne({ _id: b._id }, { $set: { day: 'Tuesday', periodNumber: a.periodNumber, startTime: a.startTime, endTime: a.endTime } });
    console.log('DONE: A->Fri p' + b.periodNumber + ' B->Tue p' + a.periodNumber);
  }
  const stray = await TT.findOne({ _id: new O('6a9f814de1c8fb4ed3c14ebc') });
  if (stray) {
    console.log('STRAY: ' + await show(stray));
    const st = await db.collection('schoolsettings').findOne({ academicYear: '2026-2027' });
    if (st) {
      const cs = toStr(toMin(st.schoolStartTime) + (stray.periodNumber - 1) * st.periodDurationMinutes);
      const ce = toStr(toMin(cs) + st.periodDurationMinutes);
      await TT.updateOne({ _id: stray._id }, { $set: { startTime: cs, endTime: ce } });
      console.log('FIXED stray time -> ' + cs + '-' + ce);
    }
  }
  const marvis = await db.collection('users').findOne({ name: 'Madam Marvis' });
  const tue = await TT.find({ teacherId: marvis._id, day: 'Tuesday' }).toArray();
  console.log('Marvis Tuesday after fix: ' + tue.length);
  for (const e of tue) console.log('  STILL TUE: ' + await show(e));
  const fri = await TT.find({ teacherId: marvis._id, day: 'Friday' }).sort({ periodNumber: 1 }).toArray();
  console.log('Marvis Friday: ' + fri.length);
  for (const e of fri) console.log('  FRI: ' + await show(e));
  await mongoose.disconnect();
  console.log('DONE');
}
main().catch((e) => { console.error(e); process.exit(1); });
