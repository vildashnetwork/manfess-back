// Fix Nkimi via API - remove Thu entries, keep/add Mon/Tue/Wed
const API = 'https://manfess-back.onrender.com/api/timetable';
const ACAD = '2026-2027';

async function fetchJSON(path, opts = {}) {
  const res = await fetch('https://manfess-back.onrender.com' + path, {
    timeout: 8000,
    ...opts,
    headers: { 'Content-Type': 'application/json', ...(opts.headers || {}) }
  });
  if (!res.ok) throw new Error(res.status + ' ' + await res.text());
  return res.json();
}

// 1. Delete all Nkimi Thursday entries
log('Fetching Nkimi entries...');
const nkimiRes = await fetchJSON('/api/timetable?teacherId=6a97b0d9ac4ccdf7ea024cb3&academicYear=' + ACAD);
const allEntries = nkimiRes.data;

// Delete Thursday entries
const thuEntries = allEntries.filter(e => e.day === 'Thursday');
log('Thursday entries to delete: ' + thuEntries.length);
for (const e of thuEntries) {
  try {
    await fetchJSON('/api/timetable/' + e._id, { method: 'DELETE' });
    log('Deleted Thu P' + e.periodNumber + ' ' + e.subjectName + ' ' + e.className);
  } catch(err) {
    log('Failed to delete ' + e._id + ': ' + err.message);
  }
}

// Check what Monday entries exist
const monEntries = allEntries.filter(e => e.day === 'Monday');
log('\nMonday entries (' + monEntries.length + '):');
monEntries.forEach(e => log('  P' + e.periodNumber + ' ' + e.subjectName + ' ' + e.className + ' - ' + (e.classId?.className || e.className)));

// Check what exists on Tues/Wed
const remaining = allEntries.filter(e => e.day !== 'Thursday');
const byDay = {};
remaining.forEach(e => { if (!byDay[e.day]) byDay[e.day] = []; byDay[e.day].push(e); });
for (const d of ['Monday','Tuesday','Wednesday']) {
  log('\n' + d + ' (' + (byDay[d]?.length || 0) + ' entries):');
  (byDay[d] || []).forEach(e => log('  P' + e.periodNumber + ' ' + e.subjectName + ' ' + e.className));
}

// Count by subject
const bySubj = {};
remaining.forEach(e => {
  if (!bySubj[e.subjectName]) bySubj[e.subjectName] = 0;
  bySubj[e.subjectName]++;
});
log('\nSubjects (' + remaining.length + ' total):');
Object.entries(bySubj).forEach(([k, v]) => log('  ' + k + ': ' + v));

// We need: 1 Comm OL5, 2 Econ OL5, 2 Econ OL4, 1 Econ OL3, 3 Econ AL = 5 types
const needed = {
  'Commerce': 1, 'Economics OL5': 2, 'Economics OL4': 2, 'Economics OL3': 1, 'Economics AL': 3
};
const actual = {
  'Commerce': 0, 'Economics OL5': 0, 'Economics OL4': 0, 'Economics OL3': 0, 'Economics AL': 0
};
remaining.forEach(e => {
  if (e.subjectName === 'Commerce') actual['Commerce']++;
  if (e.subjectName === 'Economics') {
    const cls = e.classId?.className || e.className;
    if (cls.includes('Alevel')) actual['Economics AL']++;
    else if (cls.includes('Olevel 5')) actual['Economics OL5']++;
    else if (cls.includes('Olevel 4')) actual['Economics OL4']++;
    else if (cls.includes('Olevel 3')) actual['Economics OL3']++;
  }
});
log('\nCoverage:');
for (const k of Object.keys(needed)) {
  log(k + ': ' + actual[k] + '/' + needed[k]);
}

function log(...args) { console.log(...args); }
