const bpmSlider = document.getElementById("bpm");
const bpmValue = document.getElementById("bpmValue");
const startButton = document.getElementById("startButton");
const stopButton = document.getElementById("stopButton");
const beatLight = document.getElementById("beatLight");
const status = document.getElementById("status");
let metronomeTimer = null;
let audioContext = null;
// =========================
// LATENCY CALIBRATION STATE
// =========================

let mode = "idle";
// idle | calibrating | calibration-result | practice

let calibration = JSON.parse(
  localStorage.getItem("pianoRhythmCalibration")
) || null;
let pendingCalibration = null;
let expectedEvents = [];
let calibrationTimer = null;
let calibrationStartTime = 0;
let calibrationMonitorFrame = null;
const CALIBRATION_BPM = 60;
const CALIBRATION_NOTE_COUNT = 15;
const CALIBRATION_COUNT_IN_BEATS = 4;
const CALIBRATION_WINDOW_MS = 650;
const MIN_VALID_CALIBRATION_NOTES = Math.ceil(
  CALIBRATION_NOTE_COUNT * 0.6
);
const CLUSTER_RADIUS_MS = 45;
bpmSlider.addEventListener("input", () => {
  bpmValue.textContent = bpmSlider.value;

});
const micButton = document.getElementById("micButton");
const volumeBar = document.getElementById("volumeBar");
const micStatus = document.getElementById("micStatus");
const onsetThresholdSlider =
  document.getElementById("onsetThresholdSlider");

const onsetThresholdValue =
document.getElementById("onsetThresholdValue");
const noteLight = document.getElementById("noteLight");
const detectionText = document.getElementById("detectionText");
const recordButton = document.getElementById("recordButton");
const stopRecordButton = document.getElementById("stopRecordButton");
const recordedAudio = document.getElementById("recordedAudio");
const recordStatus = document.getElementById("recordStatus");
const notesPerBeat = document.getElementById("notesPerBeat");
const totalNotes = document.getElementById("totalNotes");
const playbackButton = document.getElementById("playbackButton");
const startPracticeButton = document.getElementById("startPracticeButton");
const stopPracticeButton = document.getElementById("stopPracticeButton");
const startLabel = document.getElementById("startLabel");
const stopLabel = document.getElementById("stopLabel");
const practiceStatus = document.getElementById("practiceStatus");
const practiceScore = document.getElementById("practiceScore");
const practiceResults = document.getElementById("practiceResults");
const timingChart = document.getElementById("timingChart");
const timingChartContext = timingChart.getContext("2d");
// Keep the small dot-matrix letters crisp when the monitor is scaled on phones.
const chartResolution = 2;
timingChart.width *= chartResolution;
timingChart.height *= chartResolution;
timingChartContext.scale(chartResolution, chartResolution);
const bpmMonitor = document.getElementById("bpmMonitor");
const coachConsole = document.getElementById("coachConsole");
const modeTitle = document.getElementById("modeTitle");
const modeTitleTrack = document.getElementById("modeTitleTrack");
let isTestMode = false;
let isPlayMode = false;
let secretSwipeCount = 0;
let playState = null;
let playTimer = null;
const playDigits = [1, 2, 3, 4].map(index => document.getElementById(`playBeat${index}`));
const playPattern = document.getElementById("playPattern");
const playProgress = document.getElementById("playProgress");
const playFeedback = document.getElementById("playFeedback");
const playNext = document.getElementById("playNext");
let testProgressTimer = null;
let titleSwipe = null;

function setTestMode(enabled) {
  setCoachMode(enabled ? "test" : "practice");
}

function modeTitleOffset() {
  return `${-(isPlayMode ? 2 : isTestMode ? 1 : 0) * 100 / 3}%`;
}

function setCoachMode(nextMode) {
  if (mode !== "idle" || isPracticeRunning) return;
  isTestMode = nextMode === "test";
  isPlayMode = nextMode === "play";
  secretSwipeCount = 0;
  coachConsole.classList.toggle("test-mode", isTestMode);
  coachConsole.classList.toggle("play-mode", isPlayMode);
  coachConsole.classList.toggle("play-unlocked", isPlayMode);
  coachConsole.classList.remove("test-results", "play-results");
  modeTitle.style.setProperty("--mode-offset", modeTitleOffset());
  modeTitle.setAttribute("aria-label", (isPlayMode ? "Play mode." : isTestMode ? "Test mode." : "Piano Rhythm Coach.") +
    (isPlayMode ? " Swipe right or press right arrow to return to test mode."
      : " Swipe left or press left arrow for test mode; swipe right or press right arrow for practice mode."));
  startPracticeButton.setAttribute("aria-label", isPlayMode ? "Start play mode" : isTestMode ? "Start test" : "Start practice");
  bpmSlider.disabled = isPlayMode;
  notesPerBeat.disabled = isPlayMode;
  totalNotes.disabled = isPlayMode;
  if (isPlayMode) {
    playState = createPlayState();
    expectedEvents = [];
    renderPlayMode();
  }
  window.syncMixer?.();
  practiceStatus.textContent = isPlayMode
    ? "Play mode: each four-beat pattern has a two-beat buffer. Every four loops adds 5 BPM."
    : isTestMode
    ? "Test mode: 4-beat count-in, then keep the rhythm without clicks."
    : "Practice mode: metronome and live timing chart.";
}

function switchModeBySwipe(left) {
  if (mode !== "idle" || isPracticeRunning) return;
  if (!left) {
    if (isPlayMode) setCoachMode("test");
    else if (isTestMode) setCoachMode("practice");
  } else if (isTestMode) {
    secretSwipeCount++;
    coachConsole.classList.toggle("play-unlocked", secretSwipeCount >= 2);
    if (secretSwipeCount === 3) setCoachMode("play");
  } else if (!isPlayMode) {
    setCoachMode("test");
  }
}

modeTitle.addEventListener("pointerdown", (event) => {
  if (!event.isPrimary || event.button !== 0 || mode !== "idle" || isPracticeRunning) return;
  const rect = modeTitle.getBoundingClientRect();
  const position = (rect.left - modeTitleTrack.getBoundingClientRect().left) / rect.width;
  titleSwipe = {
    x: event.clientX, y: event.clientY, id: event.pointerId,
    width: rect.width, position, startedAt: performance.now()
  };
  modeTitle.classList.add("is-swiping");
  modeTitle.style.setProperty("--mode-offset", `${-position * 100 / 3}%`);
  modeTitle.setPointerCapture(event.pointerId);
});
modeTitle.addEventListener("pointermove", (event) => {
  if (!titleSwipe || event.pointerId !== titleSwipe.id) return;
  const dx = event.clientX - titleSwipe.x;
  const dy = event.clientY - titleSwipe.y;
  if (Math.abs(dx) <= Math.abs(dy)) return;
  if (Math.abs(dx) >= 6) modeTitle.classList.add("is-swipe-moving");
  const position = titleSwipe.position - dx / titleSwipe.width;
  const lastPage = isPlayMode || secretSwipeCount >= 2 ? 2 : 1;
  const bounded = Math.max(0, Math.min(lastPage, position));
  const resisted = bounded + (position - bounded) * 0.18;
  modeTitle.style.setProperty("--mode-offset", `${-resisted * 100 / 3}%`);
});
modeTitle.addEventListener("pointerup", (event) => {
  if (!titleSwipe || event.pointerId !== titleSwipe.id) return;
  const dx = event.clientX - titleSwipe.x;
  const dy = event.clientY - titleSwipe.y;
  const elapsed = Math.max(1, performance.now() - titleSwipe.startedAt);
  const threshold = Math.min(80, titleSwipe.width * 0.22);
  const shouldSwitch = Math.abs(dx) >= threshold ||
    (Math.abs(dx) >= 32 && Math.abs(dx) / elapsed > 0.45);
  titleSwipe = null;
  modeTitle.classList.remove("is-swiping", "is-swipe-moving");
  modeTitle.style.setProperty("--mode-offset", modeTitleOffset());
  if (shouldSwitch && Math.abs(dx) > Math.abs(dy)) {
    switchModeBySwipe(dx < 0);
  }
});
["pointercancel", "lostpointercapture"].forEach((eventName) => {
  modeTitle.addEventListener(eventName, () => {
    if (!titleSwipe) return;
    titleSwipe = null;
    modeTitle.classList.remove("is-swiping", "is-swipe-moving");
    modeTitle.style.setProperty("--mode-offset", modeTitleOffset());
  });
});
modeTitle.addEventListener("keydown", (event) => {
  if (event.key === "ArrowLeft" || event.key === "ArrowRight") {
    event.preventDefault();
    if (!event.repeat) switchModeBySwipe(event.key === "ArrowLeft");
  }
});
let isPracticeRunning = false;
let practiceStartTime = 0;
let practiceTimer = null;
let playbackLightOffTimer = null;
let lastOnsetTime = 0;
let previousVolume = 0;

