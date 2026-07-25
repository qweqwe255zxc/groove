"use client";

// Horizontal, so this is a plain <input type="range"> styled with the same
// `.range-slider` rules as the seek bar (globals.css) rather than the
// hand-built pointer-handling widget this used to be. That version existed
// only because the slider was *vertical*: a rotated range input paints its
// custom-appearance thumb at the pre-rotation position in WebKit, and the
// native vertical modes (`-webkit-appearance: slider-vertical`,
// Firefox's `orient="vertical"`) disagree on which end is min. None of that
// applies once the track runs left-to-right, so the native element — with
// its free keyboard handling, drag capture and a11y semantics — wins.
export default function VolumeSlider({
  value,
  onChange,
}: {
  value: number;
  onChange: (value: number) => void;
}) {
  const pct = Math.round(value * 100);

  // h-8.5 is the exact height the neighbouring `px-4 py-2 text-xs` pills
  // resolve to, so this one lines up with Settings instead of sitting a
  // pixel or two off.
  return (
    <div className="flex h-8.5 items-center gap-3 rounded-full border border-line px-4 text-fg transition-colors hover:border-fg">
      <VolumeIcon level={value} />
      {/* The width lives on this wrapper, not on the input: `.range-slider`
          is unlayered CSS and its `width: 100%` therefore outranks any
          Tailwind `w-*` utility (layered) put on the input itself. */}
      <div className="w-20 sm:w-28">
        {/* --range-progress is a unitless 0–1 fraction, not a percentage —
            see the --range-fill note in globals.css. */}
        <input
          type="range"
          min={0}
          max={1}
          step={0.01}
          value={value}
          onChange={(e) => onChange(Number(e.target.value))}
          aria-label="Volume"
          aria-valuetext={`${pct}%`}
          className="range-slider block"
          style={{ "--range-progress": String(value) } as React.CSSProperties}
        />
      </div>
      {/* Fixed width + tabular figures so the pill doesn't twitch wider as
          the readout crosses 10% / 100% mid-drag. */}
      <span className="w-8 text-right text-[10px] uppercase tracking-widest text-muted tabular-nums">
        {pct}
      </span>
    </div>
  );
}

// Waves light up with the level the way every other volume control does —
// aria-hidden because the <input> beside it already announces the value.
function VolumeIcon({ level }: { level: number }) {
  return (
    <svg
      viewBox="0 0 24 24"
      aria-hidden="true"
      className="h-4 w-4 shrink-0"
      fill="none"
      stroke="currentColor"
      strokeWidth={1.6}
      strokeLinecap="round"
      strokeLinejoin="round"
    >
      <path d="M4 9.5h3L11 6v12l-4-3.5H4z" />
      {level === 0 ? (
        <>
          <path d="M14.5 9.5l5 5" />
          <path d="M19.5 9.5l-5 5" />
        </>
      ) : (
        <>
          <path d="M14.6 9.4a3.6 3.6 0 0 1 0 5.2" />
          <path
            d="M17.4 6.9a7.2 7.2 0 0 1 0 10.2"
            className={level >= 0.5 ? "opacity-100" : "opacity-25"}
          />
        </>
      )}
    </svg>
  );
}
