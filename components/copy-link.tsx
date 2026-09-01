"use client";

import { useEffect, useRef, useState } from "react";
import { Button } from "tpass-ui";

export function CopyLinkButton({ url, label, copiedLabel = "已複製" }: { url: string; label: string; copiedLabel?: string }) {
  const [copied, setCopied] = useState(false);
  const timerRef = useRef<number | null>(null);

  useEffect(() => () => {
    if (timerRef.current) window.clearTimeout(timerRef.current);
  }, []);

  async function copy() {
    try {
      await navigator.clipboard.writeText(url);
    } catch {
      const ta = document.createElement("textarea");
      ta.value = url;
      ta.style.position = "fixed";
      ta.style.opacity = "0";
      document.body.appendChild(ta);
      ta.select();
      document.execCommand("copy");
      document.body.removeChild(ta);
    }
    setCopied(true);
    if (timerRef.current) window.clearTimeout(timerRef.current);
    timerRef.current = window.setTimeout(() => setCopied(false), 2000);
  }

  return (
    <Button type="button" onClick={copy} aria-live="polite">
      {copied ? `✓ ${copiedLabel}` : label}
    </Button>
  );
}
