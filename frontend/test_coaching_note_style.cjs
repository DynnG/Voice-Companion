const assert=require('node:assert/strict');
const fs=require('node:fs');const ts=require('typescript');const Module=require('node:module');
const mod=new Module('coachingNoteStyle');mod._compile(ts.transpileModule(fs.readFileSync(require.resolve('./src/services/coachingNoteStyle.ts'),'utf8'),{compilerOptions:{module:ts.ModuleKind.CommonJS}}).outputText,'coachingNoteStyle.js');
const {coachingNoteKind:kind}=mod.exports;
assert.equal(kind('Your delivery was fluent and steady without noticeable hesitation pauses.'),'strength');
assert.equal(kind('Your answer lacked a concrete example.'),'improvement');
assert.equal(kind('Your explanation was unclear.'),'improvement');
assert.equal(kind('Next time, provide a concrete example.'),'advice');
assert.equal(kind('Address the core question directly.'),'advice');
assert.equal(kind('Your delivery was fluent but your answer lacked detail.'),'improvement');
assert.equal(kind('Your example was not enough.'),'improvement');
assert.equal(kind('You discussed your classroom experience.'),'feedback');
assert.equal(kind('Your delivery was not fluent.'),'improvement');
assert.equal(kind('Your answer had no concrete example.'),'improvement');
console.log('10 coaching note style checks passed');

const {displayCoachingNotes:display}=mod.exports;
const offTopic=['Your answer was completely off-topic and did not address follow-up strategies.', 'Your delivery was fluent and steady.', 'Next time, provide a relevant example.'];
assert.deepEqual(display(offTopic),[{text:offTopic[0],kind:'improvement'}]);
assert.equal(display(['Your answer did not address every detail.', 'Next time, give an example.']).length,2);
assert.deepEqual(display([]),[]);
console.log('Off-topic filtering checks passed');

assert.deepEqual(display(['Next time, provide an example.', 'You discussed your classroom experience.', 'Your delivery was fluent and steady.']).map(note=>note.kind), ['feedback', 'advice', 'strength']);
console.log('Feedback-first ordering check passed');
