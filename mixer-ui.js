const rhythmValue = document.getElementById("rhythmValue");
const eventValue = document.getElementById("eventValue");
const rhythmDigits = rhythmValue.querySelector("span");
const eventDigits = eventValue.querySelector("span");
const tempoKnob = document.getElementById("tempoKnob");
const notch = document.getElementById("knobNotch");
const knobOrbit = document.getElementById("knobOrbit");
const wheel = document.getElementById("notesWheel");
const playback = document.getElementById("playbackButton");
const audio = document.getElementById("recordedAudio");
const fader = document.getElementById("sensitivityHandle");
const MIN = 40;
const MAX = 180;
const START = -135;
const END = 135;
let tempoPreviewTimer = null;

function hideTempoPreview() {
  clearTimeout(tempoPreviewTimer);
  tempoPreviewTimer = null;
  coachConsole.classList.remove("tempo-adjusting");
}

function showTempoPreview() {
  hideTempoPreview();
  if (mode !== "idle" || isTestMode || isPlayMode || bpmSlider.disabled) return;
  coachConsole.classList.add("tempo-adjusting");
  if (!tempoDragActive) tempoPreviewTimer = setTimeout(hideTempoPreview, 800);
}

function animateNumber(element, direction) {
  element.classList.remove("roll-up", "roll-down");
  void element.offsetWidth;
  element.classList.add(direction > 0 ? "roll-up" : "roll-down");
}

function syncMixer() {
  if (mode !== "idle" || isTestMode || isPlayMode || bpmSlider.disabled) hideTempoPreview();
  const bpm = mode === "calibrating" || mode === "calibration-result"
    ? CALIBRATION_BPM : isPlayMode ? playState.bpm : Number(bpmSlider.value);
  const ratio = Math.max(0, Math.min(1, (bpm - MIN) / (MAX - MIN)));
  const angle = START + ratio * (END - START);

// 40 BPM 至 180 BPM：外層定位架由 0° 累積轉到 720°，即兩圈
const visualTurns = 2;
const knobRotation = ratio * 360 * visualTurns;

/*
  只有透明的 knobOrbit 繞旋鈕中心轉兩圈。
  真正的小圓 knobNotch 不旋轉，因此陰影方向保持固定。
*/
knobOrbit.style.transform = `rotate(${knobRotation}deg)`;
notch.style.transform = `rotate(${-knobRotation}deg)`;
  tempoKnob.setAttribute("aria-valuenow", bpm);
  tempoKnob.setAttribute("aria-label", `Tempo, ${bpm} BPM`);
  tempoKnob.setAttribute("aria-valuemax", Math.max(MAX, bpm));
  tempoKnob.setAttribute("aria-disabled", String(isPlayMode || bpmSlider.disabled));

  if (bpmMonitor) {
    bpmMonitor.textContent = `BPM ${String(bpm).padStart(3, "0")}`;
  }

  rhythmDigits.textContent = String(isPlayMode ? (playState.bufferBeat > 0 ? playState.nextPattern : playState.pattern)[Math.max(0, playState.currentBeat)] : notesPerBeat.value).padStart(2, "0");
  eventDigits.textContent = String(isPlayMode ? playState.detectedNotes : totalNotes.value).padStart(2, "0");

  const threshold = Number(onsetThresholdSlider.value);
  const travel = Math.max(0, sensitivityTrack.clientHeight - fader.offsetHeight);
  const top = (1 - (threshold - 1) / 29) * travel;
  fader.style.top = `${top}px`;
}

function setTempo(value) {
  if (bpmSlider.disabled) return;
  bpmSlider.value = Math.max(MIN, Math.min(MAX, Math.round(value)));
  bpmSlider.dispatchEvent(new Event("input"));
  syncMixer();
}

function changeRhythm(delta) {
  if (notesPerBeat.disabled) return;
  const current = Number(notesPerBeat.value);
  const next = Math.max(1, Math.min(4, current + delta));

  if (next === current) return;

  notesPerBeat.value = next;
  notesPerBeat.dispatchEvent(new Event("input"));
  animateNumber(rhythmDigits, delta);
  syncMixer();
}
// NOTES wheel：限制震動頻率，避免連續移動時互相中斷
let lastNotesHapticTime = 0;
let wheelPosition = 0;

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
  if (totalNotes.disabled) return;
  const current = Number(totalNotes.value);
  const next = Math.max(1, Math.min(100, current + delta));

  if (next === current) return;

  totalNotes.value = next;
  totalNotes.dispatchEvent(new Event("input"));
