import type { BotLogEntry } from "../research/research.ts";

export type BotConsoleProps = {
  currentTick: number;
  logs: BotLogEntry[];
};

export function BotConsole({ currentTick, logs }: BotConsoleProps) {
  const visibleLogs = logs.filter((entry) => entry.tick <= currentTick).slice(-80);
  return (
    <div className="grid min-h-0">
      {visibleLogs.length === 0 ? (
        <div className="border border-dashed border-[var(--line-dashed)] p-2 text-[11px] font-semibold text-[var(--text-muted)]">
          No bot logs.
        </div>
      ) : (
        <ol className="grid list-none gap-0.5 overflow-visible rounded-md border border-[var(--line)] bg-[var(--surface-well)] p-2 font-mono text-[11px] leading-snug text-[var(--text-soft)]">
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
