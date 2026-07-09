import { useMemo, useState } from "react";

import type { BattleReplay } from "../../replay/replay";
import {
  DEFAULT_RESEARCH_BOT_SOURCE,
  RESEARCH_BATTLE_PRESETS,
  RESEARCH_UNIT_PRESETS,
  createResearchBattleConfigJson,
  runResearchInBrowser,
  type BotLogEntry,
} from "../../research/research.ts";

export type UseResearchRunDeps = {
  applyReplay: (replay: BattleReplay, autoplay: boolean) => void;
  setStatus: (status: string, options?: { isError?: boolean }) => void;
  setIsLoading: (isLoading: boolean) => void;
  pause: () => void;
};

export type UseResearchRunResult = {
  researchBattlePresetId: string;
  setResearchBattlePresetId: (id: string) => void;
  researchUnitPresetId: string;
  setResearchUnitPresetId: (id: string) => void;
  researchBotSource: string;
  setResearchBotSource: (source: string) => void;
  researchTickCount: number;
  setResearchTickCount: (tickCount: number) => void;
  botLogs: BotLogEntry[];
  setBotLogs: (logs: BotLogEntry[]) => void;
  researchBattlePreset: (typeof RESEARCH_BATTLE_PRESETS)[number] | undefined;
  researchUnitPreset: (typeof RESEARCH_UNIT_PRESETS)[number] | undefined;
  researchBattleConfigJson: string;
  runResearch: () => Promise<void>;
};

export function useResearchRun(deps: UseResearchRunDeps): UseResearchRunResult {
  const [researchBattlePresetId, setResearchBattlePresetId] = useState(RESEARCH_BATTLE_PRESETS[0]?.id ?? "");
  const [researchUnitPresetId, setResearchUnitPresetId] = useState(RESEARCH_UNIT_PRESETS[0]?.id ?? "");
  const [researchBotSource, setResearchBotSource] = useState(DEFAULT_RESEARCH_BOT_SOURCE);
  const [researchTickCount, setResearchTickCount] = useState(180);
  const [botLogs, setBotLogs] = useState<BotLogEntry[]>([]);

  const researchBattlePreset = RESEARCH_BATTLE_PRESETS.find((preset) => preset.id === researchBattlePresetId) ?? RESEARCH_BATTLE_PRESETS[0];
  const researchUnitPreset = RESEARCH_UNIT_PRESETS.find((preset) => preset.id === researchUnitPresetId) ?? RESEARCH_UNIT_PRESETS[0];
  const researchBattleConfigJson = useMemo(
    () => createResearchBattleConfigJson({
      battlePresetId: researchBattlePresetId,
      unitPresetId: researchUnitPresetId,
    }),
    [researchBattlePresetId, researchUnitPresetId],
  );

  async function runResearch(): Promise<void> {
    deps.pause();
    deps.setIsLoading(true);
    deps.setStatus("Running research");
    try {
      const result = await runResearchInBrowser({
        battleConfigJson: researchBattleConfigJson,
        botSource: researchBotSource,
        tickCount: researchTickCount,
      });
      setBotLogs(result.logs);
      deps.applyReplay(result.replay, true);
      deps.setStatus(`Research run loaded - ${result.replay.frames.length} frames`);
    } catch (error: unknown) {
      deps.setStatus(`Research run failed: ${errorMessage(error)}`, { isError: true });
    } finally {
      deps.setIsLoading(false);
    }
  }

  return {
    researchBattlePresetId,
    setResearchBattlePresetId,
    researchUnitPresetId,
    setResearchUnitPresetId,
    researchBotSource,
    setResearchBotSource,
    researchTickCount,
    setResearchTickCount,
    botLogs,
    setBotLogs,
    researchBattlePreset,
    researchUnitPreset,
    researchBattleConfigJson,
    runResearch,
  };
}

function errorMessage(error: unknown): string {
  return error instanceof Error ? error.message : String(error);
}
