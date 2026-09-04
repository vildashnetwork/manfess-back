// scripts/rewrite-timetable-route.js
// One-off surgery helper: replace the old inline generation logic in
// routes/timetable.js with the fragment in scripts/timetable-generate-section.txt
// and add the import from services/timetableScheduler.js.
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const root = path.resolve(__dirname, '..');
const routePath = path.join(root, 'routes', 'timetable.js');
const fragmentPath = path.join(root, 'scripts', 'timetable-generate-section.txt');

const source = fs.readFileSync(routePath, 'utf8');
const fragment = fs.readFileSync(fragmentPath, 'utf8');

// 1. Insert the service import right after the SchoolSettings import.
const importAnchor = "import SchoolSettings from '../models/SchoolSettings.js';";
if (!source.includes(importAnchor)) {
  throw new Error('Import anchor not found in routes/timetable.js');
}
if (/services\/timetableScheduler/.test(source)) {
  throw new Error('Scheduler import already present — aborting to avoid double-import');
}
const withImport = source.replace(
  importAnchor,
  `${importAnchor}\nimport { generateTimetableSchedule } from '../services/timetableScheduler.js';`
);

// 2. Replace the generation section: from the decorative "=====" line above
//    the "// Timetable Generation" comment up to (but excluding) the line
//    that begins with "export default router;".
const headerLine = '// Timetable Generation';
const headerIdx = withImport.indexOf(headerLine);
if (headerIdx === -1) throw new Error('Generation section header not found');

// Walk back to the decorative divider line above the header comment.
let sectionStart = withImport.lastIndexOf('\n', headerIdx - 2) + 1;
const lineBefore = withImport.slice(sectionStart, withImport.indexOf('\n', sectionStart));
if (lineBefore.trim().startsWith('//')) {
  // The divider is a full-line comment; include it so the section is clean.
  sectionStart = withImport.lastIndexOf('\n', sectionStart - 2) + 1;
}

const endMarker = 'export default router;';
const endIdx = withImport.indexOf(endMarker);
if (endIdx === -1) throw new Error('"export default router;" not found');

const prefix = withImport.slice(0, sectionStart);
const suffix = withImport.slice(endIdx); // keeps "export default router;" + the rest

const newContent = `${prefix}${fragment.trimEnd()}\n\n${suffix}`;

fs.writeFileSync(routePath, newContent, 'utf8');
console.log('routes/timetable.js rewritten. New length:', newContent.length);