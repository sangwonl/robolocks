import type { BattleAction, BattleEvent, BattleFrame, UnitFrame } from "../types/protocol";
import { Accordion, AccordionContent, AccordionItem, AccordionTrigger } from "../components/ui/accordion.tsx";
import { actionItems, eventItems, intentItems, moduleItems, shapeLabel, type FormattedItem } from "./unitFormat.ts";

export type InspectorProps = {
  frame: BattleFrame | null;
};

export function Inspector({ frame }: InspectorProps) {
  if (!frame) {
    return <div className="inspector inspector-empty">Load a replay to inspect unit state.</div>;
  }
  return (
    <div className="inspector">
      <div className="unit-stack">
        {frame.units.map((unit) => (
          <UnitCard
            key={unit.unitId}
            unit={unit}
            actions={frame.actions.filter((action) => action.unitId === unit.unitId)}
            events={frame.events.filter((event) => event.unitId === unit.unitId)}
          />
        ))}
      </div>
    </div>
  );
}

export type UnitCardProps = {
  unit: UnitFrame;
  actions: BattleAction[];
  events: BattleEvent[];
};

export function UnitCard({ unit, actions, events }: UnitCardProps) {
  return (
    <Accordion type="single" collapsible className="unit-card" data-team={unit.teamId}>
      <AccordionItem value="unit" className="unit-card-item">
        <AccordionTrigger className="unit-card-head">
          <span className="unit-card-title">
            <strong>{unit.name}</strong>
            <span className="u-label">unit {unit.unitId}</span>
          </span>
        </AccordionTrigger>
        <AccordionContent>
          <div className="unit-card-body">
            <dl className="unit-stats">
              <Stat label="Position" value={`${unit.position.x.toFixed(2)}, ${unit.position.y.toFixed(2)}`} />
              <Stat label="Hull" value={`${unit.hullHeadingDegrees.toFixed(1)} deg`} />
              <Stat label="Turret" value={`${unit.turretHeadingDegrees.toFixed(1)} deg`} />
              <Stat label="Shape" value={shapeLabel(unit.bodyShape)} />
              <Stat label="Armor" value={unit.armorIntegrity.toFixed(0)} />
              <Stat label="Reload" value={`${unit.weaponCooldownTicks} ticks`} />
            </dl>
            <UnitSection title="Modules" items={moduleItems(unit)} />
            <UnitSection title="Intents" items={intentItems(unit)} />
            <UnitSection title="Actions" items={actionItems(actions)} />
            <UnitSection title="Events" items={eventItems(events)} />
          </div>
        </AccordionContent>
      </AccordionItem>
    </Accordion>
  );
}

export type StatProps = {
  label: string;
  value: string;
};

export function Stat({ label, value }: StatProps) {
  return (
    <div>
      <dt className="u-label">{label}</dt>
      <dd>{value}</dd>
    </div>
  );
}

export type UnitSectionProps = {
  title: string;
  items: FormattedItem[];
};

export function UnitSection({ title, items }: UnitSectionProps) {
  return (
    <>
      <div className="unit-subtitle u-label">{title}</div>
      <ul className="action-list">
        {items.map((item, index) => (
          <li key={`${item.label}-${index}`}>
            <span>{item.label}</span> {item.value}
          </li>
        ))}
      </ul>
    </>
  );
}