let onsetThreshold = 8;
let minimumGapMs = 75;
let timingWindowMs = 220;


const fluxThresholdFloor = 350;
const fluxMultiplier = 2.2;
const peakRatio = 1.2;
const fluxHistorySize = 24;

onsetThresholdSlider.addEventListener("input", () => {
  onsetThreshold = Number(onsetThresholdSlider.value);
  onsetThresholdValue.textContent = onsetThreshold.toFixed(1);
});

let mediaRecorder = null;
let audioChunks = [];
let microphoneStream = null;
let analyser = null;
let audioData = null;
let frequencyData = null;
let previousFrequencyData = null;
let previousFlux = 0;
let previousPreviousFlux = 0;
let pendingPeakFlux = 0;
let pendingPeakTime = 0;
let fluxHistory = [];
let dynamicFluxThreshold = 0;

async function startMicrophone() {
  try {
    microphoneStream = await navigator.mediaDevices.getUserMedia({
            audio: {
                    echoCancellation: false,
                    noiseSuppression: false,
                    autoGainControl: false
        }
    });

    if (!audioContext) {
      audioContext = new AudioContext();
    }
    if (audioContext.state === "suspended") {
      await audioContext.resume();
    }
    const microphoneSource =
      audioContext.createMediaStreamSource(microphoneStream);

    analyser = audioContext.createAnalyser();
    analyser.fftSize = 2048;
    analyser.smoothingTimeConstant = 0;

    audioData = new Uint8Array(analyser.fftSize);
    frequencyData = new Uint8Array(analyser.frequencyBinCount);
    previousFrequencyData = new Uint8Array(analyser.frequencyBinCount);

    microphoneSource.connect(analyser);

    micButton.disabled = false;

if (calibration) {
  micButton.textContent =
    `CAL: ${calibration.offsetMs >= 0 ? "+" : ""}` +
    `${calibration.offsetMs}ms · TAP TO RE-CALIBRATE`;
} else {
  micButton.textContent = "ADJUST LATENCY";
}
    micStatus.textContent = "Listening... play piano or clap";
    recordButton.disabled = false;
    recordStatus.textContent = "Ready to record";

    startPracticeButton.disabled = false;
practiceStatus.textContent =
  "Ready. Use earphones, then start practice.";

showVolume();
checkForPianoSound();
 } catch (error) {
  console.error(error);

  micStatus.textContent =
    `Microphone error: ${error.name} - ${error.message}`;
}
}

function showVolume() {
  analyser.getByteTimeDomainData(audioData);

  let total = 0;

  for (let i = 0; i < audioData.length; i++) {
    const difference = audioData[i] - 128;
    total += difference * difference;
  }

  const volume = Math.sqrt(total / audioData.length);
  const percentage = Math.min(volume * 3, 100);

  volumeBar.style.width = `${percentage}%`;

  requestAnimationFrame(showVolume);
}

micButton.addEventListener("click", () => {
  if (!microphoneStream) {
    startMicrophone();
    return;
  }

  if (mode === "calibrating" || isPracticeRunning) {
    return;
  }

  startCalibration();
});
function playClick() {
  if (!audioContext) {
    audioContext = new AudioContext();
  }

  const oscillator = audioContext.createOscillator();
  const gainNode = audioContext.createGain();

  oscillator.frequency.value = 1000;

  gainNode.gain.setValueAtTime(0.15, audioContext.currentTime);
  gainNode.gain.exponentialRampToValueAtTime(
    0.001,
    audioContext.currentTime + 0.05
  );

  oscillator.connect(gainNode);
  gainNode.connect(audioContext.destination);

  oscillator.start();
  oscillator.stop(audioContext.currentTime + 0.05);
}

function flashBeat() {
  beatLight.classList.add("active");

  setTimeout(() => {
    beatLight.classList.remove("active");
  }, 80);
}

function beat() {
  playClick();
  flashBeat();
}

function startMetronome() {
  const bpm = Number(bpmSlider.value);
  const intervalMs = 60000 / bpm;
  beat();
  metronomeTimer = setInterval(beat, intervalMs);

  startButton.disabled = true;
  stopButton.disabled = false;
  bpmSlider.disabled = true;
  status.textContent = `Playing at ${bpm} BPM`;
}

function stopMetronome() {
  clearInterval(metronomeTimer);
  metronomeTimer = null;

  startButton.disabled = false;
  stopButton.disabled = true;
  bpmSlider.disabled = false;
  status.textContent = "Stopped";
}

startButton.addEventListener("click", startMetronome);
stopButton.addEventListener("click", stopMetronome);
// =========================
// CALIBRATION MATH HELPERS
// =========================

function median(values) {
  if (values.length === 0) {
    return null;
  }

  const sorted = [...values].sort((a, b) => a - b);
  const middle = Math.floor(sorted.length / 2);

  if (sorted.length % 2 === 1) {
    return sorted[middle];
  }

  return (sorted[middle - 1] + sorted[middle]) / 2;
}


function calculateSlope(offsets) {
  const count = offsets.length;

  if (count < 2) {
    return 0;
  }

  let sumX = 0;
  let sumY = 0;
  let sumXY = 0;
  let sumXX = 0;

  offsets.forEach((offset, index) => {
    const x = index + 1;
    const y = offset;

    sumX += x;
    sumY += y;
    sumXY += x * y;
    sumXX += x * x;
  });

  const denominator = count * sumXX - sumX * sumX;

  if (denominator === 0) {
    return 0;
  }

  return (
    (count * sumXY - sumX * sumY) /
    denominator
  );
}


function findLatencyCluster(rawOffsets, radiusMs = CLUSTER_RADIUS_MS) {
  if (rawOffsets.length === 0) {
    return null;
  }

  let bestCluster = [];

  for (const center of rawOffsets) {
    const cluster = rawOffsets.filter((offset) => {
      return Math.abs(offset - center) <= radiusMs;
    });

    if (cluster.length > bestCluster.length) {
      bestCluster = cluster;
    }
  }

  if (bestCluster.length === 0) {
    return null;
  }

  const firstCenter = median(bestCluster);

  const absoluteDeviations = bestCluster.map((offset) => {
    return Math.abs(offset - firstCenter);
  });

  const mad = median(absoluteDeviations);

  const cleanupRadius = Math.max(25, mad * 3);

  const cleanedCluster = bestCluster.filter((offset) => {
    return Math.abs(offset - firstCenter) <= cleanupRadius;
  });

  const latencyMs = median(cleanedCluster);

  const spreadMs = median(
    cleanedCluster.map((offset) => {
      return Math.abs(offset - latencyMs);
    })
  );

  return {
    latencyMs: Math.round(latencyMs),
    members: cleanedCluster,
    validCount: cleanedCluster.length,
    totalCount: rawOffsets.length,
    consistency: cleanedCluster.length / rawOffsets.length,
    spreadMs: Math.round(spreadMs),
    slopeMsPerEvent: calculateSlope(cleanedCluster)
  };
}
// =========================
// CALIBRATION EVENT SCHEDULE
// =========================

