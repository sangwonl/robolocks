import { Pause, Play, RotateCcw, SkipBack, SkipForward } from "lucide-react";

import { Button } from "../components/ui/button.tsx";
import { PLAYBACK_SPEEDS, type PlaybackSpeed } from "./hooks/useReplayPlayback.ts";

export type PlaybackControlsProps = {
  canPlay: boolean;
  canStepBackward: boolean;
  canStepForward: boolean;
  currentIndex: number;
  frameCount: number;
  isPlaying: boolean;
  onNext: () => void;
  onPlayPause: () => void;
  onPrev: () => void;
  onReset: () => void;
  onSeek: (index: number) => void;
  speed: PlaybackSpeed;
  onSpeedChange: (speed: PlaybackSpeed) => void;
};

export function PlaybackControls({
  canPlay,
  canStepBackward,
  canStepForward,
  currentIndex,
  frameCount,
  isPlaying,
  onNext,
  onPlayPause,
  onPrev,
  onReset,
  onSeek,
  speed,
  onSpeedChange,
}: PlaybackControlsProps) {
  const maxIndex = Math.max(0, frameCount - 1);
  return (
    <div
      className="absolute bottom-3 left-1/2 z-[3] grid w-[min(360px,calc(100%_-_24px))] -translate-x-1/2 grid-cols-[auto_minmax(0,1fr)] items-center gap-2 rounded-[10px] border border-[var(--brand-border)] bg-[var(--overlay-strong)] p-1.5 shadow-[0_14px_42px_var(--shadow)] backdrop-blur-md"
      aria-label="Replay playback controls"
    >
      <div className="flex gap-1 [&_button]:min-w-7 [&_svg]:h-[13px] [&_svg]:w-[13px]">
        <Button
          type="button"
          variant="secondary"
          size="icon"
          disabled={frameCount === 0 || currentIndex === 0}
          aria-label="Reset replay"
          title="Reset"
          onClick={onReset}
        >
          <RotateCcw aria-hidden="true" />
        </Button>
        <Button
          type="button"
          variant="secondary"
          size="icon"
          disabled={!canStepBackward}
          aria-label="Previous frame"
          aria-keyshortcuts="ArrowLeft"
          title="Previous frame (Left arrow)"
          onClick={onPrev}
        >
          <SkipBack aria-hidden="true" />
        </Button>
        <Button
          type="button"
          variant="default"
          size="icon"
          disabled={!canPlay}
          aria-label={isPlaying ? "Pause replay" : "Play replay"}
          aria-pressed={isPlaying}
          aria-keyshortcuts="Space"
          title={isPlaying ? "Pause (Space)" : "Play (Space)"}
          onClick={onPlayPause}
        >
          {isPlaying ? <Pause aria-hidden="true" /> : <Play aria-hidden="true" />}
        </Button>
        <Button
          type="button"
          variant="secondary"
          size="icon"
          disabled={!canStepForward}
          aria-label="Next frame"
          aria-keyshortcuts="ArrowRight"
          title="Next frame (Right arrow)"
          onClick={onNext}
        >
          <SkipForward aria-hidden="true" />
        </Button>
      </div>
      <label className="grid grid-cols-[42px_minmax(0,1fr)] items-center gap-2 text-[11px] font-semibold text-[var(--text-dim)] [font-variant-numeric:tabular-nums]">
        <span>{frameCount > 0 ? `${currentIndex + 1}/${frameCount}` : "0/0"}</span>
        <input
          className="w-full accent-[var(--brand)] focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-[var(--brand)]"
          type="range"
          min={0}
          max={maxIndex}
          value={Math.min(currentIndex, maxIndex)}
          disabled={frameCount <= 1}
          onChange={(event) => onSeek(Number(event.currentTarget.value))}
        />
      </label>
      <label
        className="col-span-full grid grid-cols-[42px_minmax(0,1fr)] items-center gap-2 text-[11px] font-semibold text-[var(--text-dim)]"
        aria-label="Playback speed"
      >
        <span>Speed</span>
        <select
          className="w-full rounded-md border border-[var(--brand-border)] bg-[var(--surface-well)] px-1 py-0.5 text-[11px] font-semibold text-[var(--text-soft)] [font-variant-numeric:tabular-nums] focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-[var(--brand)] disabled:opacity-50"
          value={String(speed)}
          disabled={!canPlay}
          onChange={(event) => onSpeedChange(Number(event.currentTarget.value) as PlaybackSpeed)}
        >
          {PLAYBACK_SPEEDS.map((option) => (
            <option key={option} value={option}>
              {option}x
            </option>
          ))}
        </select>
      </label>
    </div>
  );
}
