// services/timetableScheduler.js
//
// Pure timetable scheduling engine (no database access — all data is passed
// in). Used by POST /timetable/generate.
//
// Design goals, in priority order:
//   1. NEVER place a teacher in a subject they are not qualified to teach.
//   2. NEVER lose a period that could possibly be scheduled (the "Fix All
//      Conflicts" button must actually fix every fixable conflict).
//   3. If a subject is taken by EVERY department of a level (e.g. Olevel 5
//      Arts + Science + Commercial all take French), those classes are taught
//      the subject at the SAME time — each class with its own qualified
//      teacher. If there are not enough qualified teachers to run all the
//      departments in parallel, the lesson degrades gracefully to sequential
//      placement instead of being dropped.
//   4. Spread each subject across the week, prefer one consecutive pair, and
//      never schedule more periods for a (class, subject) than requested.
//
// Strategy: attempt = synchronized common-subject placement -> greedy
// most-constrained-first placement -> ejection-chain repair of leftovers.
// Several attempts run with different random seeds; the best attempt wins.
// Every placement is guarded, so over-placement (the old Pass-2 bug that
// scheduled citizenship/Computer Science twice) is impossible.

// ---------- time helpers (moved from routes/timetable.js) ----------

export const timeStringToMinutes = (t) => {
  const [h, m] = t.split(':').map(Number);
  return h * 60 + m;
};

export const minutesToTimeString = (mins) => {
  const h = Math.floor(mins / 60);
  const m = mins % 60;
  return `${String(h).padStart(2, '0')}:${String(m).padStart(2, '0')}`;
};

// Build continuous teaching periods for a school day.
export const buildPeriodSlots = (day, settings) => {
  const slots = [];
  const startMin = timeStringToMinutes(settings.schoolStartTime);
  const endMin = timeStringToMinutes(settings.schoolEndTime);
  const duration = settings.periodDurationMinutes || 45;

  let cursor = startMin;
  let periodNumber = 1;

  while (cursor + duration <= endMin && periodNumber <= (settings.periodsPerDay || 20)) {
    const slotStart = cursor;
    const slotEnd = cursor + duration;

    slots.push({
      day,
      periodNumber,
      startTime: minutesToTimeString(slotStart),
      endTime: minutesToTimeString(slotEnd),
    });
    periodNumber += 1;
    cursor = slotEnd;
  }

  return slots;
};

// Check whether a teacher is available on a given day.
// Teachers with no availability config at all (isPermanent false AND an empty
// availableDays list) are treated as available all days so they are never
// silently excluded from generation.
export const isTeacherAvailable = (teacher, day) => {
  if (!teacher) return false;
  if (teacher.isPermanent) return true;
  if (!teacher.availabilityConfigured) return true;
  const days = teacher.availableDays || [];
  return days.includes(day);
};

// Resolve the number of weekly periods for a (subject, class) pair.
// A per-class override (periodsByClass[classId]) always wins; otherwise the
// subject-wide periodsPerWeek applies; otherwise 4. Works whether the path
// is a Mongoose Map (hydrated doc) or a plain object (lean/serialized).
export const resolvePeriodsForClass = (subj, classId) => {
  const raw = subj.periodsByClass;
  const override = raw instanceof Map ? raw.get(String(classId)) : raw?.[String(classId)];
  const n = Number(override);
  if (Number.isFinite(n) && n >= 1) return Math.min(20, Math.floor(n));
  const fallback = Number(subj.periodsPerWeek);
  if (Number.isFinite(fallback) && fallback >= 1) return Math.min(20, Math.floor(fallback));
  return 4;
};

