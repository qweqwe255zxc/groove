"use client";

import { useEffect } from "react";
import "./globals.css";

export default function GlobalError({
  error,
  reset,
}: {
  error: Error & { digest?: string };
  reset: () => void;
}) {
  useEffect(() => {
    console.error(error);
  }, [error]);

  return (
    <html lang="en">
      <body className="min-h-screen bg-bg text-fg antialiased">
        <div className="flex min-h-screen flex-col items-center justify-center gap-4 px-6 text-center">
          <p className="max-w-sm text-sm text-muted">
            Something went wrong and the app couldn&apos;t load.
          </p>
          <button
            type="button"
            onClick={reset}
            className="rounded-full border border-line px-4 py-2 text-xs uppercase tracking-[0.2em] text-fg transition-colors hover:border-fg cursor-pointer"
          >
            Try again
          </button>
        </div>
      </body>
    </html>
  );
}
