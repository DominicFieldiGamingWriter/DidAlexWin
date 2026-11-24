"use client";

import { useEffect } from "react";
import { useRouter } from "next/navigation";

type Props = { matchStart: string | null };
const FIFTEEN_MINUTES = 15 * 60 * 1000;
const ACTIVE_WINDOW_BEFORE = 30 * 60 * 1000;
const ACTIVE_WINDOW_AFTER = 6 * 60 * 60 * 1000;

export default function RefreshOnInterval({ matchStart }: Props) {
  const router = useRouter();
  useEffect(() => {
    if (!matchStart) return;
    const start = Date.parse(matchStart);
    if (!Number.isFinite(start) || Date.now() > start + ACTIVE_WINDOW_AFTER) return;
    let interval: number | undefined;
    const startPolling = () => {
      if (Date.now() >= start - ACTIVE_WINDOW_BEFORE && Date.now() <= start + ACTIVE_WINDOW_AFTER) {
        interval = window.setInterval(() => router.refresh(), FIFTEEN_MINUTES);
      }
    };
    const delay = Math.max(0, start - ACTIVE_WINDOW_BEFORE - Date.now());
    const activation = window.setTimeout(startPolling, delay);
    return () => {
      window.clearTimeout(activation);
      if (interval !== undefined) window.clearInterval(interval);
    };
  }, [matchStart, router]);
  return null;
}
