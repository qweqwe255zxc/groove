"use client";

import { useEffect, useRef } from "react";
import { useAppStore } from "@/store/useAppStore";

// A quiet, slowly-breathing pad built entirely from oscillators + a filter —
// no audio file to host or license, just enough texture to keep the site
// from feeling silent before a real track is playing. Four low, sine-wave
// notes (a soft open chord, no third — stays calm rather than "major" or
// "sad") through a lowpass filter, with two independent slow LFOs (one on
// the filter's cutoff, one on overall level) so it drifts instead of
// sitting static. Deliberately no per-frame JS: every parameter is either a
// one-time value or a native audio-rate LFO connection, so this costs
// nothing on the main thread once it's running.
const NOTES = [65.41, 98.0, 130.81, 164.81]; // C2, G2, C3, E3
const AMBIENT_GAIN = 0.05;
const FADE_OUT_SECONDS = 1.2; // ducking for a real track — quick, out of the way
const FADE_IN_SECONDS = 2.5; // returning after — slower, doesn't jump out

type Graph = {
  ctx: AudioContext;
  masterGain: GainNode;
};

// Deterministic per-note detune instead of Math.random() — this file has no
// render/useMemo path React Compiler's purity lint would flag (it's all
// inside effects), but a fixed spread is just as good here and keeps the
// chord's character identical on every load.
const DETUNE_CENTS = [-4, 3, -2, 5];

export default function AmbientBackground() {
  const isPlaying = useAppStore((s) => s.isPlaying);
  const graphRef = useRef<Graph | null>(null);
  const unlockedRef = useRef(false);

  useEffect(() => {
    const AudioContextCtor =
      window.AudioContext ||
      (window as unknown as { webkitAudioContext: typeof AudioContext })
        .webkitAudioContext;
    const ctx = new AudioContextCtor();

    const masterGain = ctx.createGain();
    masterGain.gain.value = 0; // silent until unlocked by a gesture below
    masterGain.connect(ctx.destination);

    const breatheGain = ctx.createGain();
    breatheGain.gain.value = 1;
    breatheGain.connect(masterGain);

    const filter = ctx.createBiquadFilter();
    filter.type = "lowpass";
    filter.frequency.value = 900;
    filter.Q.value = 0.4;
    filter.connect(breatheGain);

    NOTES.forEach((freq, i) => {
      const osc = ctx.createOscillator();
      osc.type = "sine";
      osc.frequency.value = freq;
      osc.detune.value = DETUNE_CENTS[i];
      const noteGain = ctx.createGain();
      noteGain.gain.value = 1 / NOTES.length;
      osc.connect(noteGain);
      noteGain.connect(filter);
      osc.start();
    });

    // Filter cutoff drifts slowly between ~600Hz and ~1200Hz.
    const filterLfo = ctx.createOscillator();
    filterLfo.type = "sine";
    filterLfo.frequency.value = 0.04; // ~25s period
    const filterLfoDepth = ctx.createGain();
    filterLfoDepth.gain.value = 300;
    filterLfo.connect(filterLfoDepth);
    filterLfoDepth.connect(filter.frequency);
    filterLfo.start();

    // Overall level drifts slowly between ~0.85x and ~1.15x.
    const breatheLfo = ctx.createOscillator();
    breatheLfo.type = "sine";
    breatheLfo.frequency.value = 0.07; // ~14s period
    const breatheLfoDepth = ctx.createGain();
    breatheLfoDepth.gain.value = 0.15;
    breatheLfo.connect(breatheLfoDepth);
    breatheLfoDepth.connect(breatheGain.gain);
    breatheLfo.start();

    graphRef.current = { ctx, masterGain };

    // Autoplay policy: the context comes up suspended (or the gain stays at
    // 0 even if it doesn't) until a real user gesture. Whichever of these
    // fires first resumes the context and reveals whatever the current
    // isPlaying state says the target gain should be.
    function unlock() {
      if (unlockedRef.current) return;
      unlockedRef.current = true;
      window.removeEventListener("pointerdown", unlock);
      window.removeEventListener("keydown", unlock);
      window.removeEventListener("touchstart", unlock);
      if (ctx.state === "suspended") ctx.resume();
      const target = useAppStore.getState().isPlaying ? 0 : AMBIENT_GAIN;
      const now = ctx.currentTime;
      masterGain.gain.cancelScheduledValues(now);
      masterGain.gain.setValueAtTime(masterGain.gain.value, now);
      masterGain.gain.linearRampToValueAtTime(target, now + FADE_IN_SECONDS);
    }
    window.addEventListener("pointerdown", unlock);
    window.addEventListener("keydown", unlock);
    window.addEventListener("touchstart", unlock);

    return () => {
      window.removeEventListener("pointerdown", unlock);
      window.removeEventListener("keydown", unlock);
      window.removeEventListener("touchstart", unlock);
      ctx.close();
      graphRef.current = null;
    };
  }, []);

  useEffect(() => {
    const graph = graphRef.current;
    if (!graph || !unlockedRef.current) return;

    const { ctx, masterGain } = graph;
    const target = isPlaying ? 0 : AMBIENT_GAIN;
    const duration = isPlaying ? FADE_OUT_SECONDS : FADE_IN_SECONDS;
    const now = ctx.currentTime;
    masterGain.gain.cancelScheduledValues(now);
    masterGain.gain.setValueAtTime(masterGain.gain.value, now);
    masterGain.gain.linearRampToValueAtTime(target, now + duration);
  }, [isPlaying]);

  return null;
}
