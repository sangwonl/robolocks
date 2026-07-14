import { ChevronLeft, ChevronRight, Pause, Play, RotateCcw, Square, Swords } from "lucide-react";

import { Button } from "../components/ui/button.tsx";
import type { BattleFrame } from "../types/protocol.ts";
import { playbackStatusText } from "./RuleSummary.tsx";
import { PLAYBACK_SPEEDS, type PlaybackSpeed } from "./hooks/useReplayPlayback.ts";

export type PlaybackControlsProps = {
  canPlay: boolean;
  canStepBackward: boolean;
  canStepForward: boolean;
  currentIndex: number;
  frame: BattleFrame | null;
  frameCount: number;
  isPlaying: boolean;
  canRun: boolean;
  isRunning: boolean;
  isRunPaused: boolean;
  onRun: () => void;
  onRunPlayPause: () => void;
  onStopRun: () => void;
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
  frame,
  frameCount,
  isPlaying,
  canRun,
  isRunning,
  isRunPaused,
  onRun,
  onRunPlayPause,
  onStopRun,
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
      className="absolute bottom-3 left-1/2 z-[5] grid w-[min(440px,calc(100%_-_24px))] -translate-x-1/2 gap-2 rounded-[10px] border border-[var(--brand-border)] bg-[var(--overlay-strong)] p-2.5 shadow-[0_14px_42px_var(--shadow)] backdrop-blur-md"
      aria-label="Battle scene run and playback controls"
    >
      <div className="grid grid-cols-[minmax(0,1fr)_auto] items-stretch gap-2">
        <div className="min-w-0 rounded-md border border-[var(--line)] bg-[var(--surface-well)] px-2 py-1 text-center text-[11px] font-semibold leading-tight text-[var(--text-soft)] grid place-items-center">
          <span className="block truncate">{playbackStatusText(frame)}</span>
        </div>
        <div className="flex gap-1">
          <Button
            type="button"
            variant="default"
            size="sm"
            disabled={!canRun}
            aria-label={isRunning ? "Running simulation" : "Run simulation"}
            title="Run a new simulation from the current setup"
            onClick={onRun}
            className="gap-1.5 whitespace-nowrap font-bold [&_svg]:h-[13px] [&_svg]:w-[13px]"
          >
            <Swords aria-hidden="true" />
            {isRunning ? "Running…" : "Run"}
          </Button>
          {isRunning ? (
            <Button
              type="button"
              variant="secondary"
              size="sm"
              aria-label="Stop live simulation"
              title="Stop live simulation"
              onClick={onStopRun}
              className="gap-1.5 whitespace-nowrap font-bold [&_svg]:h-[13px] [&_svg]:w-[13px]"
            >
              <Square aria-hidden="true" />
              Stop
            </Button>
          ) : null}
        </div>
      </div>

      <div className="grid grid-cols-[auto_minmax(0,1fr)] items-center gap-2">
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
            <ChevronLeft aria-hidden="true" />
          </Button>
          <Button
            type="button"
            variant="default"
            size="icon"
            disabled={isRunning ? false : !canPlay}
            aria-label={isRunning ? (isRunPaused ? "Resume live simulation" : "Pause live simulation") : (isPlaying ? "Pause replay" : "Play replay")}
            aria-pressed={isRunning ? !isRunPaused : isPlaying}
            aria-keyshortcuts="Space"
            title={isRunning ? (isRunPaused ? "Resume live simulation" : "Pause live simulation") : (isPlaying ? "Pause (Space)" : "Play (Space)")}
            onClick={isRunning ? onRunPlayPause : onPlayPause}
          >
            {isRunning ? (isRunPaused ? <Play aria-hidden="true" /> : <Pause aria-hidden="true" />) : isPlaying ? <Pause aria-hidden="true" /> : <Play aria-hidden="true" />}
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
            <ChevronRight aria-hidden="true" />
          </Button>
        </div>
        <label className="grid min-w-0 grid-cols-[56px_minmax(0,1fr)] items-center gap-2 text-[11px] font-semibold text-[var(--text-dim)] [font-variant-numeric:tabular-nums]">
          <span className="whitespace-nowrap">{frameCount > 0 ? `${currentIndex}/${maxIndex}` : "0/0"}</span>
          <input
            className="mx-2 w-[calc(100%_-_16px)] accent-[var(--brand)] focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-[var(--brand)]"
            type="range"
            min={0}
            max={maxIndex}
            value={Math.min(currentIndex, maxIndex)}
            disabled={frameCount <= 1}
            onChange={(event) => onSeek(Number(event.currentTarget.value))}
          />
        </label>
      </div>

      <div className="grid grid-cols-[56px_minmax(0,1fr)] items-center gap-2 text-[11px] font-semibold text-[var(--text-dim)]">
        <span>Speed</span>
        <div className="grid grid-cols-4 gap-1" role="group" aria-label="Playback speed">
          {PLAYBACK_SPEEDS.map((option) => (
            <Button
              key={option}
              type="button"
              variant={speed === option ? "default" : "secondary"}
              size="sm"
              disabled={!canPlay}
              aria-pressed={speed === option}
              onClick={() => onSpeedChange(option)}
              className="[font-variant-numeric:tabular-nums]"
            >
              {option}x
            </Button>
          ))}
        </div>
      </div>
    </div>
  );
}
