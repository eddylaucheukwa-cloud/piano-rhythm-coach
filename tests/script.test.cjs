const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const vm = require('node:vm');

function loadApp(calibration = null) {
  const elements = new Map();
  const intervals = new Map();
  const timeouts = new Map();
  let nextInterval = 0;
  let nextTimeout = 0;
  const canvasContext = new Proxy({}, { get: (target, key) => target[key] ?? (() => {}) });
  function element(id) {
    if (!elements.has(id)) {
      const handlers = new Map();
      const classes = new Set();
      elements.set(id, {
        value: { bpm: '120', notesPerBeat: '1', totalNotes: '4' }[id] ?? '',
        textContent: '', innerHTML: '', src: '', width: 400, height: 220,
        style: {}, classList: {
          add(...names) { names.forEach((name) => classes.add(name)); },
          remove(...names) { names.forEach((name) => classes.delete(name)); },
          toggle(name, force) {
            if (force ?? !classes.has(name)) classes.add(name);
            else classes.delete(name);
          },
          contains(name) { return classes.has(name); },
        },
        addEventListener: (name, handler) => handlers.set(name, handler),
        click() { handlers.get('click')?.(); },
        getContext: () => canvasContext,
        pause() {}, load() {}, removeAttribute(name) { this[name] = ''; },
        appendChild() {}, scrollHeight: 0, scrollTop: 0,
      });
    }
    return elements.get(id);
  }
  class FakeRecorder {
    constructor() { this.state = 'inactive'; this.handlers = new Map(); this.mimeType = 'audio/webm'; }
    addEventListener(name, handler) { this.handlers.set(name, handler); }
    start() { this.state = 'recording'; }
    stop() { this.state = 'inactive'; }
  }
  class FakeAudioContext {
    constructor() { this.currentTime = 0; this.destination = {}; }
    createOscillator() { return { frequency: {}, connect() {}, start() {}, stop() {} }; }
    createGain() { return { gain: { setValueAtTime() {}, exponentialRampToValueAtTime() {} }, connect() {} }; }
  }
  const context = vm.createContext({
    window: {},
    document: { getElementById: element, createElement: () => element('created') },
    localStorage: { getItem: () => calibration && JSON.stringify(calibration), setItem() {} },
    performance: { now: () => 1000 },
    setInterval(callback, delay) { intervals.set(++nextInterval, { callback, delay }); return nextInterval; },
    clearInterval(id) { intervals.delete(id); },
    setTimeout(callback, delay) {
      const id = ++nextTimeout;
      timeouts.set(id, { callback, delay });
      return id;
    },
    clearTimeout(id) { timeouts.delete(id); },
    requestAnimationFrame() {}, cancelAnimationFrame() {},
    AudioContext: FakeAudioContext, MediaRecorder: FakeRecorder,
    URL: { createObjectURL: () => 'blob:test' }, Blob,
    console: { log() {}, error() {} },
  });
  vm.runInContext(fs.readFileSync(require.resolve('../script.js'), 'utf8'), context);
  return { context, elements, intervals, timeouts, element };
}

test('playback light pulses on each metronome beat', () => {
  const app = loadApp();
  app.element('bpm').value = '150';
  vm.runInContext('microphoneStream = {}; previousFrequencyData = new Uint8Array(4)', app.context);

  app.element('startPracticeButton').click();
  const playback = app.element('playbackButton');
  const practiceBeat = [...app.intervals.values()][0];
  assert.equal(practiceBeat.delay, 400);
  assert.equal(playback.classList.contains('beat-flash'), true);

  const lightOff = [...app.timeouts.values()].find(({ delay }) => delay === 200);
  assert.ok(lightOff);
  lightOff.callback();
  assert.equal(playback.classList.contains('beat-flash'), false);

  practiceBeat.callback();
  assert.equal(playback.classList.contains('beat-flash'), true);
  app.element('stopPracticeButton').click();
  assert.equal(playback.classList.contains('beat-flash'), false);
});

test('pressing Start twice keeps one metronome and Stop clears it', () => {
  const app = loadApp();
  vm.runInContext('microphoneStream = {}; previousFrequencyData = new Uint8Array(4)', app.context);
  app.element('startPracticeButton').click();
  assert.equal(app.intervals.size, 1);
  app.element('startPracticeButton').click();
  assert.equal(app.intervals.size, 1);
  app.element('stopPracticeButton').click();
  assert.equal(app.intervals.size, 0);
  app.element('startPracticeButton').click();
  assert.equal(app.intervals.size, 1);
});

test('transport lamps show ready, recording, and stopped states', () => {
  const app = loadApp();
  const start = app.element('startPracticeButton');
  const stop = app.element('stopPracticeButton');
  const playback = app.element('playbackButton');
  assert.equal(start.classList.contains('lamp-green'), true);
  vm.runInContext('microphoneStream = {}; previousFrequencyData = new Uint8Array(4)', app.context);
  start.click();
  assert.equal(start.classList.contains('lamp-green'), false);
  assert.equal(stop.classList.contains('lamp-red'), true);
  assert.equal(playback.classList.contains('lamp-recording'), true);
  stop.click();
  assert.equal(start.classList.contains('lamp-green'), true);
  assert.equal(stop.classList.contains('lamp-red'), false);
  assert.equal(playback.classList.contains('lamp-recording'), false);
});

test('calibration transport lamps follow available actions', () => {
  const app = loadApp();
  const start = app.element('startPracticeButton');
  const stop = app.element('stopPracticeButton');
  vm.runInContext('mode = "calibrating"; setTransportState({ startEnabled: false, stopEnabled: false })', app.context);
  assert.equal(start.classList.contains('lamp-green'), false);
  vm.runInContext('mode = "calibration-result"; setTransportState({ startEnabled: true, stopEnabled: true, startLight: true, stopLight: true })', app.context);
  assert.equal(start.classList.contains('lamp-green'), true);
  assert.equal(stop.classList.contains('lamp-red'), true);
});

test('practice matching uses calibrated expected sound time', () => {
  const app = loadApp({ offsetMs: 300 });
  vm.runInContext('expectedEvents = [{ number: 1, time: 1000, detectedTime: null, result: null }]', app.context);
  vm.runInContext('matchSoundToExpectedEvent(1300)', app.context);
  assert.equal(vm.runInContext('expectedEvents[0].result', app.context), 'On Beat');
});

test('a calibrated note is not marked missed before its adjusted deadline', () => {
  const app = loadApp({ offsetMs: 300 });
  app.context.performance.now = () => 1250;
  vm.runInContext('expectedEvents = [{ number: 1, time: 1000, detectedTime: null, result: null }]', app.context);
  vm.runInContext('updatePracticeDisplay()', app.context);
  assert.equal(vm.runInContext('expectedEvents[0].result', app.context), null);
});

test('calibration accepts an onset 500 ms after the scheduled beat', () => {
  const app = loadApp();
  vm.runInContext('expectedEvents = [{ number: 1, time: 1000, detectedTime: null, result: null }]', app.context);
  vm.runInContext('matchCalibrationOnset(1500)', app.context);
  assert.equal(vm.runInContext('expectedEvents[0].result', app.context), 'Matched');
});
