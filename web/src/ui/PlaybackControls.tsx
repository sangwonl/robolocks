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
    <div className="playback" aria-label="Replay playback controls">
      <div className="playback-buttons">
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
          title="Previous frame"
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
          title={isPlaying ? "Pause" : "Play"}
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
          title="Next frame"
          onClick={onNext}
        >
          <SkipForward aria-hidden="true" />
        </Button>
      </div>
      <label className="playback-progress">
        <span>{frameCount > 0 ? `${currentIndex + 1}/${frameCount}` : "0/0"}</span>
        <input
          type="range"
          min={0}
          max={maxIndex}
          value={Math.min(currentIndex, maxIndex)}
          disabled={frameCount <= 1}
          onChange={(event) => onSeek(Number(event.currentTarget.value))}
        />
      </label>
      <label className="playback-speed" aria-label="Playback speed">
        <span>Speed</span>
        <select
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
