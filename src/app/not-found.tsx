import Link from "next/link";
import GrooveMark from "@/components/layout/GrooveMark";

export default function NotFound() {
  return (
    <main className="flex min-h-screen flex-col items-center justify-center px-6 text-center">
      <GrooveMark
        variant="solid"
        className="h-16 w-16 animate-spin-vinyl [animation-duration:4s]"
      />
      <p className="mt-8 text-xs uppercase tracking-[0.3em] text-muted">
        404
      </p>
      <h1 className="mt-4 max-w-2xl font-display text-[13vw] italic leading-[0.95] sm:text-[6vw]">
        The record skipped.
      </h1>
      <p className="mt-6 max-w-md text-muted">
        There&apos;s nothing on this track. The page you&apos;re looking for
        doesn&apos;t exist or has moved.
      </p>
      <Link
        href="/"
        className="mt-10 w-fit text-xs uppercase tracking-[0.2em] text-fg underline decoration-line underline-offset-4 hover:decoration-fg"
      >
        Back to the catalog ↑
      </Link>
    </main>
  );
}
