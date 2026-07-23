"use client";

import type { AnchorHTMLAttributes, Ref } from "react";
import { scrollToHash } from "@/lib/lenis";

type HashLinkProps = AnchorHTMLAttributes<HTMLAnchorElement> & {
  href: `#${string}`;
  ref?: Ref<HTMLAnchorElement>;
};

/**
 * Same as a plain <a href="#section">, but scrolls through Lenis instead of
 * letting the browser jump there natively — otherwise in-page links ignore
 * the smooth scroll entirely and cut straight to the target. React 19 lets a
 * function component take `ref` as a plain prop, no forwardRef needed.
 */
export default function HashLink({ href, onClick, ref, ...rest }: HashLinkProps) {
  return (
    <a
      ref={ref}
      href={href}
      onClick={(e) => {
        e.preventDefault();
        scrollToHash(href);
        onClick?.(e);
      }}
      {...rest}
    />
  );
}