function createCalibrationEvents() {
  const beatIntervalMs = 60000 / CALIBRATION_BPM;

  const countInMs =
    beatIntervalMs * CALIBRATION_COUNT_IN_BEATS;

  calibrationStartTime = performance.now();

  expectedEvents = [];

  for (
    let index = 0;
    index < CALIBRATION_NOTE_COUNT;
    index++
  ) {
    expectedEvents.push({
      number: index + 1,

      time:
        calibrationStartTime +
        countInMs +
        index * beatIntervalMs,

      detectedTime: null,
      rawOffsetMs: null,
      correctedOffsetMs: null,
      offsetMs: null,
      result: null,
      isClusterMember: false
    });
  }

  return {
    beatIntervalMs,
    countInMs
  };
}
function drawCalibrationResult({
  success,
  title,
  line1,
  line2,
  actionText
}) {
  const canvas = timingChart;
  const ctx = timingChartContext;
  const width = canvas.width / chartResolution;
  const height = canvas.height / chartResolution;

  const mainColor = success ? "#72ff9a" : "#f54444";
  const darkColor = success ? "#07140b" : "#180707";
  const gridColor = success
    ? "rgba(114, 255, 154, 0.12)"
    : "rgba(245, 68, 68, 0.14)";

  ctx.clearRect(0, 0, width, height);

  ctx.fillStyle = darkColor;
  ctx.fillRect(0, 0, width, height);

  ctx.strokeStyle = gridColor;
  ctx.lineWidth = 1;

  for (let x = 0; x < width; x += 24) {
    ctx.beginPath();
    ctx.moveTo(x, 0);
    ctx.lineTo(x, height);
    ctx.stroke();
  }

  for (let y = 0; y < height; y += 24) {
    ctx.beginPath();
    ctx.moveTo(0, y);
    ctx.lineTo(width, y);
    ctx.stroke();
  }

  ctx.strokeStyle = mainColor;
  ctx.lineWidth = 2;
  ctx.strokeRect(10, 10, width - 20, height - 20);

  ctx.fillStyle = mainColor;
  ctx.textAlign = "center";
  ctx.textBaseline = "middle";

  ctx.font = '800 24px "Doto", "Share Tech Mono", monospace';
  ctx.fillText(title, width / 2, 53);

  ctx.fillStyle = success
    ? "rgba(114, 255, 154, 0.85)"
    : "rgba(255, 155, 155, 0.88)";

  ctx.font = '800 14px "Doto", "Share Tech Mono", monospace';
  ctx.fillText(line1, width / 2, 88);
  ctx.fillText(line2, width / 2, 111);

  ctx.strokeStyle = mainColor;
  ctx.lineWidth = 1;
  ctx.beginPath();
  ctx.moveTo(40, 137);
  ctx.lineTo(width - 40, 137);
  ctx.stroke();

  ctx.fillStyle = mainColor;
  ctx.font = '800 12px "Doto", "Share Tech Mono", monospace';
  ctx.fillText(actionText, width / 2, 166);

  ctx.font = '800 11px "Doto", "Share Tech Mono", monospace';
  ctx.fillStyle = success
    ? "rgba(114, 255, 154, 0.65)"
    : "rgba(255, 155, 155, 0.65)";
  ctx.fillText(
    success ? "LATENCY PROFILE SAVED ON APPLY" : "NO CHANGES WERE SAVED",
    width / 2,
    178
  );
}
function startCalibrationMonitor() {
  if (calibrationMonitorFrame) {
    cancelAnimationFrame(calibrationMonitorFrame);
  }

  const draw = () => {
    if (mode !== "calibrating") {
      calibrationMonitorFrame = null;
      return;
    }

    drawCalibrationMonitor();
    calibrationMonitorFrame =
      requestAnimationFrame(draw);
  };

  draw();
}


function drawCalibrationMonitor() {
  const canvas = timingChart;
  const ctx = timingChartContext;
  const width = canvas.width / chartResolution;
  const height = canvas.height / chartResolution;
  const now = performance.now();

  const beatIntervalMs = 60000 / CALIBRATION_BPM;
  const countInMs =
    beatIntervalMs * CALIBRATION_COUNT_IN_BEATS;

  const elapsedMs = now - calibrationStartTime;
  const calibrationElapsedMs = elapsedMs - countInMs;

  const matchedCount = expectedEvents.filter((event) => {
    return event.result === "Matched";
  }).length;

  const missedCount = expectedEvents.filter((event) => {
    return event.result === "Missed";
  }).length;

  let headline = "";
  let subline = "";

  if (elapsedMs < countInMs) {
    const beatNumber = Math.min(
      CALIBRATION_COUNT_IN_BEATS,
      Math.floor(elapsedMs / beatIntervalMs) + 1
    );

    headline =
      `GET READY  ${beatNumber} / ${CALIBRATION_COUNT_IN_BEATS}`;

    subline =
      "COUNT-IN — PLAY WITH THE NEXT CLICKS";
  } else if (
    calibrationElapsedMs <
    CALIBRATION_NOTE_COUNT * beatIntervalMs
  ) {
    const noteNumber = Math.min(
      CALIBRATION_NOTE_COUNT,
      Math.floor(calibrationElapsedMs / beatIntervalMs) + 1
    );

    headline =
      `PLAY NOTE  ${noteNumber} / ${CALIBRATION_NOTE_COUNT}`;

    subline =
      `${matchedCount} MATCHED  •  ${missedCount} MISSED`;
  } else {
    headline = "ANALYSING CALIBRATION";
    subline = `${matchedCount} MATCHED NOTES`;
  }

  ctx.clearRect(0, 0, width, height);

  ctx.fillStyle = "#060706";
  ctx.fillRect(0, 0, width, height);

  ctx.strokeStyle = "rgba(114, 255, 154, 0.12)";
  ctx.lineWidth = 1;

  for (let x = 0; x < width; x += 24) {
    ctx.beginPath();
    ctx.moveTo(x, 0);
    ctx.lineTo(x, height);
    ctx.stroke();
  }

  for (let y = 0; y < height; y += 24) {
    ctx.beginPath();
    ctx.moveTo(0, y);
    ctx.lineTo(width, y);
    ctx.stroke();
  }

  ctx.textAlign = "center";
  ctx.textBaseline = "middle";

  ctx.fillStyle = "#72ff9a";
  ctx.font = '800 20px "Doto", "Share Tech Mono", monospace';
  ctx.fillText(headline, width / 2, 36);

  ctx.fillStyle = "rgba(114, 255, 154, 0.7)";
  ctx.font = '800 12px "Doto", "Share Tech Mono", monospace';
  ctx.fillText(subline, width / 2, 58);

  const startX = 23;
  const startY = 96;
  const gap = 5;
  const cellWidth =
    (width - startX * 2 - gap * (CALIBRATION_NOTE_COUNT - 1)) /
    CALIBRATION_NOTE_COUNT;
  const cellHeight = 44;

  expectedEvents.forEach((event, index) => {
    const x = startX + index * (cellWidth + gap);
    const isCurrent =
      elapsedMs >= countInMs &&
      Math.floor(calibrationElapsedMs / beatIntervalMs) === index;

    let fill = "#1b261e";
    let stroke = "rgba(114, 255, 154, 0.28)";

    if (event.result === "Matched") {
      fill = "#72ff9a";
      stroke = "#b5ffca";
    } else if (event.result === "Missed") {
      fill = "#8e3838";
      stroke = "#f54444";
    } else if (isCurrent) {
      fill = "#d9e9dc";
      stroke = "#72ff9a";
    }

    ctx.fillStyle = fill;
    ctx.fillRect(x, startY, cellWidth, cellHeight);

    ctx.strokeStyle = stroke;
    ctx.lineWidth = isCurrent ? 2 : 1;
    ctx.strokeRect(x, startY, cellWidth, cellHeight);

    ctx.fillStyle =
      event.result === "Matched" ? "#061006" : "#72ff9a";

    ctx.font = '800 10px "Doto", "Share Tech Mono", monospace';
    ctx.fillText(
      String(event.number).padStart(2, "0"),
      x + cellWidth / 2,
      startY + cellHeight + 14
    );
  });

  const totalWidth =
    CALIBRATION_NOTE_COUNT * cellWidth +
    (CALIBRATION_NOTE_COUNT - 1) * gap;

  const progress =
    Math.max(
      0,
      Math.min(
        1,
        calibrationElapsedMs /
          (CALIBRATION_NOTE_COUNT * beatIntervalMs)
      )
    );

  ctx.fillStyle = "#18311f";
  ctx.fillRect(startX, 169, totalWidth, 6);

  ctx.fillStyle = "#72ff9a";
  ctx.fillRect(
    startX,
    169,
    totalWidth * progress,
    6
  );

  ctx.fillStyle = "rgba(114, 255, 154, 0.7)";
  ctx.font = '800 11px "Doto", "Share Tech Mono", monospace';
  ctx.fillText(
    `INPUT ${matchedCount} / ${CALIBRATION_NOTE_COUNT}`,
    width / 2,
    190
  );
}
function startCalibration() {
  if (!microphoneStream || !previousFrequencyData) {
    console.log(
      "Calibration blocked: connect microphone first"
    );

    practiceStatus.textContent =
      "Please connect microphone first.";

    return;
  }

  const schedule = createCalibrationEvents();

  const {
    beatIntervalMs,
    countInMs
  } = schedule;

mode = "calibrating";
coachConsole.classList.remove("test-mode", "test-results", "play-mode", "play-results");

bpmMonitor.style.color = "#72ff9a";
bpmMonitor.style.textShadow =
  "0 0 6px rgba(114, 255, 154, 0.7)";startCalibrationMonitor();

practiceScore.textContent = "CALIBRATING";
micButton.disabled = true;
micButton.textContent = "CALIBRATING…";
  isPracticeRunning = false;

  lastOnsetTime = 0;
  previousFlux = 0;
  previousPreviousFlux = 0;
  pendingPeakFlux = 0;
  pendingPeakTime = 0;

  previousFrequencyData.fill(0);
  fluxHistory = [];
  dynamicFluxThreshold = 0;

  setTransportState({
  startEnabled: false,
  stopEnabled: false,
  startLight: false,
  stopLight: false
});

  practiceStatus.textContent =
    `Calibration: ${CALIBRATION_COUNT_IN_BEATS}-beat ` +
    `count-in, then play ${CALIBRATION_NOTE_COUNT} notes.`;

  console.log("Calibration started");
  console.log("Expected events:", expectedEvents);

  // 先播放 4 下 count-in。
  for (
    let beatNumber = 0;
    beatNumber < CALIBRATION_COUNT_IN_BEATS;
    beatNumber++
  ) {
    setTimeout(() => {
      beat();

      console.log(
        `Count-in ${beatNumber + 1} / ` +
        `${CALIBRATION_COUNT_IN_BEATS}`
      );
    }, beatNumber * beatIntervalMs);
  }

  // Count-in 後播放真正的 calibration clicks。
  for (
    let eventIndex = 0;
    eventIndex < CALIBRATION_NOTE_COUNT;
    eventIndex++
  ) {
    setTimeout(() => {
      beat();

      console.log(
        `Calibration click ${eventIndex + 1} / ` +
        `${CALIBRATION_NOTE_COUNT}`
      );
    }, countInMs + eventIndex * beatIntervalMs);
  }

  const totalDurationMs =
    countInMs +
    CALIBRATION_NOTE_COUNT * beatIntervalMs;

  calibrationTimer = setTimeout(() => {
    finishCalibrationSchedule();
  }, totalDurationMs + 300);
}