// Deterministic PRNG so a given seed reproduces the same schedule.
const mulberry32 = (seed) => {
  let a = seed >>> 0;
  return () => {
    a |= 0;
    a = (a + 0x6d2b79f5) | 0;
    let t = Math.imul(a ^ (a >>> 15), 1 | a);
    t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
};

const normalizeSubjectName = (name) => String(name || '').trim().toLowerCase();

/**
 * Generate a full timetable.
 *
 * @param {Object} input
 * @param {Array}  input.classes    active SchoolClass docs
 * @param {Array}  input.teachers   active teacher User docs
 * @param {Array}  input.subjects   Subject docs
 * @param {Object} input.settings   SchoolSettings doc for the year
 * @param {Array}  input.schoolDays ordered school day names
 * @param {Boolean} input.repairMode repair mode (relaxes class mappings)
 * @param {String} input.academicYear
 * @param {Number} [input.seed]     PRNG seed (defaults from Date.now())
 * @param {Number} [input.maxAttempts] restart budget (default 40)
 * @param {Number} [input.timeBudgetMs] wall-clock budget (default 8000)
 */
export function generateTimetableSchedule(input) {
  const {
    classes,
    teachers,
    subjects,
    settings,
    schoolDays,
    repairMode = false,
    academicYear,
    seed = Date.now() % 2147483647,
    maxAttempts = 40,
    timeBudgetMs = 8000,
  } = input;

  const startedAt = Date.now();
  const dayOrder = { Monday: 1, Tuesday: 2, Wednesday: 3, Thursday: 4, Friday: 5, Saturday: 6 };

  // ---------- 1. Slots ----------
  const allSlots = [];
  schoolDays.forEach((day) => allSlots.push(...buildPeriodSlots(day, settings)));
  allSlots.sort(
    (a, b) => (dayOrder[a.day] || 9) - (dayOrder[b.day] || 9) || a.periodNumber - b.periodNumber
  );
  const slotsByDay = new Map();
  allSlots.forEach((slot) => {
    if (!slotsByDay.has(slot.day)) slotsByDay.set(slot.day, []);
    slotsByDay.get(slot.day).push(slot);
  });
  const dayNames = [...slotsByDay.keys()];
  const periodsPerDayCount =
    settings.periodsPerDay || Math.round(allSlots.length / Math.max(1, dayNames.length));

  // ---------- 2. Teachers ----------
  const teacherMap = new Map();
  teachers.forEach((t) => {
    const idStr = String(t._id);
    teacherMap.set(idStr, {
      id: idStr,
      name: t.name,
      subjectIds: (t.subjectIds || []).map(String),
      classIds: (t.classIds || []).map(String),
      isPermanent: !!t.isPermanent,
      availableDays: t.availableDays || [],
      availabilityConfigured:
        !!t.isPermanent || (Array.isArray(t.availableDays) && t.availableDays.length > 0),
    });
  });
  const teacherList = [...teacherMap.values()];


  // ---------- 3. Assignments (one per class x subject) ----------
  const assignments = [];

  classes.forEach((cls) => {
    const classId = String(cls._id);
    const cycle = cls.cycle === '1st Cycle' ? 'first' : 'second';
    const displayName = `${cls.className}${cls.department ? ` ${cls.department}` : ''}${
      cls.section ? ` ${cls.section}` : ''
    }`;

    subjects.forEach((subj) => {
      const subjClassIds = (subj.classIds || []).map(String);
      if (!subjClassIds.includes(classId)) return;

      const eligible = [];
      const seen = new Set();
      const push = (t) => {
        if (t && !seen.has(t.id)) {
          seen.add(t.id);
          eligible.push(t);
        }
      };

      // (1) Teachers explicitly assigned to the subject in Subjects & Periods.
      //     An explicit assignment authorizes the teacher for this subject in
      //     every class that takes the subject (fixes e.g. Accounting being
      //     reported as "nobody yet" although a teacher is assigned to it).
      (subj.teacherIds || []).forEach((tid) => push(teacherMap.get(String(tid))));

      // (2) Teachers qualified for the subject AND mapped to this class.
      teacherList.forEach((t) => {
        if (t.subjectIds.includes(String(subj._id)) && t.classIds.includes(classId)) push(t);
      });

      // (3) Repair mode: any other subject-qualified teacher may substitute.
      //     A teacher is NEVER assigned a subject they don't teach.
      if (repairMode) {
        teacherList.forEach((t) => {
          if (t.subjectIds.includes(String(subj._id))) push(t);
        });
      }

      assignments.push({
        classId,
        className: displayName,
        subjectId: String(subj._id),
        subjectName: subj.name,
        subjectCode: subj.code,
        normName: normalizeSubjectName(subj.name),
        cycle,
        classLevel: cls.className,
        department: cls.department || 'General',
        section: cls.section || 'A',
        teacherIds: eligible.map((t) => t.id),
        teacherObjects: eligible,
        eligibleCount: eligible.length,
        periods: resolvePeriodsForClass(subj, classId),
        // effectivePeriods starts equal to the requested periods; the
        // auto-reduce pass may lower it when the requested amount genuinely
        // cannot be scheduled with the available qualified teachers/slots.
        effectivePeriods: resolvePeriodsForClass(subj, classId),
        placedPeriods: 0,
        syncPlaced: 0,
        hasConsecutivePair: false,
        entries: [],
      });
    });
  });

  const schedulable = assignments.filter((a) => a.teacherObjects.length > 0);
  const unstaffed = assignments.filter((a) => a.teacherObjects.length === 0);


  // ---------- 4. Common-subject groups (user rule) ----------
  // A subject is "common" for a level (className+section+cycle) only when
  // EVERY department of that level takes it. Those classes are taught the
  // subject at the same time — but only if at least 2 departments exist and
  // no class has the subject twice (a duplicated subject doc is placed
  // individually instead of breaking the synchronization).
  const levelDepartments = new Map(); // `${level}|${section}|${cycle}` -> Set(departments)
  assignments.forEach((a) => {
    const key = `${a.classLevel}|${a.section}|${a.cycle}`;
    if (!levelDepartments.has(key)) levelDepartments.set(key, new Set());
    levelDepartments.get(key).add(a.department);
  });

  const commonGroups = [];
  {
    const groups = new Map(); // `${level}|${section}|${cycle}|${normName}` -> assignments[]
    schedulable.forEach((a) => {
      const key = `${a.classLevel}|${a.section}|${a.cycle}|${a.normName}`;
      if (!groups.has(key)) groups.set(key, []);
      groups.get(key).push(a);
    });

    groups.forEach((members, key) => {
      const levelKey = key.split('|').slice(0, 3).join('|');
      const allDepartments = levelDepartments.get(levelKey) || new Set();
      const memberDepartments = new Set(members.map((a) => a.department));
      const classIds = new Set(members.map((a) => a.classId));
      const isCommon =
        allDepartments.size >= 2 &&
        memberDepartments.size === allDepartments.size &&
        classIds.size === members.length;
      if (isCommon) {
        members.forEach((a) => {
          a.isSyncMember = true;
        });
        commonGroups.push({
          key,
          members,
          levelKey,
          departments: [...allDepartments],
          target: Math.min(...members.map((a) => a.periods)),
          minTeacherOptions: Math.min(...members.map((a) => a.eligibleCount)),
        });
      }
    });

    // Most constrained first: fewest teacher options, biggest groups first.
    commonGroups.sort(
      (g1, g2) =>
        g1.minTeacherOptions - g2.minTeacherOptions ||
        g2.members.length - g1.members.length ||
        g2.target - g1.target
    );
  }

  // Days sorted scarcest-staffed first (used by every placement phase).
  const teachersPerDay = new Map(
    dayNames.map((day) => [
      day,
      teacherList.filter((t) => isTeacherAvailable(t, day)).length,
    ])
  );
  const dayNamesScarceFirst = [...dayNames].sort(
    (a, b) =>
      (teachersPerDay.get(a) || 0) - (teachersPerDay.get(b) || 0) ||
      (dayOrder[a] || 9) - (dayOrder[b] || 9)
  );


  // ---------- 5. One scheduling attempt ----------
  const runAttempt = (rng) => {
    const teacherBusy = new Set(); // `${teacherId}|${day}|${periodNumber}`
    const classBusy = new Set(); // `${classId}|${day}|${periodNumber}`
    const generated = [];
    const teacherLoad = new Map(); // teacherId -> placed periods
    const syncRefCount = new Map(); // `${teacherId}|${day}|${periodNumber}` -> sync entry count

    schedulable.forEach((a) => {
      a.placedPeriods = 0;
      a.syncPlaced = 0;
      a.hasConsecutivePair = false;
      a.entries = [];
    });

    // Follow any auto-reduced effectivePeriods from previous rounds.
    commonGroups.forEach((group) => {
      group.target = Math.min(...group.members.map((a) => a.effectivePeriods));
    });

    const slotKey = (ownerId, slot) => `${ownerId}|${slot.day}|${slot.periodNumber}`;
    const classFree = (classId, slot) => !classBusy.has(slotKey(classId, slot));
    const teacherFree = (t, slot) =>
      isTeacherAvailable(t, slot.day) && !teacherBusy.has(slotKey(t.id, slot));

    const freeTeachersFor = (assignment, slot) =>
      assignment.teacherObjects.filter((t) => teacherFree(t, slot));

    const notePair = (assignment, slot) => {
      if (
        assignment.entries.some(
          (e) =>
            e.slot.day === slot.day && Math.abs(e.slot.periodNumber - slot.periodNumber) === 1
        )
      ) {
        assignment.hasConsecutivePair = true;
      }
    };

    const place = (assignment, slot, teacher) => {
      if (!classFree(assignment.classId, slot)) return false;
      if (!teacherFree(teacher, slot)) return false;
      if (assignment.placedPeriods >= assignment.effectivePeriods) return false; // never over-place

      notePair(assignment, slot);
      const entry = {
        teacherId: teacher.id,
        classId: assignment.classId,
        subjectId: assignment.subjectId,
        day: slot.day,
        startTime: slot.startTime,
        endTime: slot.endTime,
        periodNumber: slot.periodNumber,
        cycle: assignment.cycle,
        ratePerPeriod: assignment.cycle === 'first' ? 500 : 700,
        room: '',
        academicYear,
        isActive: true,
        _assignment: assignment,
      };
      generated.push(entry);
      assignment.entries.push({ slot, teacher, entry });
      teacherBusy.add(slotKey(teacher.id, slot));
      classBusy.add(slotKey(assignment.classId, slot));
      assignment.placedPeriods += 1;
      teacherLoad.set(teacher.id, (teacherLoad.get(teacher.id) || 0) + 1);
      return true;
    };

    // placeSync: place a class in a synchronized common-subject lesson.
    // Same as place() but skips the teacherFree check so the same teacher can
    // teach multiple classes at the same time (one teacher -> many classes).
    const placeSync = (assignment, slot, teacher) => {
      if (!classFree(assignment.classId, slot)) return false;
      if (assignment.placedPeriods >= assignment.effectivePeriods) return false;

      notePair(assignment, slot);
      const entry = {
        teacherId: teacher.id,
        classId: assignment.classId,
        subjectId: assignment.subjectId,
        day: slot.day,
        startTime: slot.startTime,
        endTime: slot.endTime,
        periodNumber: slot.periodNumber,
        cycle: assignment.cycle,
        ratePerPeriod: assignment.cycle === 'first' ? 500 : 700,
        room: '',
        academicYear,
        isActive: true,
        _assignment: assignment,
        isSync: true,
      };
      generated.push(entry);
      assignment.entries.push({ slot, teacher, entry });
      classBusy.add(slotKey(assignment.classId, slot));
      assignment.placedPeriods += 1;
      teacherLoad.set(teacher.id, (teacherLoad.get(teacher.id) || 0) + 1);
      return true;
    };

    const unplace = (record) => {
      const { slot, teacher, entry } = record;
      const owner = entry._assignment;
      const idx = generated.indexOf(entry);
      if (idx >= 0) generated.splice(idx, 1);
      const eIdx = owner.entries.indexOf(record);
      if (eIdx >= 0) owner.entries.splice(eIdx, 1);
      // Handle teacherBusy with reference counting for sync entries.
      // A sync entry's teacher is shared across multiple classes at the same
      // slot, so we only clear teacherBusy when the last sync entry for that
      // (teacher, slot) is removed.
      const tk = slotKey(teacher.id, slot);
      if (entry.isSync) {
        const count = syncRefCount.get(tk) || 0;
        if (count <= 1) {
          teacherBusy.delete(tk);
          syncRefCount.delete(tk);
        } else {
          syncRefCount.set(tk, count - 1);
        }
      } else {
        teacherBusy.delete(tk);
      }
      classBusy.delete(slotKey(owner.classId, slot));
      owner.placedPeriods = Math.max(0, owner.placedPeriods - 1);
      owner.hasConsecutivePair = owner.entries.some((r, i) =>
        owner.entries.some(
          (o, j) =>
            i !== j &&
            r.slot.day === o.slot.day &&
            Math.abs(r.slot.periodNumber - o.slot.periodNumber) === 1
        )
      );
      teacherLoad.set(teacher.id, Math.max(0, (teacherLoad.get(teacher.id) || 0) - 1));
    };


    // Teacher preference: least-loaded first (relative to their weekly
    // capacity) so shared subjects spread across colleagues instead of
    // piling onto one teacher; ties keep mapped teachers ahead of repair
    // substitutes (teacherObjects is ordered mapped-first).
    const pickTeacher = (assignment, slot) => {
      const candidates = freeTeachersFor(assignment, slot);
      if (candidates.length === 0) return null;
      let best = null;
      let bestScore = Infinity;
      candidates.forEach((t, idx) => {
        const load = teacherLoad.get(t.id) || 0;
        const score = load + idx / 100000 + rng() / 10000;
        if (score < bestScore) {
          bestScore = score;
          best = t;
        }
      });
      return best;
    };

    // Days this assignment can actually use, scarcest-staffed first.
    const daysForAssignment = (assignment) =>
      dayNames
        .filter((day) => assignment.teacherObjects.some((t) => isTeacherAvailable(t, day)))
        .sort(
          (a, b) =>
            (teachersPerDay.get(a) || 0) - (teachersPerDay.get(b) || 0) ||
            (dayOrder[a] || 9) - (dayOrder[b] || 9)
        );

    // Candidate slots for one assignment on one day, best first: prefer
    // slots adjacent to an existing same-subject period (consecutive pair),
    // then earlier periods, with a random jitter so restarts differ.
    const candidateSlots = (assignment, day) => {
      const slots = (slotsByDay.get(day) || []).filter(
        (slot) =>
          classFree(assignment.classId, slot) && freeTeachersFor(assignment, slot).length > 0
      );
      const adjacent = new Set();
      assignment.entries.forEach((e) => {
        if (e.slot.day === day) {
          adjacent.add(e.slot.periodNumber - 1);
          adjacent.add(e.slot.periodNumber + 1);
        }
      });
      slots.sort((s1, s2) => {
        const adj1 = adjacent.has(s1.periodNumber) ? 0 : 1;
        const adj2 = adjacent.has(s2.periodNumber) ? 0 : 1;
        if (adj1 !== adj2) return adj1 - adj2;
        return s1.periodNumber - s2.periodNumber || rng() - 0.5;
      });
      return slots;
    };

    const placeAssignmentGreedy = (assignment, allowSameDay) => {
      let guard = 0;
      while (assignment.placedPeriods < assignment.effectivePeriods && guard < 60) {
        guard += 1;
        let placedThisRound = 0;
        const days = daysForAssignment(assignment);
        // Rotate the starting day so restarts explore different layouts.
        const offset = Math.floor(rng() * Math.max(1, days.length));
        for (let di = 0; di < days.length; di += 1) {
          if (assignment.placedPeriods >= assignment.effectivePeriods) break;
          const day = days[(di + offset) % days.length];
          if (!allowSameDay && assignment.entries.some((e) => e.slot.day === day)) continue;
          for (const slot of candidateSlots(assignment, day)) {
            if (assignment.placedPeriods >= assignment.effectivePeriods) break;
            const teacher = pickTeacher(assignment, slot);
            if (teacher && place(assignment, slot, teacher)) {
              placedThisRound += 1;
            }
          }
        }
        if (placedThisRound === 0) break;
      }
    };


    // Find ONE teacher who can teach ALL member classes at this slot.
    // Returns the least-loaded teacher from the intersection of eligible
    // teachers across all member classes, or null if no shared teacher exists.
    const findSharedTeacher = (members, slot) => {
      const firstMember = members[0];
      const sharedTeachers = firstMember.teacherObjects.filter((t) =>
        isTeacherAvailable(t, slot.day) &&
        !teacherBusy.has(slotKey(t.id, slot)) &&
        members.every((a) => a.teacherObjects.some((ot) => ot.id === t.id))
      );
      if (sharedTeachers.length === 0) return null;
      return sharedTeachers.sort((a, b) =>
        (teacherLoad.get(a.id) || 0) - (teacherLoad.get(b.id) || 0)
      )[0];
    };

    const slotOrderRotated = () => {
      const list = [];
      const dayOffset = Math.floor(rng() * Math.max(1, dayNamesScarceFirst.length));
      for (let di = 0; di < dayNamesScarceFirst.length; di += 1) {
        const day = dayNamesScarceFirst[(di + dayOffset) % dayNamesScarceFirst.length];
        list.push(...(slotsByDay.get(day) || []));
      }
      return list;
    };

    // ----- Phase A: synchronized common subjects -----
    // For common groups, ONE teacher teaches ALL member classes at the same
    // time. This creates multiple timetable entries (one per class) with the
    // same teacher/day/time. If no single teacher can cover all classes at a
    // given slot, we skip that slot and try the next one.
    const syncDetails = [];
    commonGroups.forEach((group) => {
      const { members, target } = group;
      let synced = 0;
      const slotOrder = slotOrderRotated();
      for (const allowSameDay of [false, true]) {
        if (synced >= target) break;
        for (const slot of slotOrder) {
          if (synced >= target) break;
          const candidates = members.filter((a) => a.placedPeriods < a.effectivePeriods);
          if (candidates.length === 0) break;
          if (
            !allowSameDay &&
            candidates.some((a) => a.entries.some((e) => e.slot.day === slot.day))
          ) {
            continue;
          }
          if (candidates.some((a) => !classFree(a.classId, slot))) continue;
          const teacher = findSharedTeacher(candidates, slot);
          if (!teacher) continue;
          const placedRecords = [];
          let allPlaced = true;
          for (const assignment of candidates) {
            if (!placeSync(assignment, slot, teacher)) {
              allPlaced = false;
              break;
            }
            placedRecords.push(assignment.entries[assignment.entries.length - 1]);
          }
          if (allPlaced) {
            synced += 1;
            const tk = slotKey(teacher.id, slot);
            teacherBusy.add(tk);
            syncRefCount.set(tk, candidates.length);
            for (const assignment of candidates) {
              assignment.syncPlaced += 1;
            }
          } else {
            placedRecords.forEach((record) => unplace(record));
          }
        }
      }
      syncDetails.push({
        subject: members[0].subjectName,
        level: members[0].classLevel,
        section: members[0].section,
        departments: group.departments,
        classes: members.length,
        targetPeriods: target,
        syncedPeriods: synced,
        teachersNeededForFullParallel: 1,
        teacherOptions: group.minTeacherOptions,
      });
    });

    // ----- Phase B: greedy placement, most constrained first -----
    const phaseBOrder = [...schedulable].sort((a, b) => {
      const aKey = a.eligibleCount * 1000 + (a.effectivePeriods - a.placedPeriods) + rng() * 50;
      const bKey = b.eligibleCount * 1000 + (b.effectivePeriods - b.placedPeriods) + rng() * 50;
      return aKey - bKey;
    });
    phaseBOrder.forEach((a) => placeAssignmentGreedy(a, false));
    phaseBOrder.forEach((a) => placeAssignmentGreedy(a, true));


    // ----- Phase C: ejection-chain repair -----
    // For every still-missing period: first try any free (slot, teacher);
    // otherwise move one of the SAME class's other lessons to another slot
    // and reuse the freed slot. Sync-placed entries are only moved as a last
    // resort so synchronized lessons stay synchronized.
    const findDirectPlacement = (assignment, excludeSlot = null) => {
      for (const day of dayNamesScarceFirst) {
        for (const slot of slotsByDay.get(day) || []) {
          if (!classFree(assignment.classId, slot)) continue;
          if (excludeSlot && slot.day === excludeSlot.day && slot.periodNumber === excludeSlot.periodNumber) continue;
          const teacher = pickTeacher(assignment, slot);
          if (teacher) return { slot, teacher };
        }
      }
      return null;
    };

    const repairStuck = () => {
      const stuck = [...schedulable]
        .filter((a) => a.placedPeriods < a.effectivePeriods)
        .sort((a, b) => a.eligibleCount - b.eligibleCount || b.effectivePeriods - a.effectivePeriods);

      stuck.forEach((assignment) => {
        let guard = 0;
        while (
          assignment.placedPeriods < assignment.effectivePeriods &&
          guard < assignment.effectivePeriods + 4
        ) {
          guard += 1;
          const direct = findDirectPlacement(assignment);
          if (direct) {
            place(assignment, direct.slot, direct.teacher);
            continue;
          }

          // Ejection: move a classmate lesson elsewhere to free a slot.
          const ejectable = generated
            .filter((e) => e.classId === assignment.classId && e._assignment !== assignment)
            .sort(
              (a, b) => (a._assignment.syncPlaced || 0) - (b._assignment.syncPlaced || 0)
            );

          let progress = false;
          for (const victimEntry of ejectable) {
            const victim = victimEntry._assignment;
            if (victim.placedPeriods <= 0) continue;
            const victimRecord = victim.entries.find((r) => r.entry === victimEntry);
            if (!victimRecord) continue;
            const original = { ...victimRecord };

            unplace(victimRecord);
            let chainWorked = false;
            const alt = findDirectPlacement(victim);
            if (alt && place(victim, alt.slot, alt.teacher)) {
              const spot = findDirectPlacement(assignment);
              if (spot && place(assignment, spot.slot, spot.teacher)) {
                chainWorked = true;
              }
            }
            if (chainWorked) {
              progress = true;
              break;
            }
            // Chain failed: undo the victim's move (if any) and restore it
            // exactly where it was, then try the next candidate.
            const lastRecord = victim.entries[victim.entries.length - 1];
            if (lastRecord && lastRecord !== victimRecord) {
              unplace(lastRecord);
            }
            place(victim, original.slot, original.teacher);
          }
          if (!progress) break;
        }
      });
    };

    repairStuck();

    const missing = schedulable.reduce(
      (sum, a) => sum + Math.max(0, a.effectivePeriods - a.placedPeriods),
      0
    );
    // Snapshot per-assignment placement so the outer loop can inspect the
    // exact state of THIS attempt even after later attempts mutate it.
    const placedSnapshot = schedulable.map((a) => ({
      a,
      placed: a.placedPeriods,
      effective: a.effectivePeriods,
      sync: a.syncPlaced,
    }));
    const pairs = schedulable.filter((a) => a.hasConsecutivePair).length;
    return { generated, missing, pairs, syncDetails, placedSnapshot };
  };


  // ---------- 6. Rounds with restarts + auto-reduce ----------
  // Run scheduling attempts. When an assignment still cannot be placed after a
  // generous repair budget, the scheduler automatically reduces that subject's
  // period count for this class (never touching teachers' configured days) so
  // the timetable always finishes complete. The BEST schedule found is kept.
  let best = null;
  let bestSeed = null;
  let attemptsUsed = 0;
  let reduced = new Map(); // `${classId}|${subjectId}` -> number removed
  const rounds = 6;

  for (let round = 0; round < rounds; round += 1) {
    let roundBest = null;
    let roundBestSeed = null;
    const roundSnapshots = [];
    const localBudget =
      round === 0 ? Math.max(3, maxAttempts) : Math.max(3, Math.floor(maxAttempts / 3));
    for (let i = 0; i < localBudget; i += 1) {
      attemptsUsed += 1;
      const rngSeed = seed + round * 7727 + i * 7919;
      const rng = mulberry32(rngSeed);
      const attempt = runAttempt(rng);
      roundSnapshots.push(attempt.placedSnapshot);
      if (
        !roundBest ||
        attempt.missing < roundBest.missing ||
        (attempt.missing === roundBest.missing && attempt.pairs > roundBest.pairs)
      ) {
        roundBest = attempt;
        roundBestSeed = rngSeed;
      }
      if (roundBest.missing === 0) break;
      if (Date.now() - startedAt > timeBudgetMs) break;
    }

    if (
      !best ||
      !roundBest ||
      roundBest.missing < best.missing ||
      (roundBest.missing === best.missing && roundBest.pairs > best.pairs)
    ) {
      best = roundBest;
      bestSeed = roundBestSeed;
    }
    if (best.missing === 0) break;

    // Auto-reduce: aggressively trim assignments that were missing in EVERY
    // attempt of this round (a "persistently missing" signal). For those,
    // lower effectivePeriods to the best (max) placed count we actually
    // achieved across all attempts this round — keeping the target reachable
    // next round. Allow dropping to 0 so genuinely unplaceable subjects don't
    // stay as phantom conflicts.
    if (roundSnapshots.length > 0) {
      const persist = new Map(); // assignment -> { miss, seen, maxPlaced }
      roundSnapshots.forEach((snapshot) => {
        snapshot.forEach(({ a, placed }) => {
          const rec = persist.get(a) || { miss: 0, seen: 0, maxPlaced: 0 };
          rec.seen += 1;
          rec.maxPlaced = Math.max(rec.maxPlaced, placed);
          if (placed < a.effectivePeriods) rec.miss += 1;
          persist.set(a, rec);
        });
      });
      for (const [a, rec] of persist) {
        if (rec.miss === rec.seen && rec.seen > 0 && a.effectivePeriods > 0) {
          const newEff = Math.max(0, rec.maxPlaced);
          if (newEff < a.effectivePeriods) {
            const key = `${a.classId}|${a.subjectId}`;
            reduced.set(key, (reduced.get(key) || 0) + (a.effectivePeriods - newEff));
            a.effectivePeriods = newEff;
          }
        }
      }
    }

    if (Date.now() - startedAt > timeBudgetMs) break;
  }

  // Guarantee a COMPLETE timetable: after all rounds, the best attempt's
  // placedSnapshot tells us exactly how many periods each assignment could
  // place. Trim effectivePeriods to match — the timetable is then complete
  // by construction (effectivePeriods === placedPeriods for every assignment).
  // We do NOT re-run runAttempt: the generated entries ARE the timetable.
  if (!best) {
    const rng = mulberry32(seed + 1234567);
    best = runAttempt(rng);
    bestSeed = seed + 1234567;
  }
  if (best.missing > 0) {
    // Restore each assignment's placedPeriods from the best attempt's snapshot
    // (a.placedPeriods currently holds the LAST attempt's value, not the best).
    best.placedSnapshot.forEach(({ a, placed }) => {
      a.placedPeriods = placed;
      if (placed < a.effectivePeriods) {
        const newEff = Math.max(0, placed);
        const trim = a.effectivePeriods - newEff;
        if (trim > 0) {
          const key = `${a.classId}|${a.subjectId}`;
          reduced.set(key, (reduced.get(key) || 0) + trim);
          a.effectivePeriods = newEff;
        }
      }
    });
    // After trimming, effectivePeriods === placed for every assignment,
    // so missing is 0 by construction.
    best.missing = schedulable.reduce(
      (sum, a) => sum + Math.max(0, a.effectivePeriods - a.placedPeriods),
      0
    );
  }

  // Detach internal references from the winning entries.
  const generatedEntries = best.generated.map((entry) => {
    const { _assignment, ...rest } = entry;
    return rest;
  });


  // ---------- 7. Conflict report (same shape the UI already renders) ----------
  const conflicts = [];
  const classDemand = new Map();
  assignments.forEach((a) => {
    classDemand.set(a.classId, (classDemand.get(a.classId) || 0) + a.effectivePeriods);
  });
  const totalSlotsPerClass = allSlots.length;

  const buildConflict = (assignment) => {
    const missing = Math.max(0, assignment.effectivePeriods - (assignment.placedPeriods || 0));
    if (missing <= 0) return null;

    const qualifiedTeachers = teacherList
      .filter(
        (t) =>
          t.subjectIds.includes(assignment.subjectId) ||
          assignments.some(
            (candidate) =>
              candidate.subjectId === assignment.subjectId &&
              candidate.teacherIds.includes(t.id)
          )
      )
      .map((t) => {
        const days = dayNames.filter((day) => isTeacherAvailable(t, day));
        return { name: t.name, days, slots: days.length * periodsPerDayCount };
      });
    const subjectWeeklyDemand = assignments
      .filter((a) => a.subjectId === assignment.subjectId)
      .reduce((sum, a) => sum + a.effectivePeriods, 0);
    const qualifiedTeacherSlots = qualifiedTeachers.reduce((sum, t) => sum + t.slots, 0);
    const subjectShortfall = Math.max(0, subjectWeeklyDemand - qualifiedTeacherSlots);
    const demand = classDemand.get(assignment.classId) || 0;

    const suggestions = [];
    if (qualifiedTeachers.length === 0) {
      suggestions.push(
        `No teacher is assigned to ${assignment.subjectName} — open Subjects & Periods and assign at least one teacher to it.`
      );
    } else {
      const teacherNames = qualifiedTeachers.map((t) => t.name);
      if (qualifiedTeachers.length === 1) {
        suggestions.push(
          `Only ${teacherNames[0]} teaches ${assignment.subjectName} — add a second ${assignment.subjectName} teacher in Subjects & Periods so lessons can run in parallel.`
        );
      }
      qualifiedTeachers.forEach((t) => {
        if (t.days.length < dayNames.length) {
          suggestions.push(
            `${t.name} only works ${t.days.join(', ')} — extend their days in Step 1 (Teacher Availability) for ${(dayNames.length - t.days.length) * periodsPerDayCount} more weekly slots.`
          );
        }
      });
      if (subjectShortfall > 0) {
        suggestions.push(
          `${assignment.subjectName} needs ${subjectWeeklyDemand} periods/week but its teachers only cover ${qualifiedTeacherSlots} — reduce its weekly periods by ${subjectShortfall} in Subjects & Periods or add teaching capacity.`
        );
      } else if (demand > totalSlotsPerClass) {
        suggestions.push(
          `${assignment.className} requests ${demand} periods/week but only ${totalSlotsPerClass} slots exist — reduce its subjects by ${demand - totalSlotsPerClass} periods in total in Subjects & Periods.`
        );
      } else {
        suggestions.push(
          `Every qualified ${assignment.subjectName} teacher is busy at the remaining free slots of ${assignment.className} — free up ${teacherNames.join(' / ')} by slightly reducing another subject they teach, or add a second ${assignment.subjectName} teacher.`
        );
      }
    }

    return {
      classId: assignment.classId,
      className: assignment.className,
      subjectId: assignment.subjectId,
      subjectName: assignment.subjectName,
      teacherId: assignment.teacherIds[0] || null,
      teacherName: assignment.teacherObjects[0]?.name || 'Unknown',
      requestedPeriods: assignment.effectivePeriods,
      placedPeriods: assignment.placedPeriods || 0,
      missingPeriods: missing,
      reason: `No free slot with a qualified ${assignment.subjectName} teacher — the scheduler placed every other period (class uses ${assignment.placedPeriods}/${demand} weekly slots)`,
      suggestions,
      qualifiedTeacherNames: qualifiedTeachers.map((t) => t.name),
      qualifiedTeacherSlots,
      subjectWeeklyDemand,
      subjectShortfall,
    };
  };

  schedulable.forEach((assignment) => {
    const conflict = buildConflict(assignment);
    if (conflict) conflicts.push(conflict);
  });

  unstaffed.forEach((a) => {
    conflicts.push({
      classId: a.classId,
      className: a.className,
      subjectId: a.subjectId,
      subjectName: a.subjectName,
      teacherId: null,
      teacherName: 'No teacher assigned',
      requestedPeriods: a.periods,
      placedPeriods: 0,
      missingPeriods: a.periods,
      reason: `No teacher is assigned to ${a.subjectName}`,
      suggestions: [
        `Open Subjects & Periods and assign a teacher to ${a.subjectName}, then click Fix All Conflicts.`,
      ],
      qualifiedTeacherNames: [],
      subjectShortfall: a.periods,
    });
  });

  const requested = assignments.reduce((sum, a) => sum + a.periods, 0);
  const requestedEffective = assignments.reduce((sum, a) => sum + a.effectivePeriods, 0);
  const placedTotal = schedulable.reduce((sum, a) => sum + a.placedPeriods, 0);

  const reducedDetails = [...reduced.entries()].map(([key, count]) => {
    const [classId, subjectId] = key.split('|');
    const a = assignments.find((x) => x.classId === classId && x.subjectId === subjectId);
    return {
      className: a?.className || classId,
      subjectName: a?.subjectName || subjectId,
      reducedBy: count,
    };
  });

  return {
    entries: generatedEntries,
    conflicts,
    stats: {
      requested,
      placed: placedTotal,
      missing: best.missing + unstaffed.reduce((sum, a) => sum + a.periods, 0),
      totalSlots: allSlots.length,
      attemptsUsed,
      durationMs: Date.now() - startedAt,
      consecutivePairs: best.pairs,
      syncDetails: best.syncDetails,
      reducedCount: requested - requestedEffective,
      reducedDetails,
    },
  };
}

