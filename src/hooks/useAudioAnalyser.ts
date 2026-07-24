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

    source.connect(analyser);
    analyser.connect(ctx.destination);

    analyserRef.current = analyser;
    ctxRef.current = ctx;
    dataRef.current = new Uint8Array(new ArrayBuffer(analyser.frequencyBinCount));
    (audio as HTMLAudioElement & { __wired?: boolean }).__wired = true;

    return () => {
      analyser.disconnect();
      source.disconnect();
      ctx.close();
    };
  }, [audioRef]);

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
    const bucketSize = usableLength / bins;

    for (let i = 0; i < bins; i++) {
      const start = Math.floor(i * bucketSize);
      const end = Math.max(start + 1, Math.floor((i + 1) * bucketSize));
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
    () => ({ getBands, getSpectrum, resume }),
    [getBands, getSpectrum, resume]
  );
}
