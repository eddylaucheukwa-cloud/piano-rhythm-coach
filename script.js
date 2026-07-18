const bpmSlider = document.getElementById("bpm");
const bpmValue = document.getElementById("bpmValue");
const startButton = document.getElementById("startButton");
const stopButton = document.getElementById("stopButton");
const beatLight = document.getElementById("beatLight");
const status = document.getElementById("status");

let metronomeTimer = null;
let audioContext = null;

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
const practiceStatus = document.getElementById("practiceStatus");
const practiceScore = document.getElementById("practiceScore");
const practiceResults = document.getElementById("practiceResults");
const timingChart = document.getElementById("timingChart");
const timingChartContext = timingChart.getContext("2d");

let isPracticeRunning = false;
let expectedEvents = [];
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

    micButton.disabled = true;
    micButton.textContent = "Microphone Connected";
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

micButton.addEventListener("click", startMicrophone);

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

    if (isPracticeRunning) {
      matchSoundToExpectedEvent(lastOnsetTime);
    }
  }

  previousPreviousFlux = previousFlux;
  previousFlux = flux;
  pendingPeakFlux = flux;
  pendingPeakTime = now;

  requestAnimationFrame(checkForPianoSound);
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
  nextEvent.offsetMs = difference;

  const onBeatRangeMs = Math.min(
    55,
    timingWindowMs * 0.55
  );

  if (difference < -onBeatRangeMs) {
    nextEvent.result = "Early";
  } else if (difference > onBeatRangeMs) {
    nextEvent.result = "Late";
  } else {
    nextEvent.result = "On Beat";
  }

  practiceStatus.textContent =
    `Matched Event ${nextEvent.number}: ` +
    `${difference.toFixed(0)} ms`;

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
startPracticeButton.addEventListener("click", startPractice);
stopPracticeButton.addEventListener("click", stopPractice);
