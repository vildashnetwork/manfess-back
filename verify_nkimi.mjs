// Quick verify via fetch
const controller = new AbortController();
const timeoutId = setTimeout(() => controller.abort(), 10000);

let data = [];
try {
  const res = await fetch('https://manfess-back.onrender.com/api/timetable?teacherId=6a97b0d9ac4ccdf7ea024cb3&academicYear=2026-2027', { signal: controller.signal });
  const r = await res.json();
  data = r.data || [];
} catch (e) {
  console.log('API error:', e.message);
} finally {
  clearTimeout(timeoutId);
}

console.log('NKIMI TOTAL:', data.length);


console.log('NKIMI TOTAL:', data.length);
const byDay = {};
data.forEach(e => {
  if (!byDay[e.day]) byDay[e.day] = [];
  byDay[e.day].push(e);
});
for (const day of ['Monday','Tuesday','Wednesday','Thursday','Friday']) {
  if (byDay[day]) {
    console.log(day + ':', byDay[day].length, 'entries');
    byDay[day].sort((a,b) => a.periodNumber - b.periodNumber).forEach(e => {
      console.log('  P' + e.periodNumber + ' ' + e.startTime + ' ' + e.subjectName + ' ' + (e.classId?.className || e.className));
    });
  }
}
