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
        className="w-full bg-transparent font-display text-4xl italic leading-tight text-fg placeholder:text-muted focus:outline-none sm:text-6xl"
      />
    </div>
  );
}
