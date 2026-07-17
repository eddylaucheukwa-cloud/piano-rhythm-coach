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
function getSpectralFlux() {
  analyser.getByteFrequencyData(frequencyData);

  let flux = 0;

  for (let i = 2; i < frequencyData.length; i++) {
    const increase = frequencyData[i] - previousFrequencyData[i];

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
  const toleranceMs = timingWindowMs;

  let closestEvent = null;
  let smallestDifference = Infinity;

  for (const event of expectedEvents) {
    if (event.detectedTime !== null) {
      continue;
    }

    const difference = Math.abs(soundTime - event.time);

    if (difference <= toleranceMs && difference < smallestDifference) {
      closestEvent = event;
      smallestDifference = difference;
    }
  }

  if (!closestEvent) {
    practiceStatus.textContent =
      "Piano sound detected, but it was outside the timing window.";
    return;
  }

  closestEvent.detectedTime = soundTime;
  closestEvent.offsetMs = soundTime - closestEvent.time;
  const onBeatRangeMs = Math.min(120, timingWindowMs * 0.6);

  if (closestEvent.offsetMs < -onBeatRangeMs) {
    closestEvent.result = "Early";
  } else if (closestEvent.offsetMs > onBeatRangeMs) {
    closestEvent.result = "Late";
  } else {
    closestEvent.result = "On Beat";
  }

  practiceStatus.textContent =
    `Matched Event ${closestEvent.number}: ` +
    `${closestEvent.offsetMs.toFixed(0)} ms`;

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

minimumGapMs = Math.max(
  40,
  Math.min(noteIntervalMs * 0.3, 140)
);

timingWindowMs = Math.max(
  100,
  Math.min(noteIntervalMs * 0.35, 220)
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
