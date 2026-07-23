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
      yPercent: 110,
      duration: 0.8,
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
          <p ref={wordmarkRef} className="font-display text-[14vw] italic leading-none sm:text-[8vw]">
            spinner
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
