const rhythmValue = document.getElementById("rhythmValue");
const eventValue = document.getElementById("eventValue");
const tempoKnob = document.getElementById("tempoKnob");
const notch = document.getElementById("knobNotch");
const wheel = document.getElementById("notesWheel");
const playback = document.getElementById("playbackButton");
const audio = document.getElementById("recordedAudio");
const fader = document.getElementById("sensitivityHandle");
const bpmMonitor = document.getElementById("bpmMonitor");

const MIN = 40;
const MAX = 180;
const START = -135;
const END = 135;

function animateNumber(element, direction) {
  element.classList.remove("roll-up", "roll-down");
  void element.offsetWidth;
  element.classList.add(direction > 0 ? "roll-up" : "roll-down");
}

function syncMixer() {
  const bpm = Number(bpmSlider.value);
  const ratio = (bpm - MIN) / (MAX - MIN);
  const angle = START + ratio * (END - START);

  const radians = (angle * Math.PI) / 180;
const radius = 78;

const circleX = 100 + Math.sin(radians) * radius;
const circleY = 100 - Math.cos(radians) * radius;

notch.style.left = `${circleX - 11}px`;
notch.style.top = `${circleY - 11}px`;
  tempoKnob.setAttribute("aria-valuenow", bpm);
  tempoKnob.setAttribute("aria-label", `Tempo, ${bpm} BPM`);

  if (bpmMonitor) {
    bpmMonitor.textContent = `BPM ${String(bpm).padStart(3, "0")}`;
  }

  rhythmValue.textContent = String(notesPerBeat.value).padStart(2, "0");
  eventValue.textContent = String(totalNotes.value).padStart(2, "0");

  const threshold = Number(onsetThresholdSlider.value);
  const top = 230 - ((threshold - 1) / 29) * 230;
  fader.style.top = `${top}px`;
}

function setTempo(value) {
  bpmSlider.value = Math.max(MIN, Math.min(MAX, Math.round(value)));
  bpmSlider.dispatchEvent(new Event("input"));
  syncMixer();
}

function changeRhythm(delta) {
  const current = Number(notesPerBeat.value);
  const next = Math.max(1, Math.min(4, current + delta));

  if (next === current) return;

  notesPerBeat.value = next;
  notesPerBeat.dispatchEvent(new Event("input"));
  animateNumber(rhythmValue, delta);
  syncMixer();
}
// NOTES wheel：限制震動頻率，避免連續移動時互相中斷
let lastNotesHapticTime = 0;

function notesHapticFeedback() {
  const now = Date.now();

  // 最少相隔 80ms；快速滑動時仍有明顯卡點，不會震動互相取消
  if (now - lastNotesHapticTime < 80) {
    return;
  }

  haptic(25);
  lastNotesHapticTime = now;
}
function changeNotes(delta) {
  const current = Number(totalNotes.value);
  const next = Math.max(1, Math.min(100, current + delta));

  if (next === current) return;

  totalNotes.value = next;
  totalNotes.dispatchEvent(new Event("input"));
notesHapticFeedback();
animateNumber(eventValue, delta);

  wheel.classList.remove("bump-up", "bump-down");
  void wheel.offsetWidth;
  wheel.classList.add(delta > 0 ? "bump-up" : "bump-down");
  syncMixer();
}

document.getElementById("rhythmUp").addEventListener("click", () => {
  changeRhythm(1);
});

document.getElementById("rhythmDown").addEventListener("click", () => {
  changeRhythm(-1);
});

function getPointerAngle(event, element) {
  const rect = element.getBoundingClientRect();
  const x = event.clientX - (rect.left + rect.width / 2);
  const y = event.clientY - (rect.top + rect.height / 2);
  return Math.atan2(y, x) * (180 / Math.PI);
}

let tempoDragActive = false;
let lastTempoPointerAngle = 0;

tempoKnob.addEventListener("pointerdown", (event) => {
  event.preventDefault();
  tempoDragActive = true;
  lastTempoPointerAngle = getPointerAngle(event, tempoKnob);
  tempoKnob.setPointerCapture(event.pointerId);
});

tempoKnob.addEventListener("pointermove", (event) => {
  if (!tempoDragActive) return;

  const currentAngle = getPointerAngle(event, tempoKnob);
  let deltaAngle = currentAngle - lastTempoPointerAngle;

  if (deltaAngle > 180) deltaAngle -= 360;
  if (deltaAngle < -180) deltaAngle += 360;

  // Clockwise increases BPM; counter-clockwise decreases BPM.
  const bpmPerDegree = (MAX - MIN) / 270;
  setTempo(Number(bpmSlider.value) + deltaAngle * bpmPerDegree);

  lastTempoPointerAngle = currentAngle;
});

["pointerup", "pointercancel", "lostpointercapture"].forEach((eventName) => {
  tempoKnob.addEventListener(eventName, () => {
    tempoDragActive = false;
  });
});

tempoKnob.addEventListener("keydown", (event) => {
  if (event.key === "ArrowUp" || event.key === "ArrowRight") {
    event.preventDefault();
    setTempo(Number(bpmSlider.value) + 1);
  }

  if (event.key === "ArrowDown" || event.key === "ArrowLeft") {
    event.preventDefault();
    setTempo(Number(bpmSlider.value) - 1);
  }
});

