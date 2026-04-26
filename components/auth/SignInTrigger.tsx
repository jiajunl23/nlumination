"use client";

import { useClerk } from "@clerk/nextjs";
import type { ReactNode } from "react";

/**
 * Plain button that opens Clerk's sign-in modal. We use this instead of
 * Clerk's `<SignInButton>` because the latter wraps `React.Children.only`,
 * which mis-fires under Next.js 16 + RSC when the consumer passes a single
 * styled `<button>` child. This trigger gives us total control over markup.
 */
export function SignInTrigger({
  children,
  className,
}: {
  children: ReactNode;
  className?: string;
}) {
  const { openSignIn } = useClerk();
  return (
    <button type="button" onClick={() => openSignIn()} className={className}>
      {children}
    </button>
  );
}
