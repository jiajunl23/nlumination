"use client";

import { useCallback, useEffect, useState } from "react";

const KEY = "nlumination.groqApiKey";
// Same-tab change broadcast. The native `storage` event only fires on
// OTHER tabs, so multiple hook instances in the same document (popover
// + chat panel) need this custom event to stay in sync after save/clear.
const CHANGE_EVENT = "nlumination:groqkey-changed";

/**
 * Read/write a user-supplied Groq API key in localStorage.
 *
 * The key is sent as `X-Groq-Key` on each NL request; when present
 * the server bypasses the shared 100/day quota. Persistence is
 * intentionally browser-local — the server never persists or logs it.
 */
export function useGroqApiKey(): {
  apiKey: string | null;
  hasKey: boolean;
  save: (next: string) => void;
  clear: () => void;
} {
  // Hydrate after mount to avoid SSR/CSR mismatch (localStorage is undef on server).
  const [apiKey, setApiKey] = useState<string | null>(null);

  useEffect(() => {
    const sync = () => {
      try {
        setApiKey(window.localStorage.getItem(KEY));
      } catch {
        /* private mode / storage disabled — ignore */
      }
    };
    sync();
    window.addEventListener("storage", sync);
    window.addEventListener(CHANGE_EVENT, sync);
    return () => {
      window.removeEventListener("storage", sync);
      window.removeEventListener(CHANGE_EVENT, sync);
    };
  }, []);

  const save = useCallback((next: string) => {
    try {
      window.localStorage.setItem(KEY, next);
    } catch {
      /* ignore */
    }
    setApiKey(next);
    window.dispatchEvent(new Event(CHANGE_EVENT));
  }, []);

  const clear = useCallback(() => {
    try {
      window.localStorage.removeItem(KEY);
    } catch {
      /* ignore */
    }
    setApiKey(null);
    window.dispatchEvent(new Event(CHANGE_EVENT));
  }, []);

  return { apiKey, hasKey: apiKey !== null && apiKey !== "", save, clear };
}
