import type { BattleAction, BattleEvent, BattleFrame, UnitFrame } from "../types/protocol";
import { Accordion, AccordionContent, AccordionItem, AccordionTrigger } from "../components/ui/accordion.tsx";
import { cn } from "../lib/utils.ts";
import { actionItems, eventItems, intentItems, moduleItems, shapeLabel, type FormattedItem } from "./unitFormat.ts";

export type InspectorProps = {
  frame: BattleFrame | null;
};

export function Inspector({ frame }: InspectorProps) {
  if (!frame) {
    return (
      <div className="border border-dashed border-[var(--line-dashed)] p-2.5 text-[11px] font-semibold text-[var(--text-muted)]">
        Load a replay to inspect unit state.
      </div>
    );
  }
  return (
    <div className="grid min-h-0 gap-2">
      <div className="grid gap-[5px]">
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
    <Accordion
      type="single"
      collapsible
      className={cn(
        "overflow-hidden rounded-md border border-[var(--line)] bg-[var(--surface-sunken)] shadow-[0_1px_0_var(--highlight-faint)]",
        unit.teamId === 1 && "border-l-[3px] border-l-[var(--team-1-accent)]",
        unit.teamId === 2 && "border-l-[3px] border-l-[var(--team-2-accent)]",
      )}
    >
      <AccordionItem value="unit" className="border-b-0">
        <AccordionTrigger className="min-h-[26px] w-full rounded-[5px] border-0 border-b border-b-transparent bg-[var(--surface-well)] px-2 py-1 hover:bg-[var(--surface-hover)] data-[state=open]:rounded-b-none data-[state=open]:border-b-[var(--line)] [&>svg]:ml-1.5 [&>svg]:h-3 [&>svg]:w-3">
          <span className="flex min-w-0 flex-1 items-baseline justify-between gap-1.5">
            <strong className="min-w-0 truncate text-[12px] font-bold leading-[1.1] tracking-[-0.01em] text-[var(--text)]">
              {unit.name}
            </strong>
            <span className="u-label shrink-0 rounded-sm bg-[var(--surface-raised)] px-1 py-0.5 text-[10px]">
              unit {unit.unitId}
            </span>
          </span>
        </AccordionTrigger>
        <AccordionContent>
          <div className="grid gap-1.5 p-1.5">
            <dl className="grid grid-cols-2 gap-1.5">
              <Stat label="Position" value={`${unit.position.x.toFixed(2)}, ${unit.position.y.toFixed(2)}`} />
              <Stat label="Hull" value={`${unit.hullHeadingDegrees.toFixed(1)} deg`} />
              <Stat label="Turret" value={`${unit.turretHeadingDegrees.toFixed(1)} deg`} />
              <Stat label="Shape" value={shapeLabel(unit.bodyShape)} />
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
    <div className="min-w-0 rounded-md border border-[var(--line-subtle)] bg-[var(--surface-well)] px-1.5 py-1">
      <dt className="u-label text-[10px] leading-none">{label}</dt>
      <dd className="mt-1 text-[12px] font-semibold leading-[1.15] text-[var(--text-soft)] [font-variant-numeric:tabular-nums] [overflow-wrap:anywhere]">
        {value}
      </dd>
    </div>
  );
}

export type UnitSectionProps = {
  title: string;
  items: FormattedItem[];
};

export function UnitSection({ title, items }: UnitSectionProps) {
  return (
    <section className="overflow-hidden rounded-md border border-[var(--line-subtle)] bg-[var(--surface-well)]">
      <div className="u-label border-b border-[var(--line-subtle)] bg-[var(--surface-inset)] px-1.5 py-1 text-[10px]">
        {title}
      </div>
      <ul className="grid list-none gap-px p-1 text-[11px] leading-[1.22] text-[var(--text-soft)]">
        {items.map((item, index) => (
          <li
            key={`${item.label}-${index}`}
            className="grid grid-cols-[54px_minmax(0,1fr)] gap-1.5 rounded-sm px-1 py-0.5 odd:bg-[rgba(255,255,255,0.02)]"
          >
            <span className="min-w-0 truncate text-[var(--text-muted)] [font-variant-numeric:tabular-nums]">
              {item.label}
            </span>
            <span className="min-w-0 text-[var(--text-soft)] [overflow-wrap:anywhere]">{item.value}</span>
          </li>
        ))}
      </ul>
    </section>
  );
}
