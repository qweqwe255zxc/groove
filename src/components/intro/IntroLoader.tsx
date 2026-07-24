"use client";

import { useEffect, useRef } from "react";
import gsap from "gsap";
import { useAppStore } from "@/store/useAppStore";

export default function IntroLoader() {
  const introComplete = useAppStore((s) => s.introComplete);
  const setIntroComplete = useAppStore((s) => s.setIntroComplete);
  const overlayRef = useRef<HTMLDivElement>(null);
  const contentRef = useRef<HTMLDivElement>(null);
  const counterRef = useRef<HTMLSpanElement>(null);
  const wordmarkRef = useRef<HTMLParagraphElement>(null);

  useEffect(() => {
    const reduceMotion = window.matchMedia(
      "(prefers-reduced-motion: reduce)"
    ).matches;

    if (reduceMotion) {
      setIntroComplete();
      return;
    }

    const counter = { value: 0 };
    const tl = gsap.timeline({
      delay: 0.15,
      onComplete: () => {
        // The text leaves first (fade + rise) so the panel-slide below never
        // has to clip through the wordmark mid-word — a clip-path wipe on an
        // element with visible text inside tends to read as a rendering
        // glitch rather than an intentional exit.
        gsap
          .timeline({ onComplete: setIntroComplete })
          .to(contentRef.current, {
            opacity: 0,
            y: -24,
            duration: 0.45,
            ease: "power2.in",
          })
          .to(
            overlayRef.current,
            { yPercent: -100, duration: 0.9, ease: "expo.inOut" },
            "-=0.1"
          );
      },
    });

    tl.from(wordmarkRef.current, {
      yPercent: 20,
      autoAlpha: 0,
      duration: 1,
      ease: "expo.out",
    }).to(
      counter,
      {
        value: 100,
        duration: 1.4,
        ease: "power2.out",
        onUpdate: () => {
          if (counterRef.current) {
            counterRef.current.textContent = String(
              Math.round(counter.value)
            ).padStart(3, "0");
          }
        },
      },
      "-=0.5"
    );

    return () => {
      tl.kill();
    };
  }, [setIntroComplete]);

  if (introComplete) return null;

  return (
    <div
      ref={overlayRef}
      className="fixed inset-0 z-[100] flex flex-col items-center justify-center gap-6 bg-bg text-fg"
    >
      <div ref={contentRef} className="flex flex-col items-center gap-6">
        <div className="overflow-hidden">
          {/* leading-[1.6]: Fraunces italic's own metrics (ascent+descent)
              already sum to ~1.23em — more than a full 1-line-height box —
              and the "g"'s ink descent sits almost exactly at the font's
              reported descent (measured via canvas measureText against the
              rendered element). leading-none/leading-1 clips its tail
              against this overflow-hidden mask; 1.6 leaves enough room
              below the baseline to clear it. The entrance tween below fades
              opacity in alongside the slide (autoAlpha) so the letters
              don't pop to full-black opacity the instant they cross this
              clip edge — a plain position-only slide against a hard clip
              reads as a flat block snapping into place rather than the
              word rising into view. */}
          <p ref={wordmarkRef} className="font-display text-[14vw] italic leading-[1.6] sm:text-[8vw]">
            groove
          </p>
        </div>
        <div className="flex items-center gap-3 text-xs uppercase tracking-[0.3em] text-muted">
          <span>Loading</span>
          <span className="tabular-nums text-fg">
            <span ref={counterRef}>000</span>%
          </span>
        </div>
      </div>
    </div>
  );
}
