import type { BattleFrame } from "../types/protocol";
import { cn } from "../lib/utils.ts";

export type RuleSummaryProps = {
  frame: BattleFrame | null;
};

// Maps the engine's outcome reason codes to readable labels. "tick_limit" is the
// safety-deadline settle-on-score path (the rule did not resolve on its own).
function outcomeReasonLabel(reason: string): string {
  switch (reason) {
    case "kill_limit":
      return "Kill limit";
    case "capture_point":
      return "Capture point";
    case "time_limit":
      return "Time limit";
    case "tick_limit":
      return "Time up (by score)";
    case "":
      return "active";
    default:
      return reason;
  }
}

function teamLabel(teamId: number): string {
  if (teamId === 1) {
    return "Blue";
  }
  if (teamId === 2) {
    return "Red";
  }
  return `Team ${teamId}`;
}

export function playbackStatusText(frame: BattleFrame | null): string {
  if (!frame) {
    return "No replay";
  }

  const { outcome, scores, captureZones } = frame.ruleState;
  if (outcome.finished) {
    const reason = outcomeReasonLabel(outcome.reason);
    if (outcome.winnerTeamId > 0) {
      return `${teamLabel(outcome.winnerTeamId)} won - ${reason}`;
    }
    if (outcome.winnerUnitId > 0) {
      return `Unit ${outcome.winnerUnitId} won - ${reason}`;
    }
    return `Draw - ${reason}`;
  }

  const contestedZone = captureZones.find((zone) => zone.contested);
  if (contestedZone) {
    return `${contestedZone.id} contested`;
  }
  const ownedZone = captureZones.find((zone) => zone.ownerTeamId > 0);
  if (ownedZone) {
    return `${teamLabel(ownedZone.ownerTeamId)} controls ${ownedZone.id} ${ownedZone.heldTicks}/${ownedZone.holdTicksRequired}`;
  }

  const teamScores = new Map<number, number>();
  for (const score of scores) {
    teamScores.set(score.teamId, (teamScores.get(score.teamId) ?? 0) + score.kills);
  }
  const ordered = [...teamScores.entries()].sort((a, b) => b[1] - a[1]);
  if (ordered.length >= 2) {
    const [leaderTeamId, leaderKills] = ordered[0];
    const [, runnerUpKills] = ordered[1];
    if (leaderKills > runnerUpKills) {
      return `${teamLabel(leaderTeamId)} leads ${leaderKills}-${runnerUpKills}`;
    }
    return `Tied ${leaderKills}-${runnerUpKills}`;
  }
  if (ordered.length === 1) {
    const [teamId, kills] = ordered[0];
    return `${teamLabel(teamId)} ${kills} kills`;
  }
  return "Running";
}

export function RuleSummary({ frame }: RuleSummaryProps) {
  if (!frame) {
    return (
      <div className="border border-dashed border-[var(--line-dashed)] p-2 text-[11px] font-semibold text-[var(--text-muted)]">
        No rule state.
      </div>
    );
  }

  const { outcome, scores } = frame.ruleState;
  return (
    <div className="grid min-w-0 gap-1.5">
      <div
        className={cn(
          "grid grid-cols-[auto_minmax(0,1fr)] items-center gap-x-2 gap-y-1 rounded-md border border-[var(--line)] bg-[var(--ink)] p-2",
          outcome.finished && "border-[var(--brand-border-strong)] bg-[var(--brand-tint)]",
        )}
      >
        <span className="u-label">{outcome.finished ? "Finished" : "Running"}</span>
        <strong className="min-w-0 text-[12px] font-semibold leading-tight text-[var(--text)] [overflow-wrap:anywhere]">
          {outcomeReasonLabel(outcome.reason)}
        </strong>
        {outcome.winnerTeamId > 0 || outcome.winnerUnitId > 0 ? (
          <em className="col-span-full text-[11px] font-semibold not-italic text-[var(--brand)]">
            {outcome.winnerTeamId > 0 ? `team ${outcome.winnerTeamId}` : ""}
            {outcome.winnerUnitId > 0 ? ` unit ${outcome.winnerUnitId}` : ""}
          </em>
        ) : outcome.finished ? (
          <em className="col-span-full text-[11px] font-semibold not-italic text-[var(--text-muted)]">
            Draw
          </em>
        ) : null}
      </div>

      {scores.length === 0 ? (
        <div className="border border-dashed border-[var(--line-dashed)] p-2 text-[11px] font-semibold text-[var(--text-muted)]">
          No scores.
        </div>
      ) : (
        <div
          className="grid overflow-hidden rounded-md border border-[var(--line)] bg-[var(--surface-well)]"
          role="table"
          aria-label="Battle scores"
        >
          <div
            className="grid grid-cols-[1.1fr_1fr_0.7fr_0.7fr_1fr] gap-1.5 px-1.5 py-1 text-[10px] font-semibold uppercase text-[var(--text-muted)]"
            role="row"
          >
            <span>Unit</span>
            <span>Team</span>
            <span>K</span>
            <span>D</span>
            <span>Dmg</span>
          </div>
          {scores.map((score) => (
            <div
              key={`${score.unitId}-${score.teamId}`}
              className="grid min-w-0 grid-cols-[1.1fr_1fr_0.7fr_0.7fr_1fr] gap-1.5 border-t border-[var(--line-subtle)] px-1.5 py-1 text-[11px] leading-tight text-[var(--text-soft)] [font-variant-numeric:tabular-nums] [&>span]:truncate"
              role="row"
            >
              <span>{score.unitId}</span>
              <span>{score.teamId}</span>
              <span>{score.kills}</span>
              <span>{score.deaths}</span>
              <span>{score.damageDealt.toFixed(0)}</span>
            </div>
          ))}
        </div>
      )}

      {frame.ruleState.captureZones.length > 0 && (
        <div className="grid gap-1">
          {frame.ruleState.captureZones.map((zone) => (
            <div
              key={zone.id}
              className={cn(
                "grid grid-cols-[minmax(0,1fr)_auto] gap-x-2 gap-y-1 rounded-md border border-[var(--line)] bg-[var(--surface-well)] p-1.5",
                zone.contested && "border-[var(--status-contested-border)]",
              )}
            >
              <span className="u-label min-w-0 truncate">{zone.id}</span>
              <strong className="text-[12px] font-semibold leading-tight text-[var(--text)] [font-variant-numeric:tabular-nums]">
                {zone.heldTicks}/{zone.holdTicksRequired}
              </strong>
              <em className="u-label col-span-full min-w-0 truncate not-italic text-[var(--brand)]">
                {zone.contested
                  ? "contested"
                  : zone.ownerTeamId > 0
                    ? `team ${zone.ownerTeamId}`
                    : "neutral"}
              </em>
            </div>
          ))}
        </div>
      )}
    </div>
  );
}
