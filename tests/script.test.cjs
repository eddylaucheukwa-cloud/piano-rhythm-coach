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
          const offset = id === 'modeTitleTrack' ? parseFloat(element('modeTitle').style['--mode-offset'] || '0') * 12 : 0;
          return { left: offset, width: id === 'modeTitleTrack' ? 1200 : 400 };
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
  assert.equal(parseFloat(title.style['--mode-offset']), -100 / 24);
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
  assert.equal(title.style['--mode-offset'], `${-100 / 3}%`);
  title.dispatch('pointerdown', pointer(200));
  title.dispatch('pointermove', pointer(260));
  title.dispatch('pointercancel', {});
  assert.equal(title.style['--mode-offset'], `${-100 / 3}%`);
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
  assert.ok(parseFloat(title.style['--mode-offset']) > -42);
  assert.ok(parseFloat(title.style['--mode-offset']) < -100 / 3);
  title.dispatch('pointerup', pointer(100));
  assert.equal(app.element('coachConsole').classList.contains('test-results'), true);
  assert.equal(title.style['--mode-offset'], `${-100 / 3}%`);
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

function startPlay(app) {
  vm.runInContext(`
    let randomIndex = 0;
    Math.random = () => [0.25, 0.5, 0.75, 0][randomIndex++ % 4];
    microphoneStream = {};
    previousFrequencyData = new Uint8Array(4);
    setCoachMode("play");
  `, app.context);
  app.element('startPracticeButton').click();
}

test('play mode unlocks on the third extra left swipe from test mode and exits to test mode', () => {
  const app = loadApp();
  vm.runInContext('setTestMode(true)', app.context);
  const title = app.element('modeTitle');
  const swipe = (left) => {
    title.dispatch('pointerdown', { isPrimary:true, button:0, pointerId:1, clientX:200, clientY:20 });
    title.dispatch('pointerup', { pointerId:1, clientX:left?100:300, clientY:20 });
  };
  swipe(true); swipe(true);
  assert.equal(vm.runInContext('isPlayMode', app.context), false);
  swipe(true);
  assert.equal(vm.runInContext('isPlayMode', app.context), true);
  assert.equal(app.element('coachConsole').classList.contains('play-mode'), true);
  swipe(false);
  assert.equal(vm.runInContext('isPlayMode', app.context), false);
  assert.equal(vm.runInContext('isTestMode', app.context), true);
  swipe(false);
  assert.equal(vm.runInContext('isTestMode', app.context), false);
});

test('2341 schedules 2, 3, 4, and 1 evenly spaced notes after a four-beat 60 BPM count-in', () => {
  const app = loadApp();
  startPlay(app);
  const events = vm.runInContext('expectedEvents.filter(event => event.loop === 1)', app.context);
  assert.equal(events.length, 10);
  const expectedTimes = [5000,5500,6000,6000+1000/3,6000+2000/3,7000,7250,7500,7750,8000];
  events.forEach((event,index) => assert.ok(Math.abs(event.time-expectedTimes[index])<0.001));
  assert.equal(vm.runInContext('playState.bpm', app.context), 60);
  app.context.performance.now = () => 5000;
  vm.runInContext('advancePlayMode()', app.context);
  assert.equal(vm.runInContext('playState.currentBeat', app.context), 0);
  assert.equal(app.element('playBeat1').classList.contains('active'), true);
});

test('play mode generates a new pattern each cycle and increases tempo after four cycles and their buffers', () => {
  const app = loadApp();
  startPlay(app);
  vm.runInContext('Math.random = () => 0', app.context);
  app.context.performance.now = () => 11000;
  vm.runInContext('advancePlayMode()', app.context);
  assert.equal(vm.runInContext('playState.completedLoops', app.context), 1);
  assert.equal(vm.runInContext('playState.bpm', app.context), 60);
  assert.equal(vm.runInContext('playState.nextPattern.join("")', app.context), '1111');
  app.context.performance.now = () => 17000;
  vm.runInContext('advancePlayMode()', app.context);
  assert.equal(vm.runInContext('playState.completedLoops', app.context), 2);
  assert.equal(vm.runInContext('playState.bpm', app.context), 60);
  assert.equal(vm.runInContext('playState.pattern.join("")', app.context), '1111');
  assert.equal(vm.runInContext('expectedEvents.find(event => event.loop === 3).time', app.context), 17000);
  app.context.performance.now = () => 27000;
  vm.runInContext('advancePlayMode()', app.context);
  assert.equal(vm.runInContext('playState.completedLoops', app.context), 4);
  assert.equal(vm.runInContext('playState.bpm', app.context), 60);
  app.context.performance.now = () => 29000;
  vm.runInContext('advancePlayMode()', app.context);
  assert.equal(vm.runInContext('playState.bpm', app.context), 65);
  assert.equal(vm.runInContext('expectedEvents.find(event => event.loop === 5).time', app.context), 29000);
  assert.equal(vm.runInContext('isPracticeRunning', app.context), true);
});

