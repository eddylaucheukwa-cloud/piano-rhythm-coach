// Analyze microphone samples on the audio thread, independent of screen refresh.
class PianoOnsetDetector {
  constructor(rate) {
    this.rate = rate;
    this.size = 1024;
    this.hop = 256;
    this.buffer = new Float32Array(this.size);
    this.real = new Float64Array(this.size);
    this.imag = new Float64Array(this.size);
    this.previousSpectrum = new Float64Array(this.size / 2);
    this.window = Float64Array.from({ length: this.size }, (_, i) => 0.5 - 0.5 * Math.cos(2 * Math.PI * i / (this.size - 1)));
    this.writeIndex = 0;
    this.samples = 0;
    this.sensitivity = 8;
    this.minimumGapMs = 75;
    this.history = [];
    this.previous = null;
    this.beforePreviousFlux = 0;
    this.lastOnset = -Infinity;
    this.noiseRms = 0;
    this.pendingMeasurements = [];
  }

  configure(config) {
    this.sensitivity = config.sensitivity ?? this.sensitivity;
    this.minimumGapMs = config.minimumGapMs ?? this.minimumGapMs;
  }

  median(values) {
    const sorted = [...values].sort((a, b) => a - b);
    return sorted[Math.floor(sorted.length / 2)] || 0;
  }

  analyze(time) {
    let energy = 0, clipped = false;
    for (let i = 0; i < this.size; i++) {
      const value = this.buffer[(this.writeIndex + i) % this.size];
      energy += value * value;
      if (Math.abs(value) >= 0.98) clipped = true;
      this.real[i] = value * this.window[i];
      this.imag[i] = 0;
    }
    // In-place radix-2 FFT. No library or per-sample allocation on the audio thread.
    for (let i = 1, j = 0; i < this.size; i++) {
      let bit = this.size >> 1;
      for (; j & bit; bit >>= 1) j ^= bit;
      j ^= bit;
      if (i < j) {
        const value = this.real[i];
        this.real[i] = this.real[j];
        this.real[j] = value;
      }
    }
    for (let width = 2; width <= this.size; width <<= 1) {
      const angle = -2 * Math.PI / width;
      const stepReal = Math.cos(angle), stepImag = Math.sin(angle);
      for (let start = 0; start < this.size; start += width) {
        let wr = 1, wi = 0;
        for (let j = 0; j < width / 2; j++) {
          const a = start + j, b = a + width / 2;
          const tr = wr * this.real[b] - wi * this.imag[b];
          const ti = wr * this.imag[b] + wi * this.real[b];
          this.real[b] = this.real[a] - tr;
          this.imag[b] = this.imag[a] - ti;
          this.real[a] += tr;
          this.imag[a] += ti;
          const nextReal = wr * stepReal - wi * stepImag;
          wi = wr * stepImag + wi * stepReal;
          wr = nextReal;
        }
      }
    }
    let flux = 0;
    const first = Math.max(1, Math.floor(27.5 * this.size / this.rate));
    const last = Math.min(this.size / 2 - 1, Math.ceil(5000 * this.size / this.rate));
    for (let i = first; i <= last; i++) {
      const magnitude = Math.hypot(this.real[i], this.imag[i]) * 2 / this.size;
      const spectrum = Math.log1p(magnitude * 100);
      flux += Math.max(0, spectrum - this.previousSpectrum[i]);
      this.previousSpectrum[i] = spectrum;
    }
    flux /= last - first + 1;
    const rms = Math.sqrt(energy / this.size);
    const medianFlux = this.median(this.history.map(frame => frame.flux));
    const deviation = this.median(this.history.map(frame => Math.abs(frame.flux - medianFlux)));
    const quietRms = this.median(this.history.map(frame => frame.rms).sort((a, b) => a - b).slice(0, Math.max(1, Math.floor(this.history.length / 4))));
    this.noiseRms += (quietRms < this.noiseRms ? 0.2 : 0.002) * (quietRms - this.noiseRms);
    const sensitivity = Math.pow(this.sensitivity / 8, 0.7);
    const threshold = Math.max(0.002 * sensitivity, medianFlux + deviation * 6 * sensitivity);
    let onset = null;
    if (this.previous && this.history.length >= 12 &&
        this.previous.flux > this.beforePreviousFlux && this.previous.flux >= flux &&
        this.previous.flux > threshold &&
        this.previous.rms > Math.max(0.0008 * sensitivity, this.noiseRms * 1.5) &&
        (this.previous.time - this.lastOnset) * 1000 > this.minimumGapMs) {
      this.lastOnset = this.previous.time;
      this.pendingMeasurements.push({ time: this.previous.time, peakRms: this.previous.rms, clipped: this.previous.clipped });
    }
    this.beforePreviousFlux = this.previous?.flux || 0;
    this.previous = { flux, rms, clipped, time: time - this.size / (2 * this.rate) };
    this.history.push({ flux, rms });
    if (this.history.length > 48) this.history.shift();
    // Use the attack's peak energy, rather than a frame partway up its slope.
    for (const pending of this.pendingMeasurements) {
      pending.peakRms = Math.max(pending.peakRms, rms);
      pending.clipped ||= clipped;
    }
    const ready = this.pendingMeasurements[0];
    if (ready && time - this.size / (2 * this.rate) >= ready.time + 0.035) {
      this.pendingMeasurements.shift();
      onset = { time: ready.time, levelDb: 20 * Math.log10(Math.max(1e-7, ready.peakRms)), clipped: ready.clipped };
    }
    return onset;
  }

  process(samples, startTime) {
    const onsets = [];
    for (let i = 0; i < samples.length; i++) {
      this.buffer[this.writeIndex] = samples[i];
      this.writeIndex = (this.writeIndex + 1) % this.size;
      this.samples++;
      if (this.samples >= this.size && this.samples % this.hop === 0) {
        const onset = this.analyze(startTime + (i + 1) / this.rate);
        if (onset) onsets.push(onset);
      }
    }
    return onsets;
  }
}

class PianoOnsetProcessor extends AudioWorkletProcessor {
  constructor() {
    super();
    this.detector = new PianoOnsetDetector(sampleRate);
    this.pendingOnsets = [];
    this.samplesSinceMessage = 0;
    this.port.onmessage = event => this.detector.configure(event.data);
  }

  process(inputs) {
    const samples = inputs[0]?.[0];
    if (samples) {
      this.pendingOnsets.push(...this.detector.process(samples, currentTime));
      this.samplesSinceMessage += samples.length;
      if (this.pendingOnsets.length || this.samplesSinceMessage >= 1024) {
        const analyzedThrough = Math.min(
          currentTime + samples.length / sampleRate - (this.detector.size / 2 + this.detector.hop) / sampleRate,
          (this.detector.pendingMeasurements[0]?.time ?? Infinity) - 1 / sampleRate
        );
        this.port.postMessage({ onsets: this.pendingOnsets, analyzedThrough });
        this.pendingOnsets = [];
        this.samplesSinceMessage = 0;
      }
    }
    return true;
  }
}

registerProcessor('piano-onset', PianoOnsetProcessor);
