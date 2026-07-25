"use client";

import { useAppStore } from "@/store/useAppStore";

export default function SearchBar() {
  const query = useAppStore((s) => s.query);
  const setQuery = useAppStore((s) => s.setQuery);

  return (
    <div className="border-b border-line pb-4">
      <input
        type="text"
        value={query}
        onChange={(e) => setQuery(e.target.value)}
        placeholder="Search artist or album…"
        autoComplete="off"
        spellCheck={false}
        /* An <input> can't wrap, so a placeholder wider than the field is
           simply clipped mid-word ("Search artist or a…"), which reads as
           broken rather than as the deliberate oversized-type look it is
           when it fits. Each step up is therefore pinned to the width where
           the placeholder actually starts fitting, measured rather than
           guessed: 24px needs ~257px of field, 36px needs ~386px, 60px
           needs ~643px — which lands them at 440px and md (768px), the
           latter being why this can't just use sm:. */
        className="w-full bg-transparent font-display text-2xl italic leading-tight text-fg placeholder:text-muted focus:outline-none min-[440px]:text-4xl md:text-6xl"
      />
    </div>
  );
}
