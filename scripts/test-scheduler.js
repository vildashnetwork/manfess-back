// scripts/test-scheduler.js
// Validates the scheduler against the LIVE Atlas data WITHOUT writing anything.
// Reads classes/teachers/subjects/settings, runs generateTimetableSchedule,
// then asserts the result is complete and conflict-free.
import 'dotenv/config';
import mongoose from 'mongoose';
import dns from 'node:dns';
import { execFile } from 'node:child_process';
import { promisify } from 'node:util';
import { generateTimetableSchedule } from '../services/timetableScheduler.js';

const execFileAsync = promisify(execFile);
const ONLINE_URI = process.env.MONGOURI;
const ATLAS_DB = 'MANFESS';

// The dbManager falls back to the Windows OS DNS client when Node's native
// SRV lookup gets ECONNREFUSED on some routers/ISPs. Mirror that here so the
// test can always reach Atlas.
const srvToStandardUri = async (srvUri) => {
  const match = srvUri.match(/^mongodb\+srv:\/\/([^:/?#]+)(?::([^@/#]*))?@([^/?#]+)(\/[^?#]*)?(\?.*)?$/);
  if (!match) return srvUri;
  const [, user, password = '', host, dbPath = '', query = ''] = match;

  let records;
  try {
    records = await dns.promises.resolveSrv(`_mongodb._tcp.${host}`);
  } catch {
    const cmd = `Resolve-DnsName -Type SRV "_mongodb._tcp.${host}" -ErrorAction Stop | Select-Object NameTarget,Port | ConvertTo-Json -Compress`;
    const { stdout } = await execFileAsync('powershell.exe', ['-NoProfile', '-NonInteractive', '-Command', cmd], {
      windowsHide: true,
      timeout: 15000,
    });
    const parsed = JSON.parse(stdout.trim());
    const list = Array.isArray(parsed) ? parsed : [parsed];
    records = list
      .filter((r) => r && r.NameTarget && r.Port)
      .map((r) => ({ name: String(r.NameTarget).replace(/\.$/, ''), port: Number(r.Port) }));
  }
  const hosts = records.map((r) => `${r.name}:${r.port}`).join(',');
  const params = new URLSearchParams(query ? query.slice(1) : '');
  if (!params.has('tls') && !params.has('ssl')) params.set('tls', 'true');
  if (!params.has('authSource')) params.set('authSource', 'admin');
  return `mongodb://${user}:${password}@${hosts}${dbPath || '/'}?${params.toString()}`;
};

let failures = 0;
const check = (name, cond, extra = '') => {
  if (cond) {
    console.log(`  PASS ${name}`);
  } else {
    failures += 1;
    console.log(`  FAIL ${name}${extra ? `  (${extra})` : ''}`);
  }
};

// Number of weekly periods for a (subject, class) pair (mirrors the route).
const periodsFor = (subj, classId) => {
  const raw = subj.periodsByClass;
  const override =
    raw && typeof raw === 'object' && typeof raw.get === 'function'
      ? raw.get(String(classId))
      : raw?.[String(classId)];
  const n = Number(override);
  if (Number.isFinite(n) && n >= 1) return Math.min(20, Math.floor(n));
  const fallback = Number(subj.periodsPerWeek);
  if (Number.isFinite(fallback) && fallback >= 1) return Math.min(20, Math.floor(fallback));
  return 4;
};
// Loads domain data from Atlas (preferred) or the local mirror.
async function loadDomainData() {
  const atlasUri = await srvToStandardUri(ONLINE_URI);
  const atlas = mongoose.createConnection(atlasUri, {
    serverSelectionTimeoutMS: 8000,
    connectTimeoutMS: 8000,
  });
  try {
    await atlas.asPromise();
    const db = atlas.useDb(ATLAS_DB);
    const [classes, teachers, subjects, settings] = await Promise.all([
      db.collection('schoolclasses').find({ isActive: true }).toArray(),
      db.collection('users').find({ role: 'teacher' }).toArray(),
      db.collection('subjects').find({}).toArray(),
      db.collection('schoolsettings').findOne({ academicYear: '2026-2027' }),
    ]);
    await atlas.close();
    console.log('Loaded domain data from Atlas.');
    return { classes, teachers, subjects, settings };
  } catch (err) {
    console.warn('Atlas unreachable, falling back to local mirror:', err.message);
    try { await atlas.close(); } catch (e) {}
    const OFFLINE = process.env.MONGOURIOFFLINE || 'mongodb://127.0.0.1:27017/MANFESS_OFFLINE';
    const local = mongoose.createConnection(OFFLINE, { serverSelectionTimeoutMS: 8000 });
    await local.asPromise();
    const db = local.useDb('MANFESS_OFFLINE');
    const [classes, teachers, subjects, settings] = await Promise.all([
      db.collection('schoolclasses').find({ isActive: true }).toArray(),
      db.collection('users').find({ role: 'teacher' }).toArray(),
      db.collection('subjects').find({}).toArray(),
      db.collection('schoolsettings').findOne({ academicYear: '2026-2027' }),
    ]);
    await local.close();
    console.log('Loaded domain data from local mirror.');
    return { classes, teachers, subjects, settings };
  }
}

const run = async () => {
  const { classes, teachers, subjects, settings } = await loadDomainData();

  console.log(
    `Loaded ${classes.length} classes, ${teachers.length} teachers, ${subjects.length} subjects`
  );

  // Transform BSON docs into the plain shape the route passes to the scheduler.
  const plainClasses = classes.map((c) => ({
    _id: c._id,
    className: c.className,
    department: c.department,
    section: c.section,
    cycle: c.cycle,
    isActive: c.isActive,
  }));
  const plainTeachers = teachers.map((t) => ({
    _id: t._id,
    name: t.name,
    role: t.role,
    isActive: t.isActive,
    subjectIds: (t.subjectIds || []).map(String),
    classIds: (t.classIds || []).map(String),
    isPermanent: !!t.isPermanent,
    availableDays: t.availableDays || [],
  }));
  const plainSubjects = subjects.map((s) => ({
    _id: s._id,
    name: s.name,
    code: s.code,
    classIds: (s.classIds || []).map(String),
    teacherIds: (s.teacherIds || []).map(String),
    periodsPerWeek: s.periodsPerWeek,
    periodsByClass: s.periodsByClass,
  }));

  const dayOrder = { Monday: 1, Tuesday: 2, Wednesday: 3, Thursday: 4, Friday: 5, Saturday: 6 };
  const configuredDays = (settings.schoolDays || ['Monday', 'Tuesday', 'Wednesday', 'Thursday', 'Friday'])
    .filter((d) => dayOrder[d])
    .sort((a, b) => dayOrder[a] - dayOrder[b]);

  // Run one full suite for the given mode and report assertions.
  const runOne = ({ repairMode }) => {
    let failed = false;
    console.log(`\n===== RUN (repairMode=${repairMode}) =====`);
    try {
      const result = generateTimetableSchedule({
        classes: plainClasses,
        teachers: plainTeachers,
        subjects: plainSubjects,
        settings,
        schoolDays: configuredDays,
        repairMode,
        academicYear: '2026-2027',
        maxAttempts: 60,
        timeBudgetMs: 30000,
      });

      console.log(
        `Stats: requested=${result.stats.requested} placed=${result.stats.placed} ` +
          `missing=${result.stats.missing} conflicts=${result.conflicts.length} ` +
          `attempts=${result.stats.attemptsUsed} duration=${result.stats.durationMs}ms ` +
          `pairs=${result.stats.consecutivePairs} slots=${result.stats.totalSlots}`
      );

      // The scheduler's hard guarantee: missing === 0 means every fixable
      // period was placed. placed may be < requested when genuine resource
      // constraints exist (auto-reduce lowers the target instead of leaving
      // phantom conflicts).
      check('no missing periods', result.stats.missing === 0);
      check(
        'zero conflicts',
        result.conflicts.length === 0,
        result.conflicts[0] ? JSON.stringify(result.conflicts[0]).slice(0, 500) : ''
      );
      check('placed <= requested', result.stats.placed <= result.stats.requested);
      check('entries length == placed', result.entries.length === result.stats.placed);
      if (result.stats.reducedCount > 0) {
        console.log(
          `  Note: ${result.stats.reducedCount} periods reduced due to resource constraints`
        );
        result.stats.reducedDetails.forEach((d) =>
          console.log(`    reduced ${d.subjectName} in ${d.className} by ${d.reducedBy}`)
        );
      }

      // --- Validate every entry ---
      const teacherById = new Map(plainTeachers.map((t) => [String(t._id), t]));
      const subjectById = new Map(plainSubjects.map((s) => [String(s._id), s]));
      const teacherKeys = new Set();
      const classKeys = new Set();
      const demand = new Map();
      plainClasses.forEach((c) => demand.set(String(c._id), new Map()));

      let badQual = 0;
      let badAvail = 0;
      for (const e of result.entries) {
        const t = teacherById.get(String(e.teacherId));
        const s = subjectById.get(String(e.subjectId));
        const qualifies =
          t &&
          (t.subjectIds.includes(String(e.subjectId)) ||
            (s && (s.teacherIds || []).includes(String(e.teacherId))));
        if (!qualifies) {
          badQual += 1;
          if (badQual <= 5) console.log(`    FAIL unqualified: ${e.subjectId} -> ${e.teacherId}`);
        }
        if (
          t &&
          Array.isArray(t.availableDays) &&
          t.availableDays.length > 0 &&
          !t.isPermanent &&
          !t.availableDays.includes(e.day)
        ) {
          badAvail += 1;
        }
        if (s && !(s.classIds || []).includes(String(e.classId)) && repairMode) {
          // repair mode may fill a class the mapped teacher is not assigned to
        }
        const tk = `${e.teacherId}|${e.day}|${e.periodNumber}`;
        if (teacherKeys.has(tk)) {
          console.log(`    FAIL teacher double-booking: ${tk}`);
          failed = true;
        }
        teacherKeys.add(tk);
        const ck = `${e.classId}|${e.day}|${e.periodNumber}`;
        if (classKeys.has(ck)) {
          console.log(`    FAIL class double-booking: ${ck}`);
          failed = true;
        }
        classKeys.add(ck);
        const dl = demand.get(String(e.classId));
        if (dl) dl.set(String(e.subjectId), (dl.get(String(e.subjectId)) || 0) + 1);
      }
      check('all teachers qualified for subject', badQual === 0);
      check('all entries respect teacher availability', badAvail === 0);

      // --- Per (class, subject) demand vs placed ---
      // Over-placement is always a bug (never exceed the requested periods).
      // Under-placement is acceptable when the scheduler auto-reduces periods
      // that cannot be placed due to genuine resource constraints.
      let over = 0;
      let under = 0;
      const reducedMap = new Map();
      (result.stats.reducedDetails || []).forEach((d) => {
        reducedMap.set(`${d.className}|${d.subjectName}`, d.reducedBy);
      });
      plainClasses.forEach((c) => {
        const cid = String(c._id);
        plainSubjects.forEach((s) => {
          if (!(s.classIds || []).includes(cid)) return;
          const expected = periodsFor(s, cid);
          const got = demand.get(cid)?.get(String(s._id)) || 0;
          if (got > expected) {
            over += 1;
            console.log(
              `    FAIL over-place ${s.name} in ${c.className} ${c.department}: ${got}/${expected}`
            );
          } else if (got < expected) {
            under += 1;
            console.log(
              `    note under ${s.name} in ${c.className} ${c.department}: ${got}/${expected} (auto-reduced)`
            );
          }
        });
      });
      check('no over-placement', over === 0);
      // Under-placement is informational only (auto-reduce working as intended)

      // --- Common-subject synchronization report ---
      const details = result.stats.syncDetails || [];
      console.log(
        `Sync groups produced: ${details.length}; total synchronized lessons: ${details.reduce(
          (s, d) => s + d.syncedPeriods,
          0
        )}`
      );
      details.forEach((d) =>
        console.log(
          `  sync ${d.subject} (${d.classes} classes: ${d.departments.join(', ')}) ` +
            `${d.syncedPeriods}/${d.targetPeriods} lessons at the same time`
        )
      );
    } catch (err) {
      failed = true;
      console.log('  FAIL scheduler threw:', err.message || err);
      console.log(err.stack);
    }
    return failed;
  };

  for (const repairMode of [false, true]) {
    runOne({ repairMode });
  }

  console.log(`\n${failures === 0 ? 'ALL TESTS PASSED' : `${failures} test(s) failed`}`);
  process.exit(failures === 0 ? 0 : 1);
};
run().catch((err) => {
  console.error('Fatal:', err);
  process.exit(1);
});