test('play mode uses calibrated note deadlines, stops its timers, and restarts at 60 BPM', () => {
  const app = loadApp({offsetMs:300});
  startPlay(app);
  app.context.performance.now = () => 5300;
  vm.runInContext('advancePlayMode(); matchSoundToExpectedEvent(5300)', app.context);
  assert.equal(vm.runInContext('expectedEvents[0].result', app.context), 'On Beat');
  assert.equal(app.chartDraws, 0);
  app.element('stopPracticeButton').click();
  assert.equal(app.intervals.size, 0);
  assert.equal(vm.runInContext('mediaRecorder.state', app.context), 'inactive');
  assert.equal(app.element('coachConsole').classList.contains('play-results'), true);
  assert.equal(app.chartDraws, 1);
  app.element('startPracticeButton').click();
  assert.equal(vm.runInContext('playState.bpm', app.context), 60);
  assert.equal(vm.runInContext('playState.completedLoops', app.context), 0);
  assert.equal(app.element('coachConsole').classList.contains('play-results'), false);
});

test('the upcoming play loop is ready to match an early first note before the loop boundary', () => {
  const app = loadApp();
  startPlay(app);
  vm.runInContext('expectedEvents.filter(event => event.loop === 1).forEach(event => {event.result = "Missed"})', app.context);
  app.context.performance.now = () => 10900;
  vm.runInContext('advancePlayMode(); matchSoundToExpectedEvent(10900)', app.context);
  assert.equal(vm.runInContext('expectedEvents.find(event => event.loop === 2).result', app.context), 'Early');
  assert.equal(vm.runInContext('playState.completedLoops', app.context), 1);
});

test('play tempo continues increasing beyond the manual tempo control range', () => {
  const app = loadApp();
  startPlay(app);
  for (let beat = 0; beat < 604; beat++) {
    app.context.performance.now = () => vm.runInContext('playState.nextBeatTime', app.context);
    vm.runInContext('advancePlayMode()', app.context);
  }
  assert.equal(vm.runInContext('playState.completedLoops', app.context), 100);
  assert.equal(vm.runInContext('playState.bpm', app.context), 185);
  assert.equal(vm.runInContext('isPracticeRunning', app.context), true);
});

test('tempo increases do not change the timing window of an earlier delayed play note', () => {
  const app = loadApp({offsetMs:3300});
  startPlay(app);
  app.context.performance.now = () => 29410;
  vm.runInContext('advancePlayMode()', app.context);
  assert.equal(vm.runInContext('playState.bpm', app.context), 65);
  assert.equal(vm.runInContext('expectedEvents.find(event => event.loop === 4 && event.beatIndex === 3).result', app.context), null);
  vm.runInContext('matchSoundToExpectedEvent(29410)', app.context);
  assert.equal(vm.runInContext('expectedEvents.find(event => event.loop === 4 && event.beatIndex === 3).result', app.context), 'Late');
});

test('calibration inside play mode restores the play screen after applying', () => {
  const app = loadApp();
  vm.runInContext('microphoneStream={};previousFrequencyData=new Uint8Array(4);setCoachMode("play");startCalibration()', app.context);
  assert.equal(app.element('coachConsole').classList.contains('play-mode'), false);
  vm.runInContext('mode="calibration-result";pendingCalibration={offsetMs:100};applyCalibration()', app.context);
  assert.equal(vm.runInContext('isPlayMode', app.context), true);
  assert.equal(app.element('coachConsole').classList.contains('play-mode'), true);
});

