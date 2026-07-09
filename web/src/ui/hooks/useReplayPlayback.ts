import { useEffect, useRef, useState } from "react";

import type { BattleReplay } from "../../replay/replay";

export type PlaybackSpeed = 0.5 | 1 | 2 | 4;

export const PLAYBACK_SPEEDS: PlaybackSpeed[] = [0.5, 1, 2, 4];

export type UseReplayPlaybackResult = {
  frameIndex: number;
  isPlaying: boolean;
  play: () => void;
  pause: () => void;
  seek: (index: number) => void;
  stepTo: (index: number) => void;
  speed: PlaybackSpeed;
  setSpeed: (speed: PlaybackSpeed) => void;
};

/**
 * Pure frame-index math: maps elapsed wall-clock time (at a given playback
 * speed and replay tick rate) to a frame index, clamped to the replay's
 * bounds. No drift accumulates because the index is always derived from an
 * absolute elapsed duration rather than incremented tick-by-tick.
 */
export function frameIndexAt(elapsedMs: number, tickRate: number, speed: number, frameCount: number): number {
  if (frameCount <= 0) {
    return 0;
  }
  const maxIndex = frameCount - 1;
  if (elapsedMs <= 0) {
    return 0;
  }
  const rawIndex = Math.floor((elapsedMs * tickRate * speed) / 1000);
  return Math.min(maxIndex, Math.max(0, rawIndex));
}

export type PlaybackShortcutAction =
  | "toggle-play"
  | "step-backward"
  | "step-forward"
  | "step-backward-large"
  | "step-forward-large";

// Structural subset of KeyboardEvent - kept minimal so this stays a pure,
// DOM-free mapping that tests can call with a plain object literal.
export type ShortcutKeyEvent = {
  key: string;
  shiftKey: boolean;
};

/**
 * Maps a keydown event to a playback action, or null when the key is not a
 * playback shortcut. Pure: it knows nothing about whether a replay is
 * loaded, where focus currently is, or how to apply the action - callers
 * own the focus guard and the actual play/seek dispatch.
 */
export function shortcutAction(event: ShortcutKeyEvent): PlaybackShortcutAction | null {
  switch (event.key) {
    case " ":
    case "Spacebar":
      return "toggle-play";
    case "ArrowLeft":
      return event.shiftKey ? "step-backward-large" : "step-backward";
    case "ArrowRight":
      return event.shiftKey ? "step-forward-large" : "step-forward";
    default:
      return null;
  }
}

export function useReplayPlayback(replay: BattleReplay | null): UseReplayPlaybackResult {
  const [trackedReplay, setTrackedReplay] = useState(replay);
  const [frameIndex, setFrameIndex] = useState(0);
  const [isPlaying, setIsPlaying] = useState(false);
  const [speed, setSpeedState] = useState<PlaybackSpeed>(1);
  const frameIndexRef = useRef(0);
  const rafIdRef = useRef<number | null>(null);

  // Reset the frame index whenever the replay identity changes (a new
  // replay was loaded). This runs during render (not an effect) so there is
  // no flash of the old frame index against the new replay's frames.
  // `isPlaying` is intentionally left untouched here - callers control it
  // explicitly via play()/pause() to preserve today's autoplay behavior.
  if (replay !== trackedReplay) {
    setTrackedReplay(replay);
    setFrameIndex(0);
    frameIndexRef.current = 0;
  }

  useEffect(() => {
    frameIndexRef.current = frameIndex;
  }, [frameIndex]);

  useEffect(() => {
    if (!isPlaying || !replay || replay.frames.length <= 1) {
      return;
    }
    const frameCount = replay.frames.length;
    const tickRate = replay.tickRate;
    // Rebase the elapsed-time origin from the current frame index so that
    // resuming from pause, seeking, or changing speed never causes a jump:
    // the very next computed index continues from where we already are.
    let startTimestamp = performance.now() - (frameIndexRef.current * 1000) / (tickRate * speed);
    let lastAppliedIndex = frameIndexRef.current;

    function tick(now: number): void {
      if (frameIndexRef.current !== lastAppliedIndex) {
        // Something outside this loop (e.g. a manual step) moved the frame
        // index without pausing playback - rebase from that new position so
        // playback continues smoothly instead of snapping back.
        lastAppliedIndex = frameIndexRef.current;
        startTimestamp = now - (lastAppliedIndex * 1000) / (tickRate * speed);
      }
      const elapsed = now - startTimestamp;
      const nextIndex = frameIndexAt(elapsed, tickRate, speed, frameCount);
      if (nextIndex !== lastAppliedIndex) {
        lastAppliedIndex = nextIndex;
        frameIndexRef.current = nextIndex;
        setFrameIndex(nextIndex);
      }
      if (nextIndex >= frameCount - 1) {
        setIsPlaying(false);
        return;
      }
      rafIdRef.current = requestAnimationFrame(tick);
    }

    rafIdRef.current = requestAnimationFrame(tick);

    // Browsers suspend rAF callbacks in hidden/background tabs. When the tab
    // becomes visible again, `now` in the next tick() jumps far ahead of
    // `startTimestamp`, which would otherwise compute a far-future frame and
    // snap playback to the end. Rebase the elapsed-time origin from the
    // frame that was actually last displayed - the same rebase math used
    // above when speed changes - so playback resumes from where it left off
    // instead of jumping.
    function handleVisibilityChange(): void {
      if (document.visibilityState === "visible") {
        lastAppliedIndex = frameIndexRef.current;
        startTimestamp = performance.now() - (lastAppliedIndex * 1000) / (tickRate * speed);
      }
    }
    document.addEventListener("visibilitychange", handleVisibilityChange);

    return () => {
      document.removeEventListener("visibilitychange", handleVisibilityChange);
      if (rafIdRef.current !== null) {
        cancelAnimationFrame(rafIdRef.current);
        rafIdRef.current = null;
      }
    };
  }, [isPlaying, replay, speed]);

  function play(): void {
    setIsPlaying(true);
  }

  function pause(): void {
    setIsPlaying(false);
  }

  function clampToReplay(index: number): number {
    const maxIndex = replay ? Math.max(0, replay.frames.length - 1) : 0;
    return Math.min(maxIndex, Math.max(0, index));
  }

  function seek(index: number): void {
    setIsPlaying(false);
    const clamped = clampToReplay(index);
    frameIndexRef.current = clamped;
    setFrameIndex(clamped);
  }

  // Moves the frame index directly without pausing playback, so a rAF loop
  // already in flight can rebase around it (see the tick() guard above).
  // Used for single-step next/previous, which - like today's setInterval
  // version - do not stop playback.
  function stepTo(index: number): void {
    const clamped = clampToReplay(index);
    frameIndexRef.current = clamped;
    setFrameIndex(clamped);
  }

  function setSpeed(nextSpeed: PlaybackSpeed): void {
    setSpeedState(nextSpeed);
  }

  return { frameIndex, isPlaying, play, pause, seek, stepTo, speed, setSpeed };
}