notesHapticFeedback();
animateNumber(eventDigits, delta);

  wheelPosition -= delta * 8;
  wheel.style.setProperty("--wheel-position", `${wheelPosition}px`);
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
  if (bpmSlider.disabled) return;
  event.preventDefault();
  tempoDragActive = true;
  showTempoPreview();
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
// 40 BPM 升到 180 BPM 約需要多少完整圈
const turnsFromMinToMax = 3;

// 轉 1 圈時，基礎速度可改變的 BPM。
// 140 = 180 - 40，360 = 一圈的角度。
const baseSpeed =0.5;
  (MAX - MIN) / (360 * turnsFromMinToMax);

// 快轉時的額外加速：保持小，避免一滑就越過目標。
const acceleration = 0.0001;

const direction = Math.sign(deltaAngle);
const amountTurned = Math.abs(deltaAngle);

const curvedChange =
  direction *
  (baseSpeed * amountTurned +
    acceleration * Math.pow(amountTurned, 2));

setTempo(Number(bpmSlider.value) + curvedChange);

  lastTempoPointerAngle = currentAngle;
});

["pointerup", "pointercancel", "lostpointercapture"].forEach((eventName) => {
  tempoKnob.addEventListener(eventName, () => {
    if (!tempoDragActive) return;
    tempoDragActive = false;
    if (eventName === "pointerup") showTempoPreview();
    else hideTempoPreview();
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
let wheelStartPosition;

wheel.addEventListener("pointerdown", (event) => {
  if (totalNotes.disabled) return;
  wheelStartY = event.clientY;
  wheelStartValue = Number(totalNotes.value);
  wheelStartPosition = wheelPosition;
  wheel.classList.add("is-dragging");
  wheel.setPointerCapture(event.pointerId);
});

wheel.addEventListener("pointermove", (event) => {
  if (wheelStartY === undefined) return;

  const next = Math.max(
    1,
    Math.min(100, wheelStartValue + Math.trunc((wheelStartY - event.clientY) / 16))
  );

  changeNotes(next - Number(totalNotes.value));
  wheel.style.setProperty("--wheel-position", `${wheelStartPosition + (event.clientY - wheelStartY) * 0.5}px`);
});

["pointerup", "pointercancel"].forEach((eventName) => {
  wheel.addEventListener(eventName, () => {
    if (wheelStartY === undefined) return;
    wheelPosition = wheelStartPosition - (Number(totalNotes.value) - wheelStartValue) * 8;
    wheelStartY = undefined;
    wheel.classList.remove("is-dragging");
    wheel.style.setProperty("--wheel-position", `${wheelPosition}px`);
  });
});

wheel.addEventListener("wheel", (event) => {
  if (event.deltaY === 0) return;
  event.preventDefault();
  changeNotes(event.deltaY < 0 ? 1 : -1);
}, { passive: false });

wheel.addEventListener("keydown", (event) => {
  if (event.key !== "ArrowUp" && event.key !== "ArrowDown") return;
  event.preventDefault();
  changeNotes(event.key === "ArrowUp" ? 1 : -1);
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
  const travel = Math.max(1, trackRect.height - fader.getBoundingClientRect().height);
  let position = (event.clientY - trackRect.top - fader.getBoundingClientRect().height / 2) / travel;
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
  /* 練習中或未有完成錄音：按下但不做事 */
  if (isPracticeRunning || !audio.src) {
    return;
  }

  if (audio.paused) {
    audio.play();
  } else {
    audio.pause();
  }
});


bpmSlider.addEventListener("input", syncMixer);
bpmSlider.addEventListener("input", showTempoPreview);
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

[playback, startPracticeButton, stopPracticeButton].forEach((button) => {
  button.addEventListener("click", () => {
    if (!button.disabled) haptic(25);
  });
});

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

// Phone browser bars leave different amounts of usable height. Fit the panel
// after the responsive layout has settled, and recalculate when that changes.
const consolePanel = document.querySelector(".console");
function fitPhonePanel() {
  consolePanel.style.zoom = "";
  if (window.innerWidth > 600) return;

  const bodyStyle = getComputedStyle(document.body);
  const outerSpace = parseFloat(bodyStyle.paddingTop) + parseFloat(bodyStyle.paddingBottom);
  const available = (window.visualViewport?.height ?? window.innerHeight) - outerSpace - 5;
  const scale = Math.min(1, available / consolePanel.getBoundingClientRect().height);
  if (scale < 1) consolePanel.style.zoom = String(scale);
}
fitPhonePanel();
document.fonts?.ready.then(fitPhonePanel);
window.addEventListener("resize", fitPhonePanel);
window.visualViewport?.addEventListener("resize", fitPhonePanel);
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
