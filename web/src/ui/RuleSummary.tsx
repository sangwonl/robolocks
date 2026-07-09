import type { BattleFrame } from "../types/protocol";

export type RuleSummaryProps = {
  frame: BattleFrame | null;
};

export function RuleSummary({ frame }: RuleSummaryProps) {
  if (!frame) {
    return <div className="rule-summary rule-summary-empty">No rule state.</div>;
  }
  const { outcome, scores } = frame.ruleState;
  return (
    <div className="rule-summary">
      <div className="rule-outcome" data-finished={outcome.finished}>
        <span className="u-label">{outcome.finished ? "Finished" : "Running"}</span>
        <strong>{outcome.reason || "active"}</strong>
        {(outcome.winnerTeamId > 0 || outcome.winnerUnitId > 0) && (
          <em>
            {outcome.winnerTeamId > 0 ? `team ${outcome.winnerTeamId}` : ""}
            {outcome.winnerUnitId > 0 ? ` unit ${outcome.winnerUnitId}` : ""}
          </em>
        )}
      </div>
      {scores.length === 0 ? (
        <div className="rule-summary-empty">No scores.</div>
      ) : (
        <div className="score-table" role="table" aria-label="Battle scores">
          <div className="score-row score-row-head" role="row">
            <span>Unit</span>
            <span>Team</span>
            <span>K</span>
            <span>D</span>
            <span>Dmg</span>
          </div>
          {scores.map((score) => (
            <div key={`${score.unitId}-${score.teamId}`} className="score-row" role="row">
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
        <div className="capture-zone-list">
          {frame.ruleState.captureZones.map((zone) => (
            <div key={zone.id} className="capture-zone-row" data-contested={zone.contested}>
              <span className="u-label">{zone.id}</span>
              <strong>
                {zone.heldTicks}/{zone.holdTicksRequired}
              </strong>
              <em className="u-label">
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
