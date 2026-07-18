function matchSoundToExpectedEvent(soundTime) {
  const nextEvent = expectedEvents.find(
    (event) => event.detectedTime === null
  );

  if (!nextEvent) {
    return;
  }

  const difference = soundTime - nextEvent.time;

  if (Math.abs(difference) > timingWindowMs) {
    practiceStatus.textContent =
      "Onset ignored: outside next timing window.";
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
