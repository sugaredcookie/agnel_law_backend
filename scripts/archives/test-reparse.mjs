import mongoose from 'mongoose';
import dotenv from 'dotenv';
dotenv.config();
await mongoose.connect(process.env.MONGO_DB_URI);

import ResultConfig from '../models/resultConfigModel.js';
import ParsedResult from '../models/parsedResultModel.js';
import { readStudentsStandard, getGradeInfo, getFinalGrade } from '../utils/resultExcelParser.js';

const atktDoc = await ResultConfig.findOne({ slug: 'fy-ballb-sem1-oct2024-atkt' });
if (!atktDoc.excelFile) { console.log('No Excel file path stored'); process.exit(1); }

const plain = atktDoc.toObject();
const parserCfg = {
  file: plain.excelFile,
  subjects: plain.subjects || [],
  limits: plain.limits || {},
  practical: plain.practical || null,
};

console.log('Parsing:', parserCfg.file);
const students = await readStudentsStandard(parserCfg);
console.log('Parsed', students.length, 'students');

// Find Roll 24616
const s = students.find(st => st.rollNo === '24616');
if (!s) { console.log('Roll 24616 not found'); process.exit(1); }

console.log('\n=== AFTER PARSER FIX (before applyHighestMarks) ===');
for (const subj of s.subjects) {
  console.log(`  Subj ${subj.code}: I=${subj.internal}(disp=${subj.iDisplay}) E=${subj.external}(disp=${subj.eDisplay}) T=${subj.total} passed=${subj.passed} grade=${subj.grade}`);
}
console.log('totalMarksObt:', s.totalMarksObt, '| sgpa:', s.sgpa, '| remark:', s.remark, '| allPassed:', s.allPassed);

// Now simulate applyHighestMarks
const regularConfigs = await ResultConfig.find({
  programId: atktDoc.programId,
  semesterNumber: atktDoc.semesterNumber,
  examType: 'regular',
  status: { $ne: 'archived' },
}).lean();

const regularMap = new Map();
for (const rc of regularConfigs) {
  const results = await ParsedResult.find({ resultConfigId: rc._id }).lean();
  for (const r of results) {
    const existing = regularMap.get(r.rollNo);
    if (!existing || (r.totalMarksObt || 0) > (existing.totalMarksObt || 0)) {
      regularMap.set(r.rollNo, r);
    }
  }
}

const limits = plain.limits || {};
const regular = regularMap.get('24616');
if (!regular) { console.log('Roll 24616 not in regular'); process.exit(1); }

console.log('\n=== REGULAR DATA ===');
for (const subj of regular.subjects) {
  console.log(`  Subj ${subj.code}: I=${subj.internal} E=${subj.external} T=${subj.total}`);
}

// Apply highest marks
for (const subj of s.subjects) {
  const regSubj = regular.subjects?.find(rs => rs.code === subj.code);
  if (!regSubj) continue;

  const rawI = typeof subj.internal === 'number' ? subj.internal : 0;
  const rawE = typeof subj.external === 'number' ? subj.external : 0;
  const regI = typeof regSubj.internal === 'number' ? regSubj.internal : 0;
  const regE = typeof regSubj.external === 'number' ? regSubj.external : 0;

  const bestI = Math.max(rawI, regI);
  const bestE = Math.max(rawE, regE);
  const iChanged = bestI !== regI;
  const eChanged = bestE !== regE;

  subj.internal = bestI;
  subj.external = bestE;
  subj.iDisplay = iChanged ? `${bestI}*` : bestI;
  subj.eDisplay = eChanged ? `${bestE}*` : bestE;
  subj.total = bestI + bestE;
  subj.passed = !subj.isAbsent &&
    bestI >= (limits.minI ?? 10) &&
    bestE >= (limits.minE ?? 30) &&
    subj.total >= (limits.minT ?? 40);
  const gi = subj.passed ? getGradeInfo(subj.total) : { grade: 'F', gp: 0 };
  subj.grade = gi.grade;
  subj.gp = gi.gp;
  subj.earned = subj.passed ? subj.credit : 0;
  subj.cg = subj.earned * gi.gp;
}

// Recalc
let totalMarksObt = 0, totalCG = 0, totalCredits = 0, totalEarned = 0;
for (const sub of s.subjects) {
  totalMarksObt += sub.total;
  totalCG += sub.cg;
  totalCredits += sub.credit;
  totalEarned += sub.earned;
}
s.totalMarksObt = totalMarksObt;
s.totalCG = totalCG;
s.totalCredits = totalCredits;
s.totalEarned = totalEarned;
s.sgpa = totalCredits > 0 ? parseFloat((totalCG / totalCredits).toFixed(2)) : null;
s.allPassed = s.subjects.every(sub => sub.passed);
const hasAbsent = s.subjects.some(sub => sub.isAbsent);
s.remark = hasAbsent ? 'ABSENT' : s.allPassed ? 'SUCCESSFUL' : 'UNSUCCESSFUL';

console.log('\n=== AFTER applyHighestMarks ===');
for (const subj of s.subjects) {
  console.log(`  Subj ${subj.code}: I=${subj.internal}(disp=${subj.iDisplay}) E=${subj.external}(disp=${subj.eDisplay}) T=${subj.total} passed=${subj.passed} grade=${subj.grade} gp=${subj.gp} earned=${subj.earned} cg=${subj.cg}`);
}
console.log('totalMarksObt:', s.totalMarksObt, '| totalCG:', s.totalCG, '| sgpa:', s.sgpa, '| remark:', s.remark, '| allPassed:', s.allPassed);

await mongoose.disconnect();
