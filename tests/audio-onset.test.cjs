const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const vm = require('node:vm');

function detector(options = {}) {
  const context = vm.createContext({ AudioWorkletProcessor: class {}, registerProcessor() {} });
  vm.runInContext(fs.readFileSync(require.resolve('../audio-onset.js'), 'utf8'), context);
  const result = vm.runInContext('new PianoOnsetDetector(48000)', context);
  result.configure(options);
  return result;
}

function render(notes, duration = 2.2, noise = 0.0002) {
  const samples = new Float32Array(Math.round(duration * 48000));
  let seed = 7;
  for (let i = 0; i < samples.length; i++) {
    seed = (Math.imul(seed, 1664525) + 1013904223) >>> 0;
    const time = i / 48000;
    let value = ((seed / 4294967296) * 2 - 1) * noise;
    for (const note of notes) {
      const age = time - note.time;
      if (age < 0) continue;
      const envelope = Math.min(1, age / 0.003) * Math.exp(-age / 0.16);
      value += note.amplitude * envelope * (Math.sin(2 * Math.PI * note.frequency * age) + 0.35 * Math.sin(4 * Math.PI * note.frequency * age));
    }
    samples[i] = value;
  }
  return samples;
}

function analyze(samples, options) {
  const engine = detector(options), onsets = [];
  for (let i = 0; i < samples.length; i += 128) onsets.push(...engine.process(samples.subarray(i, i + 128), i / 48000));
  return onsets;
}

test('quiet notes after loud notes are detected once despite overlapping decay tails', () => {
  const notes = [0.04, 0.01, 0.08, 0.006, 0.02].map((amplitude, index) => ({
    time: 0.2 + index * 0.3, amplitude, frequency: [261.63, 293.66, 329.63, 349.23, 392][index]
  }));
  const onsets = analyze(render(notes));
  assert.equal(onsets.length, notes.length, JSON.stringify(onsets));
  onsets.forEach((onset, index) => {
    assert.ok(Math.abs(onset.time - notes[index].time) < 0.025, `note ${index}: ${onset.time}`);
    assert.ok(Number.isFinite(onset.levelDb));
    assert.equal(onset.clipped, false);
  });
});

test('rapid repetitions of the same note are not lost between screen refreshes', () => {
  const notes = Array.from({ length: 8 }, (_, index) => ({ time: 0.2 + index * 0.1, amplitude: 0.04, frequency: 440 }));
  const onsets = analyze(render(notes, 1.3), { minimumGapMs: 45 });
  assert.equal(onsets.length, notes.length, JSON.stringify(onsets));
  onsets.forEach((onset, index) => assert.ok(Math.abs(onset.time - notes[index].time) < 0.025));
});

test('steady room noise and a sustained tone do not repeatedly trigger notes', () => {
  const samples = render([], 2, 0.001);
  for (let i = 0; i < samples.length; i++) samples[i] += 0.015 * Math.sin(2 * Math.PI * 220 * i / 48000);
  assert.equal(analyze(samples).length, 0);
});

test('loudness measurements preserve the relative strength of isolated attacks', () => {
  const notes = [0.008, 0.02, 0.06, 0.02, 0.008].map((amplitude, index) => ({ time: 0.2 + index * 0.35, amplitude, frequency: 440 }));
  const onsets = analyze(render(notes, 2.3));
  assert.equal(onsets.length, 5);
  assert.ok(onsets[0].levelDb < onsets[1].levelDb && onsets[1].levelDb < onsets[2].levelDb);
  assert.ok(onsets[2].levelDb > onsets[3].levelDb && onsets[3].levelDb > onsets[4].levelDb);
});
