"use client";

import { useEffect, useRef, useState } from "react";
import gsap from "gsap";
import { useAppStore } from "@/store/useAppStore";
import MusicToggle from "./MusicToggle";
import HashLink from "./HashLink";
import ThemeToggle from "./ThemeToggle";

const LINKS = [
  { href: "#top", label: "Index", tagline: "Top" },
  { href: "#library", label: "Library", tagline: "Catalog" },
  { href: "#about", label: "About", tagline: "How it works" },
] as const;

function LiveClock() {
  const [time, setTime] = useState<string | null>(null);

  useEffect(() => {
    const format = () =>
      new Date().toLocaleTimeString([], {
        hour: "2-digit",
        minute: "2-digit",
        second: "2-digit",
      });
    // Kick off the first tick as a microtask rather than calling setState
    // straight in the effect body — same trick as everywhere else in this
    // codebase that syncs to something time-based.
    Promise.resolve().then(() => setTime(format()));
    const id = setInterval(() => setTime(format()), 1000);
    return () => clearInterval(id);
  }, []);

  // Rendered only after mount so the server-rendered markup never has to
  // guess the visitor's clock (and can't mismatch it on hydration).
  if (!time) return null;
  return <span className="shrink-0 whitespace-nowrap tabular-nums">{time}</span>;
}

export default function OverlayMenu() {
  const isMenuOpen = useAppStore((s) => s.isMenuOpen);
  const setMenuOpen = useAppStore((s) => s.setMenuOpen);
  const panelRef = useRef<HTMLDivElement>(null);
  const linksRef = useRef<HTMLAnchorElement[]>([]);
  const footerRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    if (!isMenuOpen) return;
    function handleKeyDown(e: KeyboardEvent) {
      if (e.key === "Escape") {
        e.preventDefault();
        setMenuOpen(false);
      }
    }
    window.addEventListener("keydown", handleKeyDown);
    return () => window.removeEventListener("keydown", handleKeyDown);
  }, [isMenuOpen, setMenuOpen]);

  useEffect(() => {
    const panel = panelRef.current;
    if (!panel) return;

    const links = linksRef.current;
    const tl = gsap.timeline();

    if (isMenuOpen) {
      panel.style.pointerEvents = "auto";
      // Links start almost with the backdrop wipe (0.12s in), not after it
      // — the old "-=0.5" offset was relative to the wipe's 0.9s duration,
      // so text didn't start rising until 0.4s in and the wipe itself was
      // still visibly settling for another 0.5s after that. Reading as one
      // motion instead of two sequential ones is the whole point here.
      tl.to(panel, { clipPath: "inset(0% 0% 0% 0%)", duration: 0.55, ease: "power4.out" })
        .fromTo(
          links,
          { yPercent: 110 },
          { yPercent: 0, duration: 0.65, stagger: 0.05, ease: "power4.out" },
          0.12
        )
        .fromTo(
          footerRef.current,
          { yPercent: 30, opacity: 0 },
          { yPercent: 0, opacity: 1, duration: 0.45 },
          "-=0.3"
        );
    } else {
      // The open timeline leaves links/footer sitting at their visible
      // resting position (yPercent: 0) — closing only ever animated the
      // panel's clip-path, so that text just got clipped off mid-shape
      // instead of actually leaving. Send it back down first, then wipe
      // the now-empty backdrop shut behind it.
      tl.to(links, { yPercent: 110, duration: 0.35, stagger: 0.03, ease: "power3.in" })
        .to(
          footerRef.current,
          { yPercent: 20, opacity: 0, duration: 0.3, ease: "power3.in" },
          "<"
        )
        .to(
          panel,
          { clipPath: "inset(0% 0% 100% 0%)", duration: 0.45, ease: "power3.inOut" },
          "<0.05"
        )
        .set(panel, { pointerEvents: "none" });
    }

    return () => {
      tl.kill();
    };
  }, [isMenuOpen]);

  return (
    <div
      ref={panelRef}
      style={{ clipPath: "inset(0% 0% 100% 0%)" }}
      className="fixed inset-0 z-40 flex flex-col justify-center gap-3 bg-bg px-6 pointer-events-none sm:px-10"
    >
      {LINKS.map((link, i) => (
        <HashLink
          key={link.href}
          ref={(el) => {
            if (el) linksRef.current[i] = el;
          }}
          href={link.href}
          onClick={() => setMenuOpen(false)}
          className="group flex items-baseline gap-4 overflow-hidden sm:gap-6"
        >
          <span className="font-sans text-xs tabular-nums text-muted">
            0{i + 1}
          </span>
          <span className="flex flex-col">
            <span className="font-display text-[13vw] italic leading-[0.95] tracking-tight text-fg transition-colors group-hover:text-accent sm:text-[7vw]">
              {link.label}
            </span>
            <span className="text-xs uppercase tracking-[0.2em] text-muted">
              {link.tagline}
            </span>
          </span>
        </HashLink>
      ))}

      <div
        ref={footerRef}
        className="mt-8 flex max-w-lg flex-wrap items-center justify-between gap-x-8 gap-y-2 text-xs uppercase tracking-[0.2em] text-muted"
      >
        <p className="max-w-sm normal-case tracking-normal text-sm">
          Built with Three.js and the Web Audio API.{" "}<br/>
          <a
            href="https://github.com/qweqwe255zxc"
            target="_blank"
            rel="noopener noreferrer"
            className="text-fg underline decoration-line underline-offset-4 hover:decoration-fg"
          >
            Built by Bakushin
          </a>
        </p>
        {/* flex-wrap + shrink-0/whitespace-nowrap on each pill: without
            them, a narrow viewport squeezes these three below their content
            width instead of wrapping them onto their own line, and their
            uppercase tracked-out text (worst offender: "Background: On")
            breaks mid-pill instead. */}
        <div className="flex flex-wrap items-center gap-3 gap-y-2 sm:gap-6">
          <ThemeToggle variant="menu" className="shrink-0 whitespace-nowrap" />
          <MusicToggle variant="menu" className="shrink-0 whitespace-nowrap" />
          <LiveClock />
        </div>
      </div>
    </div>
  );
}
