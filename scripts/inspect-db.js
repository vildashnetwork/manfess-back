// Temporary DB inspection script
print('collections:');
db.getCollectionNames().forEach(function (c) {
  print('  ' + c + ' = ' + db.getCollection(c).countDocuments({}));
});
print('timetables by year:');
db.timetables.aggregate([{ $group: { _id: '$academicYear', n: { $sum: 1 } } }]).forEach(function (x) {
  print('  ' + x._id + ' = ' + x.n);
});
print('sample timetable days for 2026-2027:');
db.timetables.aggregate([
  { $match: { academicYear: '2026-2027' } },
  { $group: { _id: '$day', n: { $sum: 1 } } },
  { $sort: { _id: 1 } },
]).forEach(function (x) {
  print('  ' + x._id + ' = ' + x.n);
});
print('per-class scheduled counts (2026-2027, distinct day+period per class):');
db.timetables.aggregate([
  { $match: { academicYear: '2026-2027' } },
  { $group: { _id: { classId: '$classId', day: '$day', pn: '$periodNumber' }, n: { $sum: 1 } } },
  { $group: { _id: '$_id.classId', slots: { $sum: 1 }, dupes: { $sum: { $cond: [{ $gt: ['$n', 1] }, 1, 0] } } } },
]).forEach(function (x) {
  print('  class ' + x._id + ' slots=' + x.slots + ' dupes=' + x.dupes);
});
