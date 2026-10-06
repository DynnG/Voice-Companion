const assert = require('node:assert/strict');
const fs = require('node:fs');
const vm = require('node:vm');
const ts = require('typescript');

const source = fs.readFileSync(require.resolve('./src/services/ttsService.ts'), 'utf8')
  .replaceAll('import.meta.env', '({ PROD: false, VITE_API_BASE_URL: "" })');
const compiled = ts.transpileModule(source, {
  compilerOptions: { module: ts.ModuleKind.CommonJS, target: ts.ScriptTarget.ES2020 }
}).outputText;
let now = 0;
let utterance;
const synthesis = {
  paused: false, speaking: false, pending: false,
  getVoices: () => [], resume() {},
  cancel() { this.speaking = false; },
  speak(value) { utterance = value; this.speaking = true; value.onstart(); }
};
const sandbox = {
  exports: {}, window: { speechSynthesis: synthesis },
  SpeechSynthesisUtterance: class { constructor(text) { this.text = text; } },
  performance: { now: () => now }, console,
  setTimeout: () => 1, clearTimeout() {},
};
vm.runInNewContext(compiled, sandbox);
const { speakText, readSpeechLevel, stopSpeaking } = sandbox.exports;

function advance(milliseconds) {
  const levels = [];
  for (let elapsed = 0; elapsed < milliseconds; elapsed += 20) {
    now += 20;
    levels.push(readSpeechLevel());
  }
  return levels;
}

(async () => {
  assert.equal(readSpeechLevel(), 0);
  await speakText('A browser voice that does not emit word boundaries.', { engine: 'speechSynthesis' });
  const levels = advance(4000).slice(50);
  assert.ok(Math.max(...levels) - Math.min(...levels) > 0.15, 'Missing events still produce visible pulse variation');
  assert.ok(levels.every(level => level >= 0 && level <= 1), 'Fallback remains bounded');
  assert.ok(levels.slice(1).every((level, i) => Math.abs(level - levels[i]) < 0.12), 'Fallback stays smooth');

  utterance.onboundary();
  advance(500);
  utterance.onboundary();
  advance(20);
  const rise = readSpeechLevel();
  advance(140);
  assert.ok(readSpeechLevel() < rise, 'Real word events still drive the signal');

  synthesis.paused = true;
  assert.equal(readSpeechLevel(), 0, 'Paused voice has no visual speech signal');
  synthesis.paused = false;
  utterance.onend();
  synthesis.speaking = false;
  assert.equal(readSpeechLevel(), 0, 'Finishing speech clears the signal');

  await speakText('Another response.', { engine: 'speechSynthesis', speed: 1.2 });
  advance(1800);
  assert.ok(readSpeechLevel() > 0.05, 'A subsequent response also gets the fallback');
  stopSpeaking();
  assert.equal(readSpeechLevel(), 0, 'Interruption clears the signal immediately');
  advance(2000);
  assert.equal(readSpeechLevel(), 0, 'No pulse survives cancellation');
  console.log('AI orb signal checks passed: missing events, smooth fallback, real events, pause, completion, restart, cancellation');
})().catch(error => { console.error(error); process.exitCode = 1; });
