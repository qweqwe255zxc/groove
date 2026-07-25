"use client";

import { useRef } from "react";
import { useAppStore } from "@/store/useAppStore";

export default function UploadTrackButton() {
  const playLocalTrack = useAppStore((s) => s.playLocalTrack);
  const localTrackError = useAppStore((s) => s.localTrackError);
  const setLocalTrackError = useAppStore((s) => s.setLocalTrackError);
  const inputRef = useRef<HTMLInputElement>(null);

  return (
    <div className="flex flex-col items-start gap-2">
      <input
        ref={inputRef}
        type="file"
        accept="audio/*"
        hidden
        onChange={(e) => {
          const file = e.target.files?.[0];
          if (file) playLocalTrack(file);
          // Reset so picking the same file again still fires onChange.
          e.target.value = "";
        }}
      />
      <button
        type="button"
        onClick={() => inputRef.current?.click()}
        className="w-fit rounded-full border border-line px-4 py-2 text-xs uppercase tracking-[0.2em] text-fg transition-colors hover:border-fg cursor-pointer"
      >
        Upload a track
      </button>

      {/* playLocalTrack() rejects an oversized/non-audio file synchronously
          (see MAX_LOCAL_FILE_BYTES in the store); a file that passes that
          but still fails to decode surfaces the same error here via
          VisualizerStage's <audio onError>, after it bounces the user back
          out of the closed overlay. */}
      {localTrackError && (
        <p className="flex items-start gap-2 text-xs text-red-500">
          <span>{localTrackError}</span>
          <button
            type="button"
            onClick={() => setLocalTrackError(null)}
            aria-label="Dismiss"
            className="cursor-pointer text-muted hover:text-fg"
          >
            ✕
          </button>
        </p>
      )}
    </div>
  );
}
