"use client";

import { useEffect } from "react";
import { useRouter } from "next/navigation";

const FIVE_MINUTES = 5 * 60 * 1000;

export default function RefreshOnInterval() {
  const router = useRouter();

  useEffect(() => {
    const interval = window.setInterval(() => {
      router.refresh();
    }, FIVE_MINUTES);

    return () => window.clearInterval(interval);
  }, [router]);

  return null;
}