test('every play loop has exactly two buffer beats with no scheduled notes', () => {
  const app = loadApp();
  startPlay(app);
  app.context.performance.now = () => 9000;
  vm.runInContext('advancePlayMode()', app.context);
  assert.equal(vm.runInContext('playState.completedLoops', app.context), 1);
  assert.equal(vm.runInContext('playState.currentBeat', app.context), -1);
  assert.equal(app.element('playProgress').textContent, 'BUFFER 1 / 2');
  assert.match(app.element('playFeedback').textContent, /REST/);
  assert.equal(vm.runInContext('expectedEvents.some(event => event.time >= 9000 && event.time < 11000)', app.context), false);
  app.context.performance.now = () => 10000;
  vm.runInContext('advancePlayMode(); matchSoundToExpectedEvent(10000)', app.context);
  assert.equal(app.element('playProgress').textContent, 'BUFFER 2 / 2');
  assert.equal(vm.runInContext('expectedEvents.filter(event => event.loop === 2).every(event => event.result === null)', app.context), true);
  app.context.performance.now = () => 11000;
  vm.runInContext('advancePlayMode()', app.context);
  assert.equal(vm.runInContext('playState.bufferBeat', app.context), 0);
  assert.equal(vm.runInContext('playState.currentBeat', app.context), 0);
  assert.equal(app.element('playBeat1').classList.contains('active'), true);
});

test('play beat digits light yellow, red, or green for judged beats and reset for the buffer preview', () => {
  const app = loadApp();
  startPlay(app);
  const times = vm.runInContext('expectedEvents.filter(event => event.loop === 1).map(event => event.time)', app.context);
  times.forEach((time,index) => {
    if (index === 7) return;
    const soundTime = time + (index === 1 ? -65 : index === 2 ? 65 : 0);
    app.context.performance.now = () => soundTime;
    vm.runInContext(`advancePlayMode(); matchSoundToExpectedEvent(${soundTime})`, app.context);
  });
  assert.equal(app.element('playBeat1').classList.contains('timing-warning'), true);
  assert.equal(app.element('playBeat2').classList.contains('timing-warning'), true);
  assert.equal(app.element('playBeat3').classList.contains('timing-missed'), true);
  assert.equal(app.element('playBeat3').classList.contains('timing-warning'), false);
  assert.equal(app.element('playBeat4').classList.contains('timing-warning'), false);
  assert.equal(app.element('playBeat4').classList.contains('timing-missed'), false);
  assert.equal(app.element('playBeat4').classList.contains('timing-correct'), true);
  assert.equal(app.element('playBeat1').classList.contains('timing-correct'), false);
  app.context.performance.now = () => 9000;
  vm.runInContext('advancePlayMode()', app.context);
  for (let beat = 1; beat <= 4; beat++) {
    for (const status of ['timing-warning', 'timing-missed', 'timing-correct']) {
      assert.equal(app.element(`playBeat${beat}`).classList.contains(status), false);
    }
  }
  app.context.performance.now = () => 11000;
  vm.runInContext('advancePlayMode()', app.context);
  assert.equal(app.element('playBeat1').classList.contains('timing-warning'), false);
  assert.equal(app.element('playBeat3').classList.contains('timing-missed'), false);
});

test('both buffer beats preview the next pattern before its playing loop starts', () => {
  const app = loadApp();
  startPlay(app);
  vm.runInContext('Math.random = () => 0', app.context);
  app.context.performance.now = () => 11000;
  vm.runInContext('advancePlayMode()', app.context);
  assert.equal(vm.runInContext('playState.pattern.join("")', app.context), '2341');
  for (const time of [15000, 16000]) {
    app.context.performance.now = () => time;
    vm.runInContext('advancePlayMode()', app.context);
    assert.equal([1, 2, 3, 4].map(beat => app.element(`playBeat${beat}`).textContent).join(''), '1111');
    assert.equal(vm.runInContext('playState.pattern.join("")', app.context), '2341');
    assert.equal(app.element('playPattern')['aria-label'], 'Four beats: 1, 1, 1, 1 notes per beat');
  }
  app.context.performance.now = () => 17000;
  vm.runInContext('advancePlayMode()', app.context);
  assert.equal(vm.runInContext('playState.pattern.join("")', app.context), '1111');
  assert.equal(app.element('playBeat1').classList.contains('active'), true);
  assert.equal(app.element('playBeat1').classList.contains('timing-correct'), false);
});