function finishCalibrationSchedule() {
  mode = "calibration-result";
  calibrationTimer = null;

  if (calibrationMonitorFrame) {
    cancelAnimationFrame(calibrationMonitorFrame);
    calibrationMonitorFrame = null;
  }

  const rawOffsets = expectedEvents
    .filter((event) => {
      return event.result === "Matched" &&
        event.rawOffsetMs !== null;
    })
    .map((event) => {
      return event.rawOffsetMs;
    });

  const cluster = findLatencyCluster(rawOffsets);

  if (!cluster) {
  console.log("Calibration failed: no matched notes");
drawCalibrationResult({
  success: false,
  title: "CALIBRATION FAILED",
  line1: "NO VALID NOTES DETECTED",
  line2: "CHECK MIC AND PLAY WITH THE CLICKS",
  actionText: "PRESS STOP TO RETRY"
});
bpmMonitor.style.color = "#f54444";
bpmMonitor.style.textShadow = "none";
bpmMonitor.textContent =
  `BPM ${String(CALIBRATION_BPM).padStart(3, "0")}`;
practiceScore.textContent = "FAILED";
  practiceStatus.textContent =
    "NO VALID NOTES — PRESS STOP TO RETRY";

  setTransportState({
    startText: "APPLY",
    stopText: "RETRY",
    startEnabled: false,
    stopEnabled: true,
    startLight: false,
    stopLight: true
  });

  micButton.disabled = true;
  micButton.textContent =
    "CALIBRATION INCONSISTENT";

  return;
}

  expectedEvents.forEach((event) => {
    event.isClusterMember = cluster.members.some((offset) => {
      return Math.abs(
        offset - event.rawOffsetMs
      ) < 0.5;
    });
  });

  const hasEnoughNotes =
    cluster.validCount >= MIN_VALID_CALIBRATION_NOTES;

  const hasGoodConsistency =
    cluster.consistency >= 0.65;

  const slope = cluster.slopeMsPerEvent;
  const MAX_CALIBRATION_SLOPE = 3;

const isDriftingTooMuch =
  Math.abs(slope) > MAX_CALIBRATION_SLOPE;

  console.log("Calibration cluster:", cluster);

  console.log(
    `Calibration checks: ` +
    `notes=${cluster.validCount}, ` +
    `consistency=${(cluster.consistency * 100).toFixed(0)}%, ` +
    `slope=${slope.toFixed(2)} ms/event`
  );

  if (
    !hasEnoughNotes ||
    !hasGoodConsistency ||
    isDriftingTooMuch
  ) {
    const reasons = [];

    if (!hasEnoughNotes) {
      reasons.push(
        `only ${cluster.validCount} stable notes`
      );
    }

    if (!hasGoodConsistency) {
      reasons.push("no clear main latency group");
    }

    if (isDriftingTooMuch) {
      reasons.push("timing drift is too large");
    }
    drawCalibrationResult({
  success: false,
  title: "CALIBRATION FAILED",
  line1: `${cluster.validCount}/${cluster.totalCount} NOTES CONSISTENT`,
  line2: reasons.join(" · ").toUpperCase(),
  actionText: "PRESS STOP TO RETRY"
});

practiceScore.textContent = "FAILED";

bpmMonitor.style.color = "#f54444";
bpmMonitor.style.textShadow = "none";
bpmMonitor.textContent = `BPM ${String(CALIBRATION_BPM).padStart(3, "0")}`;
    practiceStatus.textContent =
  "INCONSISTENT — PRESS STOP TO RETRY";

  setTransportState({
  startText: "APPLY",
  stopText: "RETRY",
  startEnabled: false,
  stopEnabled: true,
  startLight: false,
  stopLight: true
});

        console.log(
      "Calibration rejected:",
      reasons.join(", ")
    );

    micButton.disabled = true;
    micButton.textContent =
      "CALIBRATION INCONSISTENT";

    return;
  }

  pendingCalibration = {
  offsetMs: cluster.latencyMs,
  validCount: cluster.validCount,
  totalCount: cluster.totalCount,
  consistency: cluster.consistency,
  spreadMs: cluster.spreadMs,
  slopeMsPerEvent: slope,
  createdAt: new Date().toISOString()
};
drawCalibrationResult({
  success: true,
  title: "CALIBRATION READY",
  line1:
    `LATENCY ${pendingCalibration.offsetMs >= 0 ? "+" : ""}` +
    `${pendingCalibration.offsetMs} MS`,
  line2:
    `${pendingCalibration.validCount}/` +
    `${pendingCalibration.totalCount} NOTES VERIFIED`,
  actionText: "START: APPLY   •   STOP: RETRY"
});
bpmMonitor.style.color = "#72ff9a";
bpmMonitor.style.textShadow =
  "0 0 6px rgba(114, 255, 154, 0.7)";
practiceScore.textContent = "READY";
practiceStatus.textContent =
  `READY: ${pendingCalibration.offsetMs >= 0 ? "+" : ""}` +
  `${pendingCalibration.offsetMs} ms — ` +
  `PRESS START TO APPLY OR STOP TO RETRY`;

console.log(
  "Calibration ready to apply:",
  pendingCalibration
);

setTransportState({
  startText: "APPLY",
  stopText: "RETRY",
  startEnabled: true,
  stopEnabled: true,
  startLight: true,
  stopLight: true
});

micButton.disabled = true;
micButton.textContent = "CALIBRATION READY";
}
function setTransportState({
  startText = "START",
  stopText = "STOP",
  startEnabled = false,
  stopEnabled = false,
  startLight = false,
  stopLight = false
} = {}) {
  startLabel.textContent = startText;
  stopLabel.textContent = stopText;

  startPracticeButton.disabled = false;
  stopPracticeButton.disabled = false;

  startPracticeButton.classList.toggle("lamp-green", startEnabled);
  stopPracticeButton.classList.toggle("lamp-red", stopEnabled && stopLight);

  /*
    Calibration result press feedback.
  */
  startPracticeButton.classList.toggle(
    "calibration-apply-active",
    startLight
  );

  stopPracticeButton.classList.toggle(
    "calibration-retry-active",
    stopLight
  );
}


