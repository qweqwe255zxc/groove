import { useCallback, useEffect, useMemo, useRef } from "react";

export type FrequencyBands = {
  bass: number; // 0..1
  mid: number; // 0..1
  treble: number; // 0..1
  overall: number; // 0..1
};

export type AudioApi = {
  getBands: () => FrequencyBands;
  getSpectrum: (bins: number) => Float32Array;
  resume: () => void;
  /**
   * Sets playback level (0..1) on the graph's output GainNode.
   *
   * Volume goes through gain rather than `HTMLMediaElement.volume` because
   * iOS Safari ignores JS writes to the latter entirely — playback there
   * always follows the hardware volume buttons — which made the visualizer's
   * volume slider and every play/pause fade built on `el.volume` a silent
   * no-op on a phone (the same platform quirk BackgroundMusic documents and
   * works around by pausing outright). Gain *is* respected everywhere, and
   * since `createMediaElementSource` already reroutes the element's output
   * through Web Audio, it's the element's real output level.
   */
  setVolume: (value: number) => void;
};

/**
 * Wires a <audio> element into a Web Audio AnalyserNode and exposes a
 * getBands() accessor. Deliberately ref-based (no React state) so it can be
 * polled from an r3f useFrame loop without triggering re-renders every frame.
 */
export function useAudioAnalyser(
  audioRef: React.RefObject<HTMLAudioElement | null>,
  sensitivity: number
) {
  const analyserRef = useRef<AnalyserNode | null>(null);
  const ctxRef = useRef<AudioContext | null>(null);
  // @types/node's global augmentation makes the bare `Uint8Array` type resolve
  // to `Uint8Array<ArrayBufferLike>`, which AnalyserNode's DOM typings reject —
  // pin the buffer generic explicitly instead of fighting that everywhere.
  const dataRef = useRef<Uint8Array<ArrayBuffer> | null>(null);
  const spectrumRef = useRef<Float32Array | null>(null);
  const sensitivityRef = useRef(sensitivity);
  const gainRef = useRef<GainNode | null>(null);
  // Remembered separately from the node so a level set before the graph
  // exists (or between re-wires) isn't dropped — the setup effect applies it
  // to the node it creates.
  const levelRef = useRef(1);

  useEffect(() => {
    sensitivityRef.current = sensitivity;
  }, [sensitivity]);

  useEffect(() => {
    const audio = audioRef.current;
    if (!audio) return;

    // Element already wired (StrictMode double-effect / remount) — skip.
    if ((audio as HTMLAudioElement & { __wired?: boolean }).__wired) return;

    const AudioContextCtor =
      window.AudioContext ||
      (window as unknown as { webkitAudioContext: typeof AudioContext })
        .webkitAudioContext;
    const ctx = new AudioContextCtor();
    const source = ctx.createMediaElementSource(audio);
    const analyser = ctx.createAnalyser();
    analyser.fftSize = 256;
    analyser.smoothingTimeConstant = 0.82;
    const gain = ctx.createGain();

    // Gain sits *after* the analyser, not before it: the scene should keep
    // reacting to the track's actual frequency content at the volume it was
    // mixed at, so turning the slider down doesn't flatten the visuals along
    // with the sound.
    source.connect(analyser);
    analyser.connect(gain);
    gain.connect(ctx.destination);
    gain.gain.value = levelRef.current;
    gainRef.current = gain;

    analyserRef.current = analyser;
    ctxRef.current = ctx;
    dataRef.current = new Uint8Array(new ArrayBuffer(analyser.frequencyBinCount));
    (audio as HTMLAudioElement & { __wired?: boolean }).__wired = true;

    return () => {
      gainRef.current = null;
      gain.disconnect();
      analyser.disconnect();
      source.disconnect();
      ctx.close();
    };
  }, [audioRef]);

  const setVolume = useCallback((value: number) => {
    levelRef.current = value;
    const gain = gainRef.current;
    if (gain) gain.gain.value = value;
  }, []);

  const resume = useCallback(() => {
    const ctx = ctxRef.current;
    if (ctx && ctx.state === "suspended") ctx.resume();
  }, []);

  const getBands = useCallback((): FrequencyBands => {
    const analyser = analyserRef.current;
    const data = dataRef.current;
    if (!analyser || !data) return { bass: 0, mid: 0, treble: 0, overall: 0 };

    analyser.getByteFrequencyData(data);
    const boost = sensitivityRef.current;

    const bassEnd = Math.floor(data.length * 0.15);
    const midEnd = Math.floor(data.length * 0.5);

    let bass = 0;
    for (let i = 0; i < bassEnd; i++) bass += data[i];
    bass = (bass / bassEnd / 255) * boost;

    let mid = 0;
    for (let i = bassEnd; i < midEnd; i++) mid += data[i];
    mid = (mid / (midEnd - bassEnd) / 255) * boost;

    let treble = 0;
    for (let i = midEnd; i < data.length; i++) treble += data[i];
    treble = (treble / (data.length - midEnd) / 255) * boost;

    const overall = (bass + mid + treble) / 3;

    return {
      bass: Math.min(bass, 1.6),
      mid: Math.min(mid, 1.6),
      treble: Math.min(treble, 1.6),
      overall: Math.min(overall, 1.6),
    };
  }, []);

  // Resamples the analyser's frequency bins down to `bins` buckets, reusing
  // one Float32Array (sized to the last requested `bins`) to stay allocation-free
  // in a useFrame loop. The top ~15% of bins is dropped — it's near-silent for
  // most music and would otherwise flatten the visible bars.
  //
  // Bucket edges are log-spaced, not linear. FFT bins are linearly spaced in
  // Hz (fftSize 256 → ~172Hz/bin), so equal-width linear buckets each cover a
  // fixed Hz range — and almost the entire vocal/melodic range (say 200Hz-3kHz,
  // where a lead vocal's pitch actually moves) used to land inside just 1-2 of
  // the 10 buckets, while several buckets were spent on the near-empty top
  // octaves. That's what made every region of OrbScene's cloud track roughly
  // the same "loud now vs not" signal instead of different regions lighting up
  // for a bassline vs. a vocal ad-lib vs. a hi-hat. Log spacing gives the
  // low/mid range — where music actually carries distinct, moving pitch
  // content — most of the buckets, matching how pitch is perceived, so
  // different frequency content actually drives different regions.
  const getSpectrum = useCallback((bins: number): Float32Array => {
    if (!spectrumRef.current || spectrumRef.current.length !== bins) {
      spectrumRef.current = new Float32Array(bins);
    }
    const out = spectrumRef.current;

    const analyser = analyserRef.current;
    const data = dataRef.current;
    if (!analyser || !data) return out;

    analyser.getByteFrequencyData(data);
    const boost = sensitivityRef.current;
    const usableLength = Math.floor(data.length * 0.85);
    // Bin 0 (DC/near-0Hz) can't seed a log scale — start the curve at bin 1
    // and prepend it back into the first bucket.
    const minIndex = 1;
    const ratio = usableLength / minIndex;

    for (let i = 0; i < bins; i++) {
      const start =
        i === 0 ? 0 : Math.floor(minIndex * Math.pow(ratio, i / bins));
      const end = Math.max(
        start + 1,
        Math.floor(minIndex * Math.pow(ratio, (i + 1) / bins))
      );
      let sum = 0;
      for (let j = start; j < end; j++) sum += data[j];
      out[i] = Math.min((sum / (end - start) / 255) * boost, 1.6);
    }

    return out;
  }, []);

  // Stable identity across renders — otherwise every VisualizerStage render
  // (e.g. dragging the sensitivity slider) would hand consumers a brand-new
  // `audio` object, which for the play/pause effect in VisualizerStage means
  // spuriously re-firing `el.play()` on every unrelated re-render.
  return useMemo(
    () => ({ getBands, getSpectrum, resume, setVolume }),
    [getBands, getSpectrum, resume, setVolume]
  );
}
