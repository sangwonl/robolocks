import type { BotLogEntry } from "../research/research.ts";

export type BotConsoleProps = {
  currentTick: number;
  logs: BotLogEntry[];
};

export function BotConsole({ currentTick, logs }: BotConsoleProps) {
  const visibleLogs = logs.filter((entry) => entry.tick <= currentTick).slice(-80);
  return (
    <div className="console-panel">
      {visibleLogs.length === 0 ? (
        <div className="console-empty">No bot logs.</div>
      ) : (
        <ol className="console-log">
          {visibleLogs.map((entry, index) => (
            <li key={`${entry.tick}-${entry.unitId}-${index}`} data-stream={entry.stream}>
              <span className="console-meta">t{entry.tick} u{entry.unitId}</span>
              <span className="console-message">{entry.message}</span>
            </li>
          ))}
        </ol>
      )}
    </div>
  );
}