function flashTransport(button, className) {
  button.classList.add(className);

  setTimeout(() => {
    button.classList.remove(className);
  }, 140);

  setTimeout(() => {
    button.classList.add(className);
  }, 280);

  setTimeout(() => {
    button.classList.remove(className);
  }, 420);
}
function applyCalibration() {
  if (!pendingCalibration) {
    practiceStatus.textContent =
      "No calibration result ready to apply.";

    return;
  }

  calibration = {
    ...pendingCalibration,
    savedAt: new Date().toISOString()
  };

  localStorage.setItem(
    "pianoRhythmCalibration",
    JSON.stringify(calibration)
  );

  pendingCalibration = null;
  mode = "idle";
  setCoachMode(isPlayMode ? "play" : isTestMode ? "test" : "practice");

  practiceStatus.textContent =
    `Calibration applied: ` +
    `${calibration.offsetMs >= 0 ? "+" : ""}` +
    `${calibration.offsetMs} ms.`;

  micButton.textContent =
    `CAL: ${calibration.offsetMs >= 0 ? "+" : ""}` +
    `${calibration.offsetMs}ms · RE-CALIBRATE`;

  console.log("Calibration applied:", calibration);

  setMainControlsForPractice();
}

function setMainControlsForPractice() {
  setTransportState({
    startText: "START",
    stopText: "STOP",
    startEnabled: true,
    stopEnabled: false,
    startLight: false,
    stopLight: false
  });

  micButton.disabled = false;
}

function startRecording() {
  if (!microphoneStream) {
    recordStatus.textContent = "Connect microphone first.";
    return;
  }

  if (mediaRecorder && mediaRecorder.state === "recording") {
    return;
  }

  audioChunks = [];

  mediaRecorder = new MediaRecorder(microphoneStream);

  mediaRecorder.addEventListener("dataavailable", (event) => {
    if (event.data.size > 0) {
      audioChunks.push(event.data);
    }
  });

  mediaRecorder.addEventListener("stop", () => {
    const audioBlob = new Blob(audioChunks, {
      type: mediaRecorder.mimeType
    });

    const audioUrl = URL.createObjectURL(audioBlob);

    recordedAudio.src = audioUrl;
recordedAudio.load();

recordStatus.textContent = "Practice recording ready to play.";

/* 只有錄音 blob 已建立後，才亮起 PLAYBACK */
playbackButton.classList.remove("lamp-recording");
playbackButton.classList.add("lamp-green");
window.updateTransportLamps?.();
  });

  mediaRecorder.start();

  recordButton.disabled = true;
  stopRecordButton.disabled = true;
  recordStatus.textContent = "Recording practice...";
}

function stopRecording() {
  if (!mediaRecorder || mediaRecorder.state !== "recording") {
    return;
  }

  mediaRecorder.stop();

  recordButton.disabled = false;
  stopRecordButton.disabled = true;
  recordStatus.textContent = "Processing practice recording...";
}

recordButton.addEventListener("click", startRecording);
stopRecordButton.addEventListener("click", stopRecording);


function getCurrentVolume() {
  analyser.getByteTimeDomainData(audioData);

  let total = 0;

  for (let i = 0; i < audioData.length; i++) {
    const difference = audioData[i] - 128;
    total += difference * difference;
  }

  return Math.sqrt(total / audioData.length);
}
const pianoMinHz = 60;
const pianoMaxHz = 4200;
function getSpectralFlux() {
  analyser.getByteFrequencyData(frequencyData);

  const nyquistHz = audioContext.sampleRate / 2;
  const binHz = nyquistHz / frequencyData.length;

  const startBin = Math.max(
    2,
    Math.floor(pianoMinHz / binHz)
  );

  const endBin = Math.min(
    frequencyData.length - 1,
    Math.ceil(pianoMaxHz / binHz)
  );

  let flux = 0;

  for (let i = startBin; i <= endBin; i++) {
    const increase =
      frequencyData[i] - previousFrequencyData[i];

    if (increase > 0) {
      flux += increase;
    }
  }

  previousFrequencyData.set(frequencyData);

  return flux;
}

function createExpectedEvents() {
  const bpm = Number(bpmSlider.value);
  const subdivision = Number(notesPerBeat.value);
  const numberOfEvents = Number(totalNotes.value);

  const beatIntervalMs = 60000 / bpm;
  const noteIntervalMs = beatIntervalMs / subdivision;
  const countInMs = beatIntervalMs * 4;

  expectedEvents = [];

  for (let i = 0; i < numberOfEvents; i++) {
    expectedEvents.push({
      number: i + 1,
      time: practiceStartTime + countInMs + i * noteIntervalMs,
      detectedTime: null,
      offsetMs: null,
      result: null
    });
  }
}

function randomPlayPattern() {
  return Array.from({ length: 4 }, () => 1 + Math.floor(Math.random() * 4));
}

function createPlayState() {
  return {
    bpm: 60,
    pattern: randomPlayPattern(),
    nextPattern: randomPlayPattern(),
    completedLoops: 0,
    scheduledBeat: -4,
    currentBeat: -1,
    countInBeat: 0,
    bufferBeat: 0,
    nextBeatTime: 0,
    detectedNotes: 0,
    latestEvent: null
  };
}

function createPlayEvents(loopStartTime, pattern, bpm, loopNumber) {
  const beatIntervalMs = 60000 / bpm;
  pattern.forEach((count, beatIndex) => {
    const noteIntervalMs = beatIntervalMs / count;
    for (let noteIndex = 0; noteIndex < count; noteIndex++) {
      const time = loopStartTime + beatIndex * beatIntervalMs + noteIndex * noteIntervalMs;
      const previous = expectedEvents[expectedEvents.length - 1];
      const spacingMs = previous ? Math.min(noteIntervalMs, time - previous.time) : noteIntervalMs;
      expectedEvents.push({
        number: expectedEvents.length + 1,
        loop: loopNumber,
        beatIndex,
        time,
        timingWindowMs: Math.max(8, Math.min(spacingMs * 0.46, 180)),
        detectedTime: null,
        offsetMs: null,
        result: null
      });
    }
  });
}

function renderPlayMode() {
  if (!playState) return;
  const displayedPattern = playState.bufferBeat > 0 ? playState.nextPattern : playState.pattern;
  const displayedLoop = playState.completedLoops + 1;
  playDigits.forEach((digit, index) => {
    const text = String(displayedPattern[index]);
    if (digit.textContent !== text) digit.textContent = text;
    digit.classList.toggle("active", isPracticeRunning && playState.currentBeat === index);
    const beatEvents = expectedEvents.filter(event => event.loop === displayedLoop && event.beatIndex === index);
    const missed = beatEvents.some(event => event.result === "Missed");
    digit.classList.toggle("timing-missed", missed);
    digit.classList.toggle("timing-warning", !missed && beatEvents.some(event => event.result === "Early" || event.result === "Late"));
    digit.classList.toggle("timing-correct", beatEvents.length > 0 && beatEvents.every(event => event.result === "On Beat"));
  });
  const patternText = displayedPattern.join("");
  if (playState.announcedPattern !== patternText) {
    playPattern.setAttribute("aria-label", `Four beats: ${displayedPattern.join(", ")} notes per beat`);
    playState.announcedPattern = patternText;
  }
  playProgress.textContent = !isPracticeRunning
    ? "READY · 4-BEAT COUNT-IN"
    : playState.scheduledBeat <= 0
      ? `COUNT-IN ${playState.countInBeat} / 4`
      : playState.bufferBeat > 0 ? `BUFFER ${playState.bufferBeat} / 2`
        : `LOOP ${String(playState.completedLoops + 1).padStart(2, "0")} · LEVEL ${(playState.bpm - 60) / 5 + 1}`;
  playNext.textContent = `NEXT ${playState.nextPattern.join("")}`;
  const latest = playState.latestEvent;
  playFeedback.textContent = playState.bufferBeat > 0 ? "REST · PREPARE NEXT PATTERN" : !latest
    ? "EACH DIGIT = NOTES IN ONE BEAT"
    : latest.result === "Missed" ? "MISSED NOTE · KEEP GOING"
      : `${latest.result.toUpperCase()} ${latest.offsetMs >= 0 ? "+" : ""}${Math.round(latest.offsetMs)} MS`;
  bpmMonitor.textContent = `BPM ${String(playState.bpm).padStart(3, "0")}`;
  window.syncMixer?.();
}

function startPlayMode() {
  playState.nextBeatTime = practiceStartTime;
  advancePlayMode();
  playTimer = setInterval(advancePlayMode, 16);
}

