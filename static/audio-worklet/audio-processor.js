/**
 * AudioWorklet processor for capturing microphone input as raw PCM.
 *
 * Runs in the AudioWorklet thread (separate from main thread) to avoid
 * audio glitches during heavy UI rendering. Captures 16-bit PCM at 16kHz
 * and posts chunks to the main thread for WebSocket streaming.
 *
 * The Gemini Live API expects: raw 16-bit PCM, 16kHz, little-endian, mono.
 */

const TARGET_SAMPLE_RATE = 16000;
const CHUNK_MS = 100;
// 100ms at 16kHz = 1600 samples
const CHUNK_SIZE = Math.floor(TARGET_SAMPLE_RATE * (CHUNK_MS / 1000));

class AudioCaptureProcessor extends AudioWorkletProcessor {
  constructor() {
    super();
    // Pre-allocate buffer for a single chunk to avoid GC pressure
    this.buffer = new Float32Array(CHUNK_SIZE);
    this.bufferOffset = 0;
  }

  process(inputs) {
    const input = inputs[0];
    if (!input || input.length === 0) return true;

    // Take channel 0 (mono)
    const channel = input[0];
    if (!channel || channel.length === 0) return true;

    // Stream samples into the chunk buffer
    for (let i = 0; i < channel.length; i++) {
      this.buffer[this.bufferOffset] = channel[i];
      this.bufferOffset++;

      if (this.bufferOffset >= CHUNK_SIZE) {
        this.flush();
      }
    }

    return true;
  }

  flush() {
    // Convert to 16-bit PCM
    const pcm16 = new Int16Array(CHUNK_SIZE);
    for (let i = 0; i < CHUNK_SIZE; i++) {
      const s = Math.max(-1, Math.min(1, this.buffer[i]));
      pcm16[i] = s < 0 ? s * 0x8000 : s * 0x7fff;
    }

    // Transfer the underlying buffer to the main thread (zero-copy)
    // By transferring, we give ownership to the main thread, avoiding a copy.
    this.port.postMessage(pcm16.buffer, [pcm16.buffer]);

    // Reset offset for the next chunk
    this.bufferOffset = 0;
  }
}

registerProcessor("audio-capture-processor", AudioCaptureProcessor);