let wheelStartY;
let wheelStartValue;

wheel.addEventListener("pointerdown", (event) => {
  wheelStartY = event.clientY;
  wheelStartValue = Number(totalNotes.value);
  wheel.setPointerCapture(event.pointerId);
});

wheel.addEventListener("pointermove", (event) => {
  if (wheelStartY === undefined) return;

  const next = Math.max(
    1,
    Math.min(100, wheelStartValue + Math.trunc((wheelStartY - event.clientY) / 16))
  );

  changeNotes(next - Number(totalNotes.value));
});

["pointerup", "pointercancel"].forEach((eventName) => {
  wheel.addEventListener(eventName, () => {
    wheelStartY = undefined;
  });
});

// =========================
// SENSITIVITY FADER
// Mobile-friendly absolute drag
// =========================

const sensitivityTrack = document.querySelector(".fader");

function setSensitivityFromPointer(event) {
  event.preventDefault();

  const trackRect = sensitivityTrack.getBoundingClientRect();

  // 手指在滑軌內的位置：上方是 1，下方是 0
  let position = (event.clientY - trackRect.top) / trackRect.height;
  position = Math.max(0, Math.min(1, position));

  // 上推：threshold 增加；下拉：threshold 減少
  const threshold = 30 - position * 29;

  onsetThresholdSlider.value = threshold.toFixed(1);
  onsetThresholdSlider.dispatchEvent(new Event("input"));

  syncMixer();
}

function beginSensitivityDrag(event) {
  event.preventDefault();

  sensitivityTrack.setPointerCapture(event.pointerId);
  setSensitivityFromPointer(event);
}

/* 可按黑色滑軌或銀色滑塊後直接拖動 */
sensitivityTrack.addEventListener("pointerdown", beginSensitivityDrag);
sensitivityTrack.addEventListener("pointermove", (event) => {
  if (sensitivityTrack.hasPointerCapture(event.pointerId)) {
    setSensitivityFromPointer(event);
  }
});

["pointerup", "pointercancel", "lostpointercapture"].forEach((eventName) => {
  sensitivityTrack.addEventListener(eventName, () => {
    // Pointer capture 結束後不需再更新
  });
});

playback.addEventListener("click", () => {
  if (!audio.src) return;

  if (audio.paused) {
    audio.play();
  } else {
    audio.pause();
  }
});

audio.addEventListener("play", () => {
  playback.classList.add("playing");
});

["pause", "ended"].forEach((eventName) => {
  audio.addEventListener(eventName, () => {
    playback.classList.remove("playing");
  });
});

startPracticeButton.addEventListener("click", () => {
  playback.disabled = true;
  audio.pause();
  audio.removeAttribute("src");
});

stopPracticeButton.addEventListener("click", () => {
  setTimeout(() => {
    if (audio.src) {
      playback.disabled = false;
    }
  }, 400);
});

bpmSlider.addEventListener("input", syncMixer);
notesPerBeat.addEventListener("input", syncMixer);
totalNotes.addEventListener("input", syncMixer);
onsetThresholdSlider.addEventListener("input", syncMixer);
// =========================
// MOBILE HAPTIC FEEDBACK
// =========================

function haptic(pattern) {
  const supportsVibrationAPI =
    "vibrate" in navigator &&
    typeof navigator.vibrate === "function";

  if (!supportsVibrationAPI) {
    return false;
  }

  return navigator.vibrate(pattern);
}

/* ---------- TEMPO：夾萬轉盤卡點 ---------- */

let lastTempoHapticStep = Math.round(Number(bpmSlider.value) / 5);
function tempoHaptic() {
  // 每 2 BPM 一格卡點
  const currentStep = Math.round(Number(bpmSlider.value) / 5);

  if (currentStep === lastTempoHapticStep) return;

  const distance = Math.abs(currentStep - lastTempoHapticStep);

  // 快速轉動：較強的雙卡點，像夾萬轉盤
  if (distance >= 2) {
    haptic([10, 14, 10]);
  } else {
    // 慢慢扭：每格有清晰一下卡點
    haptic(8);
  }

  lastTempoHapticStep = currentStep;
}

let lastSensitivityHapticStep = Math.round(
  Number(onsetThresholdSlider.value)
);

function sensitivityHaptic() {
  const currentStep = Math.round(Number(onsetThresholdSlider.value));

  if (currentStep === lastSensitivityHapticStep) return;

  // 每一級 sensitivity：明顯卡點
  haptic(12);
  lastSensitivityHapticStep = currentStep;
}

/* 將震動綁定到原本已有的 input 更新 */
bpmSlider.addEventListener("input", tempoHaptic);
onsetThresholdSlider.addEventListener("input", sensitivityHaptic);
syncMixer();

// =========================
// MOBILE BUTTON PRESS FEEDBACK
// =========================

const feedbackButtons = document.querySelectorAll(
  ".hardware-key, .mic-key, .step-buttons button"
);

feedbackButtons.forEach((button) => {
  button.addEventListener("pointerdown", () => {
    if (!button.disabled) {
      button.classList.add("is-pressed");
    }
  });

  ["pointerup", "pointercancel", "lostpointercapture"].forEach(
    (eventName) => {
      button.addEventListener(eventName, () => {
        button.classList.remove("is-pressed");
      });
    }
  );
});