function advancePlayMode() {
  if (!isPlayMode || !isPracticeRunning) return;
  const now = performance.now();
  while (playState.nextBeatTime <= now) {
    if (playState.scheduledBeat > 0 && playState.scheduledBeat % 6 === 0) {
      playState.bpm = 60 + Math.floor(playState.completedLoops / 4) * 5;
      playState.pattern = playState.nextPattern;
      playState.nextPattern = randomPlayPattern();
      const nextBpm = 60 + Math.floor((playState.completedLoops + 1) / 4) * 5;
      createPlayEvents(playState.nextBeatTime + 6 * 60000 / playState.bpm,
        playState.nextPattern, nextBpm, playState.completedLoops + 2);
    }
    const beatIntervalMs = 60000 / playState.bpm;
    minimumGapMs = Math.max(18, Math.min(beatIntervalMs / 4 * 0.22, 90));
    timingWindowMs = Math.max(10, Math.min(beatIntervalMs / 4 * 0.46, 180));
    if (playState.scheduledBeat < 0) {
      playState.countInBeat = playState.scheduledBeat + 5;
    } else {
      const beatInLoop = playState.scheduledBeat % 6;
      if (beatInLoop === 4) playState.completedLoops++;
      playState.currentBeat = beatInLoop < 4 ? beatInLoop : -1;
      playState.bufferBeat = beatInLoop >= 4 ? beatInLoop - 3 : 0;
    }
    // Delayed browser frames must not replay a burst of old clicks.
    if (now - playState.nextBeatTime < beatIntervalMs / 2) {
      beat();
      playbackButton.classList.add("beat-flash");
      clearTimeout(playbackLightOffTimer);
      playbackLightOffTimer = setTimeout(() => {
        playbackButton.classList.remove("beat-flash");
        playbackLightOffTimer = null;
      }, beatIntervalMs / 2);
    }
    playState.scheduledBeat++;
    playState.nextBeatTime += beatIntervalMs;
  }
  updatePracticeDisplay();
}

function checkForPianoSound() {
  const volume = getCurrentVolume();
  const flux = getSpectralFlux();
  const now = performance.now();

  fluxHistory.push(flux);

  if (fluxHistory.length > fluxHistorySize) {
    fluxHistory.shift();
  }

  const averageFlux =
    fluxHistory.reduce((sum, value) => sum + value, 0) /
    fluxHistory.length;

  dynamicFluxThreshold = Math.max(
    fluxThresholdFloor,
    averageFlux * fluxMultiplier
  );

  const isLocalPeak =
    previousFlux > previousPreviousFlux &&
    previousFlux >= flux;

  const isNewOnset =
    isLocalPeak &&
    previousFlux > dynamicFluxThreshold &&
    previousFlux > previousPreviousFlux * peakRatio &&
    volume > onsetThreshold &&
    now - lastOnsetTime > minimumGapMs;

  if (isNewOnset) {
    lastOnsetTime = pendingPeakTime || now;

    flashNoteLight(volume);

    if (mode === "calibrating") {
  matchCalibrationOnset(lastOnsetTime);
} else if (isPracticeRunning) {
  matchSoundToExpectedEvent(lastOnsetTime);
}
  }

  previousPreviousFlux = previousFlux;
  previousFlux = flux;
  pendingPeakFlux = flux;
  pendingPeakTime = now;

  requestAnimationFrame(checkForPianoSound);
}
function matchCalibrationOnset(soundTime) {
  let nextEvent = expectedEvents.find((event) => {
    return (
      event.detectedTime === null &&
      event.result === null
    );
  });

  while (
    nextEvent &&
    soundTime > nextEvent.time + CALIBRATION_WINDOW_MS
  ) {
    nextEvent.result = "Missed";

    console.log(
      `Calibration Event ${nextEvent.number}: Missed`
    );

    nextEvent = expectedEvents.find((event) => {
      return (
        event.detectedTime === null &&
        event.result === null
      );
    });
  }

  if (!nextEvent) {
    console.log(
      "Calibration onset ignored: no remaining events"
    );
    return;
  }

  const rawOffsetMs = soundTime - nextEvent.time;

  if (rawOffsetMs < -CALIBRATION_WINDOW_MS) {
    console.log(
      `Calibration onset ignored: ` +
      `${rawOffsetMs.toFixed(0)} ms too early`
    );
    return;
  }

  if (rawOffsetMs > CALIBRATION_WINDOW_MS) {
    console.log(
      `Calibration onset ignored: ` +
      `${rawOffsetMs.toFixed(0)} ms too late`
    );
    return;
  }

  nextEvent.detectedTime = soundTime;
  nextEvent.rawOffsetMs = rawOffsetMs;
  nextEvent.result = "Matched";

  console.log(
    `Calibration Event ${nextEvent.number}: ` +
    `${rawOffsetMs.toFixed(0)} ms`
  );
}
function matchSoundToExpectedEvent(soundTime) {
  const calibrationOffsetMs = calibration
    ? calibration.offsetMs
    : 0;

  const expectedSoundTime = (event) => {
    return event.time + calibrationOffsetMs;
  };

  let nextEvent = expectedEvents.find((event) => {
    return event.detectedTime === null &&
      event.result === null;
  });

  /*
    以「加了校準延遲後」的預期琴聲到達時間判斷是否 Missed。
    不能再直接用 event.time，否則藍牙延遲會令第一粒過早被判 Missed。
  */
  while (
    nextEvent &&
    soundTime > expectedSoundTime(nextEvent) + (nextEvent.timingWindowMs ?? timingWindowMs)
  ) {
    nextEvent.result = "Missed";

    nextEvent = expectedEvents.find((event) => {
      return event.detectedTime === null &&
        event.result === null;
    });
  }

  if (!nextEvent) {
    updatePracticeDisplay();
    return;
  }

  const rawDifference = soundTime - nextEvent.time;

  /*
    correctedDifference 是相對於「已補償後預期到達時間」的偏差。
    這個值才是折線圖、Early/Late、median 要使用的數值。
  */
  const correctedDifference =
    soundTime - expectedSoundTime(nextEvent);
  const eventWindowMs = nextEvent.timingWindowMs ?? timingWindowMs;

  if (correctedDifference < -eventWindowMs) {
    practiceStatus.textContent =
      "Onset ignored: too early for next event.";
    return;
  }

  if (correctedDifference > eventWindowMs) {
    practiceStatus.textContent =
      "Onset ignored: too late for next event.";
    return;
  }

  nextEvent.detectedTime = soundTime;
  nextEvent.rawOffsetMs = rawDifference;
  nextEvent.correctedOffsetMs = correctedDifference;
  nextEvent.offsetMs = correctedDifference;

  const onBeatRangeMs = Math.min(
    55,
    eventWindowMs * 0.55
  );

  if (correctedDifference < -onBeatRangeMs) {
    nextEvent.result = "Early";
  } else if (correctedDifference > onBeatRangeMs) {
    nextEvent.result = "Late";
  } else {
    nextEvent.result = "On Beat";
  }

  const correctedSign = correctedDifference >= 0
    ? "+"
    : "";

  const rawSign = rawDifference >= 0
    ? "+"
    : "";

  practiceStatus.textContent =
    `Event ${nextEvent.number}: ${nextEvent.result} ` +
    `${correctedSign}${correctedDifference.toFixed(0)} ms ` +
    `(raw: ${rawSign}${rawDifference.toFixed(0)} ms)`;

  updatePracticeDisplay();
}

function startPracticeMetronome() {
  const bpm = Number(bpmSlider.value);
  const intervalMs = 60000 / bpm;
  let countInBeats = 0;

  function practiceBeat() {
    if (isTestMode && countInBeats >= 4) {
      stopPracticeMetronome();
      return;
    }
    beat();
    countInBeats++;
    playbackButton.classList.add("beat-flash");
    clearTimeout(playbackLightOffTimer);
    playbackLightOffTimer = setTimeout(() => {
      playbackButton.classList.remove("beat-flash");
      playbackLightOffTimer = null;
    }, intervalMs / 2);
  }

  practiceBeat();
  practiceTimer = setInterval(practiceBeat, intervalMs);
}

function stopPracticeMetronome() {
  clearInterval(practiceTimer);
  practiceTimer = null;
  clearTimeout(playbackLightOffTimer);
  playbackLightOffTimer = null;
  playbackButton.classList.remove("beat-flash");
}

