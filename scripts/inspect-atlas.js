// Temporary Atlas inspection script
print('ATLAS OK');
print('classes=' + db.schoolclasses.countDocuments({ isActive: true }));
print('subjects=' + db.subjects.countDocuments({}));
print('teachers=' + db.users.countDocuments({ role: 'teacher' }));
print('tt 2026-2027=' + db.timetables.countDocuments({ academicYear: '2026-2027' }));
db.schoolsettings.find({}, {}).forEach(function (s) {
  print('SETTINGS: year=' + s.academicYear + ' start=' + s.schoolStartTime + ' end=' + s.schoolEndTime +
    ' dur=' + s.periodDurationMinutes + ' ppd=' + s.periodsPerDay + ' days=[' + (s.schoolDays || []).join(',') + ']');
});
print('--- CLASSES ---');
db.schoolclasses.find({ isActive: true }).forEach(function (c) {
  print(c.className + ' | ' + c.department + ' | ' + c.section + ' | ' + c.cycle + ' | ' + c._id);
});
print('--- ACCOUNTING SUBJECT ---');
db.subjects.find({ name: /accounting/i }).forEach(function (s) {
  print(s.name + ' (' + s.code + ') teachers=[' + (s.teacherIds || []).join(',') + '] classes=[' + (s.classIds || []).join(',') + ']');
});
