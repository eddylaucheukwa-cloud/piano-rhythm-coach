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
  let chartDraws = 0;
  const canvasContext = new Proxy({ clearRect() { chartDraws++; } }, { get: (target, key) => target[key] ?? (() => {}) });
  function element(id) {
    if (!elements.has(id)) {
      const handlers = new Map();
      const classes = new Set();
      elements.set(id, {
        value: { bpm: '120', notesPerBeat: '1', totalNotes: '4' }[id] ?? '',
        textContent: '', innerHTML: '', src: '', width: 400, height: 220,
        style: { setProperty(name, value) { this[name] = value; } }, classList: {
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
        dispatch(name, event) { handlers.get(name)?.(event); },
        setPointerCapture() {},
        setAttribute(name, value) { this[name] = value; },
        getBoundingClientRect() {
          const offset = id === 'modeTitleTrack' ? parseFloat(element('modeTitle').style['--mode-offset'] || '0') * 8 : 0;
          return { left: offset, width: id === 'modeTitleTrack' ? 800 : 400 };
        },
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
  return { context, elements, intervals, timeouts, element, get chartDraws() { return chartDraws; } };
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

function startTest(app) {
  vm.runInContext('microphoneStream = {}; previousFrequencyData = new Uint8Array(4); setTestMode(true)', app.context);
  app.element('startPracticeButton').click();
}

test('title swipes select test/practice modes and ignore vertical or cancelled gestures', () => {
  const app = loadApp();
  const title = app.element('modeTitle');
  const down = () => title.dispatch('pointerdown', { isPrimary: true, button: 0, pointerId: 1, clientX: 200, clientY: 20 });
  const up = (x, y = 20) => title.dispatch('pointerup', { pointerId: 1, clientX: x, clientY: y });
  down(); up(100, 160);
  assert.equal(vm.runInContext('isTestMode', app.context), false);
  down(); title.dispatch('pointercancel', {}); up(100);
  assert.equal(vm.runInContext('isTestMode', app.context), false);
  down(); up(100);
  assert.match(title['aria-label'], /^Test mode\./);
  assert.equal(app.element('coachConsole').classList.contains('test-mode'), true);
  down(); up(260);
  assert.match(title['aria-label'], /^Piano Rhythm Coach\./);
  assert.equal(app.element('coachConsole').classList.contains('test-mode'), false);
});

test('title follows dragging, returns after a short slow swipe, and accepts a quick flick', () => {
  const app = loadApp();
  const title = app.element('modeTitle');
  const pointer = (x) => ({ isPrimary: true, button: 0, pointerId: 1, clientX: x, clientY: 20 });
  title.dispatch('pointerdown', pointer(200));
  title.dispatch('pointermove', pointer(150));
  assert.equal(parseFloat(title.style['--mode-offset']), -6.25);
  assert.equal(title.classList.contains('is-swiping'), true);
  app.context.performance.now = () => 1400;
  title.dispatch('pointerup', pointer(150));
  assert.equal(vm.runInContext('isTestMode', app.context), false);
  assert.equal(title.style['--mode-offset'], '0%');
  assert.equal(title.classList.contains('is-swiping'), false);
  title.dispatch('pointerdown', pointer(200));
  title.dispatch('pointermove', pointer(160));
  app.context.performance.now = () => 1450;
  title.dispatch('pointerup', pointer(160));
  assert.equal(vm.runInContext('isTestMode', app.context), true);
  assert.equal(title.style['--mode-offset'], '-50%');
  title.dispatch('pointerdown', pointer(200));
  title.dispatch('pointermove', pointer(260));
  title.dispatch('pointercancel', {});
  assert.equal(title.style['--mode-offset'], '-50%');
  assert.equal(title.classList.contains('is-swiping'), false);
});

test('outward swipes preserve completed results and running sessions cannot start a drag', () => {
  const app = loadApp();
  startTest(app);
  app.element('stopPracticeButton').click();
  const title = app.element('modeTitle');
  const pointer = (x) => ({ isPrimary: true, button: 0, pointerId: 1, clientX: x, clientY: 20 });
  title.dispatch('pointerdown', pointer(200));
  title.dispatch('pointermove', pointer(100));
  assert.ok(parseFloat(title.style['--mode-offset']) > -63);
  assert.ok(parseFloat(title.style['--mode-offset']) < -50);
  title.dispatch('pointerup', pointer(100));
  assert.equal(app.element('coachConsole').classList.contains('test-results'), true);
  assert.equal(title.style['--mode-offset'], '-50%');
  app.element('startPracticeButton').click();
  title.dispatch('pointerdown', pointer(200));
  assert.equal(title.classList.contains('is-swiping'), false);
  assert.equal(vm.runInContext('titleSwipe', app.context), null);
});

test('test mode plays exactly four count-in clicks and then stops beat flashing', () => {
  const app = loadApp();
  let clicks = 0;
  app.context.playClick = () => { clicks++; };
  startTest(app);
  const practiceBeat = [...app.intervals.values()].find(({ delay }) => delay === 500).callback;
  for (let i = 0; i < 8; i++) practiceBeat();
  assert.equal(clicks, 4);
  assert.equal(app.element('playbackButton').classList.contains('beat-flash'), false);
  assert.equal([...app.intervals.values()].some(({ delay }) => delay === 500), false);
});

test('test mode hides live results, stops recording on the final note, and resets for a new test', () => {
  const app = loadApp();
  startTest(app);
  for (const time of [3000, 3500, 4000]) {
    app.context.performance.now = () => time;
    vm.runInContext(`matchSoundToExpectedEvent(${time})`, app.context);
  }
  assert.equal(app.chartDraws, 0);
  assert.equal(vm.runInContext('isPracticeRunning', app.context), true);
  assert.equal(vm.runInContext('mediaRecorder.state', app.context), 'recording');
  vm.runInContext('setTestMode(false)', app.context);
  assert.equal(vm.runInContext('isTestMode', app.context), true);
  app.context.performance.now = () => 4500;
  vm.runInContext('matchSoundToExpectedEvent(4500)', app.context);
  assert.equal(vm.runInContext('isPracticeRunning', app.context), false);
  assert.equal(vm.runInContext('mediaRecorder.state', app.context), 'inactive');
  assert.equal(app.intervals.size, 0);
  assert.equal(app.element('coachConsole').classList.contains('test-results'), true);
  assert.equal(app.chartDraws, 1);
  assert.match(app.element('practiceScore').textContent, /100\.0%/);
  app.element('startPracticeButton').click();
  assert.equal(app.element('coachConsole').classList.contains('test-results'), false);
  assert.equal(vm.runInContext('expectedEvents.every(event => event.result === null)', app.context), true);
  app.element('stopPracticeButton').click();
  assert.equal(app.intervals.size, 0);
  assert.equal(vm.runInContext('mediaRecorder.state', app.context), 'inactive');
});

test('test completion waits for calibrated final deadline even with missing notes', () => {
  const app = loadApp({ offsetMs: 300 });
  startTest(app);
  const progress = [...app.intervals.values()].find(({ delay }) => delay === 25).callback;
  app.context.performance.now = () => 4979;
  progress();
  assert.equal(vm.runInContext('isPracticeRunning', app.context), true);
  app.context.performance.now = () => 4981;
  progress();
  assert.equal(vm.runInContext('isPracticeRunning', app.context), false);
  assert.equal(vm.runInContext('expectedEvents.every(event => event.result === "Missed")', app.context), true);
  assert.equal(vm.runInContext('mediaRecorder.state', app.context), 'inactive');
  assert.equal(app.intervals.size, 0);
});

test('calibration remains visible in test mode and applying it restores the BPM screen', () => {
  const app = loadApp();
  vm.runInContext('microphoneStream = {}; previousFrequencyData = new Uint8Array(4); setTestMode(true); startCalibration()', app.context);
  assert.equal(app.element('coachConsole').classList.contains('test-mode'), false);
  assert.equal(vm.runInContext('mode', app.context), 'calibrating');
  vm.runInContext('mode = "calibration-result"; pendingCalibration = { offsetMs: 100 }; applyCalibration()', app.context);
  assert.equal(app.element('coachConsole').classList.contains('test-mode'), true);
  assert.equal(vm.runInContext('mode', app.context), 'idle');
  assert.match(app.element('practiceStatus').textContent, /Calibration applied/);
});
