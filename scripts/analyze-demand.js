// Temporary Atlas demand analysis
const dayOrder = { Monday: 1, Tuesday: 2, Wednesday: 3, Thursday: 4, Friday: 5, Saturday: 6 };
const settings = db.schoolsettings.findOne({ academicYear: '2026-2027' });
const days = settings.schoolDays || [];
const ppd = settings.periodsPerDay || 6;
const slotsPerClass = days.length * ppd;
print('days=[' + days.join(',') + '] ppd=' + ppd + ' slotsPerClass=' + slotsPerClass);

const classes = db.schoolclasses.find({ isActive: true }).toArray();
const subjects = db.subjects.find({}).toArray();
const teachers = db.users.find({ role: 'teacher' }).toArray();

print('--- TEACHER DOCS (incl inactive) ---');
teachers.forEach(function (t) {
  print(t.name + ' | role=' + t.role + ' | isActive=' + t.isActive + ' | perm=' + t.isPermanent +
    ' | days=[' + (t.availableDays || []).join(',') + '] | subjects=[' + (t.subjectIds || []).join(',') + ']' +
    ' | classes=[' + (t.classIds || []).join(',') + '] | _id=' + t._id);
});

const periodsFor = function (subj, classId) {
  const raw = subj.periodsByClass || {};
  const v = raw instanceof Object && raw.get ? raw.get(String(classId)) : raw[String(classId)];
  const n = Number(v);
  if (Number.isFinite(n) && n >= 1) return Math.min(20, Math.floor(n));
  const f = Number(subj.periodsPerWeek);
  if (Number.isFinite(f) && f >= 1) return Math.min(20, Math.floor(f));
  return 4;
};

print('--- PER-CLASS DEMAND vs ' + slotsPerClass + ' slots ---');
let totalDemand = 0;
classes.forEach(function (cls) {
  const cid = String(cls._id);
  let demand = 0;
  const lines = [];
  subjects.forEach(function (s) {
    const ids = (s.classIds || []).map(String);
    if (ids.includes(cid)) {
      const p = periodsFor(s, cid);
      demand += p;
      lines.push(s.name + ':' + p);
    }
  });
  totalDemand += demand;
  print(cls.className + ' ' + cls.department + ' ' + cls.section + ' [' + cid + '] demand=' + demand +
    (demand > slotsPerClass ? '  *** OVER CAPACITY ***' : '') + '  {' + lines.join(', ') + '}');
});
print('TOTAL DEMAND=' + totalDemand);
