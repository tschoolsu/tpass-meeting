"use client";

import { useEffect, useRef, useState } from "react";

function SpeakerOn() {
  return (
    <svg viewBox="0 0 24 24" className="h-5 w-5" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" aria-hidden>
      <path d="M11 5 6 9H2v6h4l5 4V5z" />
      <path d="M15.5 8.5a5 5 0 0 1 0 7" />
      <path d="M18.5 5.5a9 9 0 0 1 0 13" />
    </svg>
  );
}

function SpeakerOff() {
  return (
    <svg viewBox="0 0 24 24" className="h-5 w-5" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" aria-hidden>
      <path d="M11 5 6 9H2v6h4l5 4V5z" />
      <path d="m16 9 6 6M22 9l-6 6" />
    </svg>
  );
}

function Play() {
  return (
    <svg viewBox="0 0 24 24" className="h-5 w-5" fill="currentColor" aria-hidden>
      <path d="M8 5v14l11-7z" />
    </svg>
  );
}

// 會議 BGM：自動撥放、可循迴；左下角圓形按鈕切換靜音。
export function BgmPlayer() {
  const audioRef = useRef<HTMLAudioElement | null>(null);
  const [playing, setPlaying] = useState(false);
  const [muted, setMuted] = useState(false);

  useEffect(() => {
    const el = audioRef.current;
    if (!el) return;
    el.volume = 0.4;
    el.play()
      .then(() => setPlaying(true))
      .catch(() => setPlaying(false)); // 瀏覽器擋自動播放時，留給使用者點按啟動
  }, []);

  function toggle() {
    const el = audioRef.current;
    if (!el) return;
    if (playing) {
      const next = !el.muted;
      el.muted = next;
      setMuted(next);
    } else {
      el.muted = false;
      setMuted(false);
      el.play()
        .then(() => setPlaying(true))
        .catch(() => {});
    }
  }

  return (
    <>
      <audio ref={audioRef} src="/api/bgm" loop preload="auto" />
      <button
        type="button"
        onClick={toggle}
        aria-label={muted ? "開啟背景音樂" : "關閉背景音樂"}
        className="fixed bottom-4 left-4 z-40 flex h-11 w-11 items-center justify-center rounded-full border-2 border-foreground bg-card text-foreground shadow-[3px_3px_0_0_var(--color-foreground)] transition-all duration-200 hover:-translate-y-0.5 hover:shadow-[4px_4px_0_0_var(--color-foreground)] active:translate-y-0"
      >
        {muted ? <SpeakerOff /> : playing ? <SpeakerOn /> : <Play />}
      </button>
    </>
  );
}
