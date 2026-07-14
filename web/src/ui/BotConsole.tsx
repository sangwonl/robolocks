import { useEffect, useLayoutEffect, useRef } from "react";

import type { BotLogEntry } from "../hangar/hangar.ts";

export type BotConsoleProps = {
  currentTick: number;
  logs: BotLogEntry[];
};

const BOTTOM_LOCK_THRESHOLD_PX = 16;

export function BotConsole({ currentTick, logs }: BotConsoleProps) {
  const visibleLogs = logs.filter((entry) => entry.tick <= currentTick);
  const scrollerRef = useRef<HTMLDivElement | null>(null);
  const pinnedToBottomRef = useRef(true);
  const rafRef = useRef<number | null>(null);

  useEffect(() => () => {
    if (rafRef.current !== null) {
      cancelAnimationFrame(rafRef.current);
      rafRef.current = null;
    }
  }, []);

  useEffect(() => {
    const scroller = scrollerRef.current;
    if (!scroller || typeof ResizeObserver === "undefined") {
      return;
    }
    const observer = new ResizeObserver(() => {
      if (pinnedToBottomRef.current) {
        scheduleScrollToBottom();
      }
    });
    observer.observe(scroller);
    return () => observer.disconnect();
  }, []);

  useLayoutEffect(() => {
    if (pinnedToBottomRef.current) {
      scrollToBottom();
    }
  }, [visibleLogs.length, visibleLogs[visibleLogs.length - 1]?.tick, visibleLogs[visibleLogs.length - 1]?.message]);

  function scrollToBottom(): void {
    const scroller = scrollerRef.current;
    if (!scroller) {
      return;
    }
    scroller.scrollTop = scroller.scrollHeight;
  }

  function scheduleScrollToBottom(): void {
    if (rafRef.current !== null) {
      cancelAnimationFrame(rafRef.current);
    }
    rafRef.current = requestAnimationFrame(() => {
      rafRef.current = null;
      if (pinnedToBottomRef.current) {
        scrollToBottom();
      }
    });
  }

  function handleScroll(): void {
    const scroller = scrollerRef.current;
    if (!scroller) {
      return;
    }
    pinnedToBottomRef.current = distanceFromBottom(scroller) <= BOTTOM_LOCK_THRESHOLD_PX;
  }

  return (
    <div ref={scrollerRef} onScroll={handleScroll} className="h-full min-h-0 min-w-0 overflow-y-auto overscroll-contain [overflow-anchor:none]">
      {visibleLogs.length === 0 ? (
        <div className="border border-dashed border-[var(--line-dashed)] p-2 text-[11px] font-semibold text-[var(--text-muted)]">
          No bot logs.
        </div>
      ) : (
        <ol className="grid list-none gap-0.5 rounded-md border border-[var(--line)] bg-[var(--surface-well)] p-2 font-mono text-[11px] leading-snug text-[var(--text-soft)]">
          {visibleLogs.map((entry, index) => (
            <li key={`${entry.tick}-${entry.unitId}-${index}`} className="grid grid-cols-[52px_minmax(0,1fr)] gap-1.5">
              <span className="text-[var(--text-meta)] [font-variant-numeric:tabular-nums]">
                t{entry.tick} u{entry.unitId}
              </span>
              <span
                className={
                  entry.stream === "stderr"
                    ? "min-w-0 text-[var(--text-error)] [overflow-wrap:anywhere]"
                    : "min-w-0 [overflow-wrap:anywhere]"
                }
              >
                {entry.message}
              </span>
            </li>
          ))}
        </ol>
      )}
    </div>
  );
}

function distanceFromBottom(element: HTMLElement): number {
  return Math.max(0, element.scrollHeight - element.scrollTop - element.clientHeight);
}
