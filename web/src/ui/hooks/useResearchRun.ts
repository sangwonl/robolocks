import { useEffect, useMemo, useRef, useState } from "react";

import type { BattleReplay } from "../../replay/replay";
import {
  DEFAULT_RESEARCH_BOT_SOURCE,
  RESEARCH_BATTLE_PRESETS,
  RESEARCH_UNIT_PRESETS,
  createResearchBattleConfigJson,
  type BotLogEntry,
} from "../../research/research.ts";
import {
  parseWorkerMessage,
  runRequest,
  type ResearchProgress,
} from "../../research/researchWorkerProtocol.ts";

export type UseResearchRunDeps = {
  applyReplay: (replay: BattleReplay, autoplay: boolean) => void;
  setStatus: (status: string, options?: { isError?: boolean }) => void;
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
  isResearchRunning: boolean;
  researchProgress: ResearchProgress | null;
  runResearch: () => void;
  cancelResearch: () => void;
};

export function useResearchRun(deps: UseResearchRunDeps): UseResearchRunResult {
  const [researchBattlePresetId, setResearchBattlePresetId] = useState(RESEARCH_BATTLE_PRESETS[0]?.id ?? "");
  const [researchUnitPresetId, setResearchUnitPresetId] = useState(RESEARCH_UNIT_PRESETS[0]?.id ?? "");
  const [researchBotSource, setResearchBotSource] = useState(DEFAULT_RESEARCH_BOT_SOURCE);
  const [researchTickCount, setResearchTickCount] = useState(180);
  const [botLogs, setBotLogs] = useState<BotLogEntry[]>([]);
  const [isResearchRunning, setIsResearchRunning] = useState(false);
  const [researchProgress, setResearchProgress] = useState<ResearchProgress | null>(null);
  const workerRef = useRef<Worker | null>(null);

  const researchBattlePreset = RESEARCH_BATTLE_PRESETS.find((preset) => preset.id === researchBattlePresetId) ?? RESEARCH_BATTLE_PRESETS[0];
  const researchUnitPreset = RESEARCH_UNIT_PRESETS.find((preset) => preset.id === researchUnitPresetId) ?? RESEARCH_UNIT_PRESETS[0];
  const researchBattleConfigJson = useMemo(
    () => createResearchBattleConfigJson({
      battlePresetId: researchBattlePresetId,
      unitPresetId: researchUnitPresetId,
    }),
    [researchBattlePresetId, researchUnitPresetId],
  );

  // Tear down the worker on unmount so a run in flight never outlives the app.
  useEffect(() => () => teardownWorker(workerRef), []);

  function finishRun(): void {
    teardownWorker(workerRef);
    setIsResearchRunning(false);
    setResearchProgress(null);
  }

  function runResearch(): void {
    if (workerRef.current) {
      return;
    }
    deps.pause();
    setBotLogs([]);
    setIsResearchRunning(true);
    setResearchProgress({ stage: "loading-python" });
    deps.setStatus("Running research");

    const worker = new Worker(new URL("../../research/researchWorker.ts", import.meta.url), { type: "module" });
    workerRef.current = worker;

    worker.onmessage = (event: MessageEvent) => {
      const message = parseWorkerMessage(event.data);
      if (!message) {
        return;
      }
      if (message.type === "progress") {
        setResearchProgress({ stage: message.stage, tick: message.tick, totalTicks: message.totalTicks });
        return;
      }
      if (message.type === "done") {
        finishRun();
        setBotLogs(message.logs);
        deps.applyReplay(message.replay, true);
        deps.setStatus(`Research run loaded - ${message.replay.frames.length} frames`);
        return;
      }
      finishRun();
      deps.setStatus(`Research run failed: ${message.message}`, { isError: true });
    };

    worker.onerror = (event: ErrorEvent) => {
      finishRun();
      deps.setStatus(`Research run failed: ${event.message || "worker error"}`, { isError: true });
    };

    worker.postMessage(runRequest({
      botSource: researchBotSource,
      battleConfigJson: researchBattleConfigJson,
      tickCount: researchTickCount,
    }));
  }

  function cancelResearch(): void {
    if (!workerRef.current) {
      return;
    }
    finishRun();
    deps.setStatus("Research run cancelled");
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
    isResearchRunning,
    researchProgress,
    runResearch,
    cancelResearch,
  };
}

function teardownWorker(workerRef: { current: Worker | null }): void {
  if (workerRef.current) {
    workerRef.current.terminate();
    workerRef.current = null;
  }
}