function startPractice() {
  if (isPracticeRunning || mode !== "idle") {
    return;
  }

  if (!microphoneStream) {
    practiceStatus.textContent = "Please connect microphone first.";
    return;
  }

  if (isPlayMode) playState = createPlayState();
  const bpm = isPlayMode ? playState.bpm : Number(bpmSlider.value);
  const subdivision = Number(notesPerBeat.value);
  const noteIntervalMs = 60000 / bpm / subdivision;
  const safetyGapMs = 18;

 minimumGapMs = Math.max(
  45,
  Math.min(noteIntervalMs * 0.22, 90)
);
timingWindowMs = Math.max(
  80,
  Math.min(noteIntervalMs * 0.46, 180)
);
  mode = "practice";
isPracticeRunning = true;
coachConsole.classList.toggle("test-mode", isTestMode);
coachConsole.classList.toggle("play-mode", isPlayMode);
coachConsole.classList.remove("test-results", "play-results");
/* Transport icon state: practice / recording */
startPracticeButton.classList.remove("lamp-green");
stopPracticeButton.classList.add("lamp-red");

playbackButton.classList.remove("lamp-green", "lamp-playing");
playbackButton.classList.add("lamp-recording");
recordedAudio.pause();
recordedAudio.removeAttribute("src");
recordedAudio.load();

window.updateTransportLamps?.();
  lastOnsetTime = 0;
  previousVolume = 0;
  previousFlux = 0;
  previousPreviousFlux = 0;
  pendingPeakFlux = 0;
  pendingPeakTime = 0;

  previousFrequencyData.fill(0);
  fluxHistory = [];
  dynamicFluxThreshold = 0;
  practiceStartTime = performance.now();

  if (isPlayMode) {
    expectedEvents = [];
    createPlayEvents(practiceStartTime + 4000, playState.pattern, 60, 1);
    // Prepare the next loop in advance so its first note can be matched early.
    createPlayEvents(practiceStartTime + 10000, playState.nextPattern, 60, 2);
  } else {
    createExpectedEvents();
  }
startRecording();
if (isPlayMode) startPlayMode();
else startPracticeMetronome();
if (isTestMode) {
  testProgressTimer = setInterval(updatePracticeDisplay, 25);
}


  bpmSlider.disabled = true;
  notesPerBeat.disabled = true;
  totalNotes.disabled = true;

  practiceResults.innerHTML = "";
  practiceScore.textContent = "Accuracy: 0%";
  drawTimingChart();
  practiceStatus.textContent =
    isPlayMode ? "4-beat count-in at 60 BPM, then follow the random pattern. Press STOP to finish." :
    `4-beat count-in, then play ${totalNotes.value} events at ` +
    `${bpm} BPM (${subdivision} notes per beat).` +
    (isTestMode ? " Keep the rhythm without clicks until the test ends." : "");

}

