import type Lenis from "lenis";

// A single Lenis instance lives for the whole app (see SmoothScrollProvider).
// Anything that needs to trigger a smooth scroll — nav links, the hero's
// "browse" link — reaches it through here instead of threading a ref/context
// through every component that happens to render an anchor tag.
let instance: Lenis | null = null;

export function setLenisInstance(lenis: Lenis | null) {
  instance = lenis;
}

export function scrollToHash(hash: string) {
  if (!instance) {
    document.querySelector(hash)?.scrollIntoView({ behavior: "smooth" });
    return;
  }
  // This often fires while Lenis is stopped (e.g. clicking a menu link closes
  // the menu, which unlocks scroll a beat later via useBackgroundLock). Just
  // bypassing the stopped check with `scrollTo`'s `force` isn't enough on its
  // own: `start()` calls `reset()` internally, which kills whatever animation
  // is currently running — so the background-lock effect's own `start()`,
  // firing a tick after this once the menu-closed state commits, would cancel
  // the scroll it just kicked off. Calling `start()` here first makes Lenis
  // genuinely un-stopped *before* that animation begins, so the later
  // `start()` call finds nothing to reset (`if (!isStopped) return`).
  instance.start();
  instance.scrollTo(hash, { duration: 1.2 });
}
