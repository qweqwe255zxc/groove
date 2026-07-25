"use client";

import { Component, type ReactNode } from "react";

/**
 * OrbScene/TerrainScene mutate raw WebGL buffers every frame outside React's
 * render cycle — a bad frame (context loss, a NaN slipping into a buffer
 * write) throws where no ordinary try/catch in this tree can reach it. A
 * class boundary is still the only way to catch that in React and swap in
 * fallback UI instead of a blank canvas / a route-level crash.
 */
export default class CanvasErrorBoundary extends Component<
  { children: ReactNode; onReset: () => void },
  { hasError: boolean }
> {
  state = { hasError: false };

  static getDerivedStateFromError() {
    return { hasError: true };
  }

  componentDidCatch(error: unknown) {
    console.error("Visualizer scene crashed:", error);
  }

  render() {
    if (!this.state.hasError) return this.props.children;
    return (
      <div className="flex h-full flex-col items-center justify-center gap-4 px-6 text-center">
        <p className="max-w-sm text-sm text-muted">
          The visualizer hit a rendering error and couldn&apos;t continue.
          This is likely a WebGL issue with your browser or graphics driver.
        </p>
        <button
          type="button"
          onClick={() => {
            this.setState({ hasError: false });
            this.props.onReset();
          }}
          className="rounded-full border border-line px-4 py-2 text-xs uppercase tracking-[0.2em] text-fg transition-colors hover:border-fg cursor-pointer"
        >
          Close
        </button>
      </div>
    );
  }
}