function stopPractice() {
  if (!isPracticeRunning) {
    return;
  }

  isPracticeRunning = false;
clearInterval(playTimer);
playTimer = null;
clearInterval(testProgressTimer);
testProgressTimer = null;
stopPracticeMetronome();
stopRecording();
  mode = "idle";
coachConsole.classList.toggle("test-results", isTestMode);
coachConsole.classList.toggle("play-results", isPlayMode);
/* Transport icon state: practice stopped */
startPracticeButton.classList.add("lamp-green");
stopPracticeButton.classList.remove("lamp-red");

playbackButton.classList.remove(
  "lamp-recording",
  "lamp-green",
  "lamp-playing"
);
window.updateTransportLamps?.();

  const now = performance.now();
const toleranceMs = timingWindowMs;
const calibrationOffsetMs = calibration
  ? calibration.offsetMs
  : 0;
  if (isPlayMode) {
    expectedEvents = expectedEvents.filter(event => event.result !== null || event.time + calibrationOffsetMs <= now);
  }

  for (const event of expectedEvents) {
    if (
      event.detectedTime === null &&
      now > event.time + calibrationOffsetMs + (event.timingWindowMs ?? toleranceMs)
    ) {
      event.result = "Missed";
    }
  }

  updatePracticeDisplay();

  const completedEvents = expectedEvents.filter(
    (event) => event.result !== null
  );

  const matchedEvents = expectedEvents.filter(
    (event) => event.detectedTime !== null
  );

  const accuracy =
    completedEvents.length === 0
      ? 0
      : (matchedEvents.length / completedEvents.length) * 100;

  practiceScore.textContent =
    `Accuracy: ${accuracy.toFixed(1)}% ` +
    `(${matchedEvents.length}/${completedEvents.length})`;

  practiceStatus.textContent =
    isPlayMode ? `Play mode stopped after ${playState.completedLoops} loops at ${playState.bpm} BPM.`
      : isTestMode ? "Test finished. Check your timing results."
      : "Practice stopped. Check each event below.";


  bpmSlider.disabled = isPlayMode;
  notesPerBeat.disabled = isPlayMode;
  totalNotes.disabled = isPlayMode;
}
function drawTimingChart() {
  if ((isTestMode || isPlayMode) && isPracticeRunning) return;
  const canvas = timingChart;
  const ctx = timingChartContext;
  const width = canvas.width / chartResolution;
  const height = canvas.height / chartResolution;

  const colors = {
    green: "#72ff9a",
    greenDim: "rgba(114, 255, 154, 0.58)",
    greenGrid: "rgba(114, 255, 154, 0.10)",
    greenLine: "rgba(114, 255, 154, 0.70)",
    early: "#f6c453",
    late: "#f54444",
    missed: "#f54444",
    screen: "#060706",
    pending: "rgba(114, 255, 154, 0.22)"
  };

  const allEvents = expectedEvents || [];
  const completedEvents = allEvents.filter((event) => {
    return event.result !== null;
  });

  const matchedEvents = completedEvents.filter((event) => {
    return event.detectedTime !== null &&
      event.offsetMs !== null;
  });

  const offsets = matchedEvents.map((event) => {
    return Math.abs(event.offsetMs);
  });

  const maxOffset = Math.max(timingWindowMs, ...offsets);
  const yLimit = Math.max(
    120,
    Math.ceil(maxOffset / 50) * 50
  );

  const padding = {
    top: 28,
    right: 12,
    bottom: 52,
    left: 44
  };

  const chartLeft = padding.left;
  const chartRight = width - padding.right;
  const chartTop = padding.top;
  const chartBottom = height - padding.bottom;
  const chartWidth = chartRight - chartLeft;
  const chartHeight = chartBottom - chartTop;
  const zeroY = chartTop + chartHeight / 2;

  const yForOffset = (offsetMs) => {
    return zeroY + (offsetMs / yLimit) * (chartHeight / 2);
  };

  const xForIndex = (index) => {
    if (allEvents.length <= 1) {
      return chartLeft + chartWidth / 2;
    }

    return chartLeft +
      (index / (allEvents.length - 1)) * chartWidth;
  };

  ctx.clearRect(0, 0, width, height);

  ctx.fillStyle = colors.screen;
  ctx.fillRect(0, 0, width, height);

  ctx.strokeStyle = colors.greenGrid;
  ctx.lineWidth = 1;

  for (let x = 0; x <= width; x += 24) {
    ctx.beginPath();
    ctx.moveTo(x, 0);
    ctx.lineTo(x, height);
    ctx.stroke();
  }

  for (let y = 0; y <= height; y += 24) {
    ctx.beginPath();
    ctx.moveTo(0, y);
    ctx.lineTo(width, y);
    ctx.stroke();
  }

  ctx.strokeStyle = "rgba(114, 255, 154, 0.18)";
  ctx.setLineDash([3, 3]);

  [chartTop, zeroY, chartBottom].forEach((y) => {
    ctx.beginPath();
    ctx.moveTo(chartLeft, y);
    ctx.lineTo(chartRight, y);
    ctx.stroke();
  });

  ctx.setLineDash([]);

  ctx.strokeStyle = colors.green;
  ctx.lineWidth = 1.5;
  ctx.beginPath();
  ctx.moveTo(chartLeft, zeroY);
  ctx.lineTo(chartRight, zeroY);
  ctx.stroke();

  ctx.textBaseline = "middle";
  ctx.textAlign = "left";

  ctx.fillStyle = colors.greenDim;
  ctx.font = '800 10px "Doto", "Share Tech Mono", monospace';
  ctx.fillText("EARLY", 3, chartTop + 7);
  ctx.fillText("ON", 3, zeroY - 6);
  ctx.fillText("BEAT", 3, zeroY + 6);
  ctx.fillText("LATE", 3, chartBottom - 6);

  ctx.textAlign = "left";
  ctx.fillStyle = colors.green;
  ctx.font = '800 12px "Doto", "Share Tech Mono", monospace';

  const monitorTitle = isPracticeRunning
    ? "PRACTICE TIMING"
    : "TIMING REVIEW";

  ctx.fillText(monitorTitle, chartLeft, 12);

  const currentEvent = allEvents.find((event) => {
    return event.result === null;
  });

  const headerRight = currentEvent
    ? `NEXT E${String(currentEvent.number).padStart(2, "0")}`
    : `${completedEvents.length}/${allEvents.length} COMPLETE`;

  ctx.textAlign = "right";
  ctx.fillStyle = colors.greenDim;
  ctx.font = '800 10px "Doto", "Share Tech Mono", monospace';
  ctx.fillText(headerRight, chartRight, 12);

  if (allEvents.length === 0) {
    ctx.textAlign = "center";
    ctx.textBaseline = "middle";
    ctx.fillStyle = colors.greenDim;
    ctx.font = '800 12px "Doto", "Share Tech Mono", monospace';
    ctx.fillText(
      "PRESS START TO BEGIN PRACTICE",
      width / 2,
      height / 2
    );
    return;
  }

  ctx.strokeStyle = colors.greenLine;
  ctx.lineWidth = allEvents.length > 30 ? 1 : 1.5;

  let previousPoint = null;

  allEvents.forEach((event, index) => {
    if (event.offsetMs === null) {
      previousPoint = null;
      return;
    }

    const x = xForIndex(index);
    const y = yForOffset(event.offsetMs);

    if (previousPoint) {
      ctx.beginPath();
      ctx.moveTo(previousPoint.x, previousPoint.y);
      ctx.lineTo(x, y);
      ctx.stroke();
    }

    previousPoint = { x, y };
  });

  const dotRadius = allEvents.length > 40
    ? 2
    : allEvents.length > 25
      ? 3
      : 4;

  const labelEvery = allEvents.length <= 16
    ? 1
    : allEvents.length <= 30
      ? 2
      : Math.ceil(allEvents.length / 8);

  allEvents.forEach((event, index) => {
    const x = xForIndex(index);
    const labelY = chartBottom + 11;
    const isLatest =
      event.result !== null &&
      index === completedEvents.length - 1;

    if (
      index === 0 ||
      index === allEvents.length - 1 ||
      index % labelEvery === 0
    ) {
      ctx.textAlign = "center";
      ctx.textBaseline = "middle";
      ctx.fillStyle = colors.greenDim;
      ctx.font = '800 10px "Doto", "Share Tech Mono", monospace';
      ctx.fillText(
        `E${String(event.number).padStart(2, "0")}`,
        x,
        labelY
      );
    }

    if (event.result === "Missed") {
      ctx.strokeStyle = colors.missed;
      ctx.lineWidth = 1.5;

      ctx.beginPath();
      ctx.moveTo(x - dotRadius, zeroY - dotRadius);
      ctx.lineTo(x + dotRadius, zeroY + dotRadius);
      ctx.moveTo(x + dotRadius, zeroY - dotRadius);
      ctx.lineTo(x - dotRadius, zeroY + dotRadius);
      ctx.stroke();

      return;
    }

    if (event.offsetMs === null) {
      ctx.strokeStyle = colors.pending;
      ctx.lineWidth = 1;

      ctx.beginPath();
      ctx.arc(x, zeroY, dotRadius, 0, Math.PI * 2);
      ctx.stroke();

      return;
    }

    const y = yForOffset(event.offsetMs);

    let pointColor = colors.green;

    if (event.result === "Early") {
      pointColor = colors.early;
    }

    if (event.result === "Late") {
      pointColor = colors.late;
    }

    ctx.beginPath();
    ctx.fillStyle = pointColor;
    ctx.arc(x, y, dotRadius, 0, Math.PI * 2);
    ctx.fill();

    if (isLatest && isPracticeRunning) {
      ctx.strokeStyle = "#edfdf1";
      ctx.lineWidth = 1;
      ctx.beginPath();
      ctx.arc(x, y, dotRadius + 2, 0, Math.PI * 2);
      ctx.stroke();
    }
  });

  const validOffsets = matchedEvents.map((event) => {
    return event.offsetMs;
  });

  const medianOffset = median(validOffsets);
  const accuracy = completedEvents.length > 0
    ? (matchedEvents.length / completedEvents.length) * 100
    : 0;

  const matchedText =
    `${matchedEvents.length}/${completedEvents.length} DETECTED`;

  let footerText = "";

  if (!isPracticeRunning && completedEvents.length > 0) {
    const medianText = medianOffset === null
      ? "NO OFFSET DATA"
      : `MEDIAN ${medianOffset >= 0 ? "+" : ""}` +
        `${Math.round(medianOffset)} MS`;

    footerText =
      `FINAL · ${accuracy.toFixed(1)}% · ` +
      `${matchedText} · ${medianText}`;
  } else if (completedEvents.length > 0) {
    const latestEvent =
      completedEvents[completedEvents.length - 1];

    if (latestEvent.result === "Missed") {
      footerText =
        `MISSED E${String(latestEvent.number).padStart(2, "0")} · ` +
        `${accuracy.toFixed(1)}%`;
    } else {
      const sign = latestEvent.offsetMs >= 0 ? "+" : "";

      footerText =
        `${latestEvent.result.toUpperCase()} · ` +
        `${sign}${Math.round(latestEvent.offsetMs)} MS · ` +
        `${accuracy.toFixed(1)}%`;
    }
  } else {
    footerText = "WAITING FOR FIRST NOTE";
  }

  ctx.textAlign = "center";
  ctx.textBaseline = "middle";
  ctx.fillStyle = colors.greenDim;
  ctx.font = '800 10px "Doto", "Share Tech Mono", monospace';
  ctx.fillText(footerText, width / 2, height - 24);
}
function updatePracticeDisplay() {
  const now = performance.now();
  const toleranceMs = timingWindowMs;
  const calibrationOffsetMs = calibration
    ? calibration.offsetMs
    : 0;

  for (const event of expectedEvents) {
    if (
      event.detectedTime === null &&
      now > event.time + calibrationOffsetMs + (event.timingWindowMs ?? toleranceMs) &&
      event.result === null
    ) {
      event.result = "Missed";
    }
  }

  const dueEvents = expectedEvents.filter(
    (event) => event.result !== null
  );

  if (isTestMode && isPracticeRunning) {
    if (expectedEvents.length > 0 && dueEvents.length === expectedEvents.length) {
      stopPractice();
    }
    return;
  }

  const matchedEvents = dueEvents.filter(
    (event) => event.detectedTime !== null
  );

  const accuracy =
    dueEvents.length === 0
      ? 0
      : (matchedEvents.length / dueEvents.length) * 100;

  practiceScore.textContent =
    `Accuracy: ${accuracy.toFixed(1)}% ` +
    `(${matchedEvents.length}/${dueEvents.length})`;

  if (isPlayMode && isPracticeRunning) {
    playState.detectedNotes = matchedEvents.length;
    playState.latestEvent = dueEvents[dueEvents.length - 1] || null;
    renderPlayMode();
    return;
  }

  practiceResults.innerHTML = "";

  for (const event of expectedEvents) {
    if (event.result === null) {
      continue;
    }

    const item = document.createElement("div");
    item.className =
      `result-item result-${event.result.toLowerCase().replace(" ", "-")}`;

    if (event.result === "Missed") {
      item.textContent = `Event ${event.number}: Missed`;
    } else {
      const sign = event.offsetMs > 0 ? "+" : "";
      item.textContent =
        `Event ${event.number}: ${event.result} ` +
        `(${sign}${event.offsetMs.toFixed(0)} ms)`;
    }

    practiceResults.appendChild(item);
  }
  if (isPracticeRunning) {
  practiceResults.scrollTop = practiceResults.scrollHeight;
}
drawTimingChart();
}
function flashNoteLight(volume) {
  noteLight.classList.add("active");

  detectionText.textContent =
    `Piano sound detected (volume: ${volume.toFixed(1)})`;

  setTimeout(() => {
    noteLight.classList.remove("active");
  }, 100);
}
startPracticeButton.addEventListener("click", () => {
  if (mode === "calibration-result") {
    flashTransport(
      startPracticeButton,
      "calibration-apply-flash"
    );

    setTimeout(() => {
      applyCalibration();
    }, 460);

    return;
  }

  startPractice();
});


stopPracticeButton.addEventListener("click", () => {
  if (mode === "calibration-result") {
    pendingCalibration = null;

    flashTransport(
      stopPracticeButton,
      "calibration-retry-flash"
    );

    setTimeout(() => {
      startCalibration();
    }, 460);

    return;
  }

  stopPractice();
});

startPracticeButton.classList.add("lamp-green");
