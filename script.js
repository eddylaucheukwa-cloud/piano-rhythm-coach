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
const CALIBRATION_WINDOW_MS = 1000;
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
const startPracticeButton =
  document.getElementById("startPracticeButton");
const stopPracticeButton =
  document.getElementById("stopPracticeButton");
const startLabel = document.getElementById("startLabel");
const stopLabel = document.getElementById("stopLabel");
const practiceStatus = document.getElementById("practiceStatus");
const practiceScore = document.getElementById("practiceScore");
const practiceResults = document.getElementById("practiceResults");
const timingChart = document.getElementById("timingChart");
const timingChartContext = timingChart.getContext("2d");
let isPracticeRunning = false;
let practiceStartTime = 0;
let practiceTimer = null;
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

  if (mode === "calibrating") {
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
  const width = canvas.width;
  const height = canvas.height;

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

  ctx.font = '22px "Share Tech Mono", monospace';
  ctx.fillText(title, width / 2, 53);

  ctx.fillStyle = success
    ? "rgba(114, 255, 154, 0.85)"
    : "rgba(255, 155, 155, 0.88)";

  ctx.font = '12px "Share Tech Mono", monospace';
  ctx.fillText(line1, width / 2, 88);
  ctx.fillText(line2, width / 2, 111);

  ctx.strokeStyle = mainColor;
  ctx.lineWidth = 1;
  ctx.beginPath();
  ctx.moveTo(40, 137);
  ctx.lineTo(width - 40, 137);
  ctx.stroke();

  ctx.fillStyle = mainColor;
  ctx.font = '11px "Share Tech Mono", monospace';
  ctx.fillText(actionText, width / 2, 166);

  ctx.font = '9px "Share Tech Mono", monospace';
  ctx.fillStyle = success
    ? "rgba(114, 255, 154, 0.65)"
    : "rgba(255, 155, 155, 0.65)";
  ctx.fillText(
    success ? "LATENCY PROFILE SAVED ON APPLY" : "NO CHANGES WERE SAVED",
    width / 2,
    187
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
  const width = canvas.width;
  const height = canvas.height;
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
  ctx.font = '18px "Share Tech Mono", monospace';
  ctx.fillText(headline, width / 2, 36);

  ctx.fillStyle = "rgba(114, 255, 154, 0.7)";
  ctx.font = '10px "Share Tech Mono", monospace';
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

    ctx.font = '8px "Share Tech Mono", monospace';
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
  ctx.font = '9px "Share Tech Mono", monospace';
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

  startPracticeButton.disabled = !startEnabled;
  stopPracticeButton.disabled = !stopEnabled;

  /*
    START / APPLY = 紅燈 class
    STOP / RETRY  = 綠燈 class
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
  let nextEvent = expectedEvents.find(
    (event) => event.detectedTime === null &&
      event.result === null
  );

  /*
    如果現在已超過某個 event 的可接受時間，
    先將它標記為 Missed，然後繼續找下一粒。
    否則一旦漏掉第一粒，整個 sequence 就會卡住。
  */
  while (
    nextEvent &&
    soundTime > nextEvent.time + timingWindowMs
  ) {
    nextEvent.result = "Missed";

    nextEvent = expectedEvents.find(
      (event) => event.detectedTime === null &&
        event.result === null
    );
  }

  if (!nextEvent) {
    updatePracticeDisplay();
    return;
  }

  const difference = soundTime - nextEvent.time;

  /*
    太早的聲音通常是上一粒音的泛音／殘響，
    或是 count-in 前的聲音；忽略它，
    但不要將下一個真正 event 標示為 Missed。
  */
  if (difference < -timingWindowMs) {
    practiceStatus.textContent =
      "Onset ignored: too early for next event.";
    return;
  }

  /*
    理論上 while 已處理過太遲情況；
    保留這一層，避免極端 timing 狀況。
  */
  if (difference > timingWindowMs) {
    practiceStatus.textContent =
      "Onset ignored: too late for next event.";
    return;
  }

  nextEvent.detectedTime = soundTime;

const calibrationOffsetMs = calibration
  ? calibration.offsetMs
  : 0;

const correctedDifference =
  difference - calibrationOffsetMs;

nextEvent.rawOffsetMs = difference;
nextEvent.correctedOffsetMs = correctedDifference;

// 保持現有 chart 和 result list 正常；
// 它們目前會讀取 offsetMs。
nextEvent.offsetMs = correctedDifference;

  const onBeatRangeMs = Math.min(
  55,
  timingWindowMs * 0.55
);

if (correctedDifference < -onBeatRangeMs) {
  nextEvent.result = "Early";
} else if (correctedDifference > onBeatRangeMs) {
  nextEvent.result = "Late";
} else {
  nextEvent.result = "On Beat";
}

  const sign = correctedDifference >= 0 ? "+" : "";

practiceStatus.textContent =
  `Event ${nextEvent.number}: ` +
  `${sign}${correctedDifference.toFixed(0)} ms ` +
  `(raw: ${difference >= 0 ? "+" : ""}` +
  `${difference.toFixed(0)} ms)`;

  updatePracticeDisplay();
}

function startPracticeMetronome() {
  const bpm = Number(bpmSlider.value);
  const intervalMs = 60000 / bpm;

  beat();
  practiceTimer = setInterval(beat, intervalMs);
}

function stopPracticeMetronome() {
  clearInterval(practiceTimer);
  practiceTimer = null;
}

function startPractice() {
  if (!microphoneStream) {
    practiceStatus.textContent = "Please connect microphone first.";
    return;
  }

  const bpm = Number(bpmSlider.value);
  const subdivision = Number(notesPerBeat.value);
  const noteIntervalMs = 60000 / bpm / subdivision;
  const safetyGapMs = 18;

 minimumGapMs = Math.max(
  45,
  Math.min(noteIntervalMs * 0.22, 90)
);

timingWindowMs = Math.max(
  80,
  Math.min(noteIntervalMs * 0.38, 220)
);
  mode = "practice";
  isPracticeRunning = true;
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

  createExpectedEvents();
startRecording();
startPracticeMetronome();

  startPracticeButton.disabled = true;
  stopPracticeButton.disabled = false;
  bpmSlider.disabled = true;
  notesPerBeat.disabled = true;
  totalNotes.disabled = true;

  practiceResults.innerHTML = "";
  practiceScore.textContent = "Accuracy: 0%";
  drawTimingChart();
  practiceStatus.textContent =
    `4-beat count-in, then play ${totalNotes.value} events at ` +
    `${bpm} BPM (${subdivision} notes per beat).`;

}

function stopPractice() {
  if (!isPracticeRunning) {
    return;
  }

  isPracticeRunning = false;
stopPracticeMetronome();
stopRecording();

  const now = performance.now();
  const toleranceMs = timingWindowMs;

  for (const event of expectedEvents) {
    if (
      event.detectedTime === null &&
      now > event.time + toleranceMs
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
    "Practice stopped. Check each event below.";

  startPracticeButton.disabled = false;
  stopPracticeButton.disabled = true;
  bpmSlider.disabled = false;
  notesPerBeat.disabled = false;
  totalNotes.disabled = false;
}
function drawTimingChart() {
  const canvas = timingChart;
  const ctx = timingChartContext;

  const width = canvas.width;
  const height = canvas.height;

  const padding = {
    top: 20,
    right: 16,
    bottom: 32,
    left: 48
  };

  const chartWidth = width - padding.left - padding.right;
  const chartHeight = height - padding.top - padding.bottom;

  const visibleEvents = expectedEvents.filter(
    (event) => event.result !== null
  );

  const maxOffset = Math.max(
    timingWindowMs,
    ...visibleEvents
      .filter((event) => event.offsetMs !== null)
      .map((event) => Math.abs(event.offsetMs))
  );

  const yLimit = Math.max(200, Math.ceil(maxOffset / 50) * 50);
  const yToCanvas = (value) =>
    padding.top + ((yLimit - value) / (yLimit * 2)) * chartHeight;

  ctx.clearRect(0, 0, width, height);

  ctx.font = "11px Arial";
  ctx.textAlign = "right";
  ctx.textBaseline = "middle";

  const gridValues = [-yLimit, -yLimit / 2, 0, yLimit / 2, yLimit];

  for (const value of gridValues) {
    const y = yToCanvas(value);

    ctx.beginPath();
    ctx.strokeStyle = value === 0 ? "#64748b" : "#e2e8f0";
    ctx.lineWidth = value === 0 ? 1.5 : 1;
    ctx.setLineDash(value === 0 ? [4, 4] : []);
    ctx.moveTo(padding.left, y);
    ctx.lineTo(width - padding.right, y);
    ctx.stroke();

    ctx.fillStyle = "#64748b";
    ctx.fillText(`${value} ms`, padding.left - 6, y);
  }

  ctx.setLineDash([]);

  if (visibleEvents.length === 0) {
    ctx.fillStyle = "#64748b";
    ctx.font = "13px Arial";
    ctx.textAlign = "center";
    ctx.fillText(
      "Play a note to see timing data",
      width / 2,
      height / 2
    );
    return;
  }

  const xForIndex = (index) => {
    if (visibleEvents.length === 1) {
      return padding.left + chartWidth / 2;
    }

    return (
      padding.left +
      (index / (visibleEvents.length - 1)) * chartWidth
    );
  };

  const matchedEvents = visibleEvents.filter(
    (event) => event.offsetMs !== null
  );

  if (matchedEvents.length > 1) {
    ctx.beginPath();
    ctx.strokeStyle = "#94a3b8";
    ctx.lineWidth = 2;

    let started = false;

    visibleEvents.forEach((event, index) => {
      if (event.offsetMs === null) {
        started = false;
        return;
      }

      const x = xForIndex(index);
      const y = yToCanvas(event.offsetMs);

      if (!started) {
        ctx.moveTo(x, y);
        started = true;
      } else {
        ctx.lineTo(x, y);
      }
    });

    ctx.stroke();
  }

  visibleEvents.forEach((event, index) => {
    const x = xForIndex(index);

    ctx.textAlign = "center";
    ctx.textBaseline = "top";
    ctx.fillStyle = "#64748b";
    ctx.font = "11px Arial";
    ctx.fillText(`E${event.number}`, x, height - padding.bottom + 9);

    if (event.result === "Missed") {
      const y = yToCanvas(0);

      ctx.strokeStyle = "#64748b";
      ctx.lineWidth = 2;
      ctx.beginPath();
      ctx.moveTo(x - 5, y - 5);
      ctx.lineTo(x + 5, y + 5);
      ctx.moveTo(x + 5, y - 5);
      ctx.lineTo(x - 5, y + 5);
      ctx.stroke();
      return;
    }

    if (event.offsetMs === null) {
      return;
    }

    const y = yToCanvas(event.offsetMs);

    const pointColor =
      event.result === "On Beat"
        ? "#22c55e"
        : event.result === "Early"
          ? "#f59e0b"
          : "#ef4444";

    ctx.beginPath();
    ctx.fillStyle = pointColor;
    ctx.arc(x, y, 5, 0, Math.PI * 2);
    ctx.fill();

    ctx.strokeStyle = "#ffffff";
    ctx.lineWidth = 2;
    ctx.stroke();
  });
}
function updatePracticeDisplay() {
  const now = performance.now();
  const toleranceMs = timingWindowMs;

  for (const event of expectedEvents) {
    if (
      event.detectedTime === null &&
      now > event.time + toleranceMs &&
      event.result === null
    ) {
      event.result = "Missed";
    }
  }

  const dueEvents = expectedEvents.filter(
    (event) => event.result !== null
  );

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
