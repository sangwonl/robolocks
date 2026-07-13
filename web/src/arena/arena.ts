import { MAX_HANGAR_TICKS, HANGAR_UNIT_PRESETS, createHangarBattleConfigJson, type HangarRuleParams, type HangarUnitPreset } from "../hangar/hangar.ts";
import type { BattleReplay } from "../replay/replay";

export type BotBuildSource =
  | { kind: "local" }
  | { kind: "github"; owner: string; repo: string; ref: string };

export type BotBuildUnit = {
  unitPresetId: string;
  modules?: Record<string, unknown>;
};

export type BotBuild = {
  id: string;
  name: string;
  version: string;
  createdAt: string;
  sdkVersion: string;
  author: string;
  code: string;
  unit: BotBuildUnit;
  source: BotBuildSource;
};

export type GitHubBotReference = {
  owner: string;
  repo: string;
  ref: string;
};

export type GitHubBotManifest = {
  name?: unknown;
  version?: unknown;
  sdkVersion?: unknown;
  entry?: unknown;
  unit?: unknown;
  author?: unknown;
  description?: unknown;
};

export type ImportGitHubBotBuildOptions = {
  fetchText?: (url: string) => Promise<string>;
  now?: () => string;
};

export type CreateLocalBotBuildOptions = {
  name: string;
  code: string;
  unitPresetId: string;
  now?: () => string;
};

export type BuildArenaBattleConfigOptions = {
  battlePresetId: string;
  rulePresetId: string;
  tickLimit: number;
  seed: number;
  entrants: [BotBuild, BotBuild];
  ruleParams?: HangarRuleParams;
};

export type ArenaMatchSummary = {
  seed: number;
  winnerTeamId: number | null;
  leftKills: number;
  rightKills: number;
  replayFrameCount: number;
};

export type ArenaRatingEntry = {
  buildId: string;
  rating: number;
  matches: number;
  wins: number;
  losses: number;
  draws: number;
};

export type ArenaEvaluationSummary = {
  leftBuildId: string;
  rightBuildId: string;
  leftScore: number;
  rightScore: number;
  winnerBuildId: string | null;
  ratings: Record<string, ArenaRatingEntry>;
};

export type SummarizeArenaEvaluationOptions = {
  leftBuildId: string;
  rightBuildId: string;
  matches: ArenaMatchSummary[];
  previousRatings?: Record<string, ArenaRatingEntry>;
};

export type RemoveArenaBuildStateOptions = {
  builds: BotBuild[];
  ratings: Record<string, ArenaRatingEntry>;
  selectedLeftBuildId: string;
  selectedRightBuildId: string;
  removeBuildId: string;
};

export type RemoveArenaBuildStateResult = {
  builds: BotBuild[];
  ratings: Record<string, ArenaRatingEntry>;
  selectedLeftBuildId: string;
  selectedRightBuildId: string;
};

export type RemoveArenaRepoStateOptions = {
  builds: BotBuild[];
  ratings: Record<string, ArenaRatingEntry>;
  selectedLeftBuildId: string;
  selectedRightBuildId: string;
  owner: string;
  repo: string;
  ref: string;
};

const DEFAULT_GITHUB_REF = "main";
const DEFAULT_MANIFEST_PATH = "robolocks.bot.json";
const DEFAULT_SDK_VERSION = "0.1";
const DEFAULT_AUTHOR = "";
const DEFAULT_RATING = 1000;
const ELO_K_FACTOR = 32;

export function parseGitHubBotReference(input: string): GitHubBotReference {
  const trimmed = input.trim();
  const githubPrefix = "github:";
  if (trimmed.startsWith(githubPrefix)) {
    return parseOwnerRepoRef(trimmed.slice(githubPrefix.length));
  }

  const githubUrl = trimmed.match(/^https:\/\/github\.com\/([^/]+)\/([^/@#?]+)(?:\/tree\/([^#?]+))?/);
  if (githubUrl) {
    return {
      owner: githubUrl[1],
      repo: stripGitSuffix(githubUrl[2]),
      ref: githubUrl[3] || DEFAULT_GITHUB_REF,
    };
  }

  return parseOwnerRepoRef(trimmed);
}

export async function importGitHubBotBuild(input: string, options: ImportGitHubBotBuildOptions = {}): Promise<BotBuild> {
  const reference = parseGitHubBotReference(input);
  const fetchText = options.fetchText ?? fetchTextFromUrl;
  const now = options.now ?? (() => new Date().toISOString());
  const baseUrl = rawGitHubBaseUrl(reference);
  const manifest = parseManifest(await fetchText(`${baseUrl}/${DEFAULT_MANIFEST_PATH}`));
  const entryPath = manifestString(manifest.entry, "entry", "bot.py");
  const unitPath = typeof manifest.unit === "string" ? manifest.unit : "";
  const code = await fetchText(`${baseUrl}/${entryPath}`);
  const unit = unitPath ? parseBotBuildUnit(await fetchText(`${baseUrl}/${unitPath}`)) : { unitPresetId: HANGAR_UNIT_PRESETS[0]?.id ?? "standard_tank" };
  const name = manifestString(manifest.name, "name", reference.repo);
  return {
    id: `github:${reference.owner}/${reference.repo}@${reference.ref}`,
    name,
    version: manifestString(manifest.version, "version", reference.ref),
    createdAt: now(),
    sdkVersion: manifestString(manifest.sdkVersion, "sdkVersion", DEFAULT_SDK_VERSION),
    author: manifestString(manifest.author, "author", DEFAULT_AUTHOR),
    code,
    unit,
    source: { kind: "github", ...reference },
  };
}

export function createLocalBotBuild(options: CreateLocalBotBuildOptions): BotBuild {
  const now = options.now ?? (() => new Date().toISOString());
  const name = options.name.trim() || "Local Bot";
  const unit: BotBuildUnit = { unitPresetId: options.unitPresetId };
  const fingerprint = hashText(JSON.stringify({ code: options.code, unit })).slice(0, 8);
  return {
    id: `local:${slugify(name)}:${fingerprint}`,
    name,
    version: "local",
    createdAt: now(),
    sdkVersion: DEFAULT_SDK_VERSION,
    author: "local",
    code: options.code,
    unit,
    source: { kind: "local" },
  };
}

export function buildArenaBattleConfigJson(options: BuildArenaBattleConfigOptions): string {
  const [left, right] = options.entrants;
  const base = JSON.parse(createHangarBattleConfigJson({
    battlePresetId: options.battlePresetId,
    rulePresetId: options.rulePresetId,
    unitPresetIdByUnit: {
      1: left.unit.unitPresetId,
      2: right.unit.unitPresetId,
    },
    ruleParams: options.ruleParams,
    maxTicks: options.tickLimit,
  })) as Record<string, unknown>;
  const units = Array.isArray(base.units) ? base.units.map((unit) => ({ ...(unit as Record<string, unknown>) })) : [];
  applyEntrantToUnit(units, 0, left);
  applyEntrantToUnit(units, 1, right);
  return JSON.stringify({
    ...base,
    battleId: `arena_${options.battlePresetId}_${options.rulePresetId}_${options.seed}`,
    seed: options.seed,
    tickLimit: clampTickLimit(options.tickLimit),
    units,
  });
}

export function summarizeArenaEvaluation(options: SummarizeArenaEvaluationOptions): ArenaEvaluationSummary {
  const leftScore = options.matches.reduce((score, match) => score + matchScore(match.winnerTeamId, 1), 0);
  const rightScore = options.matches.reduce((score, match) => score + matchScore(match.winnerTeamId, 2), 0);
  const result = leftScore > rightScore ? 1 : rightScore > leftScore ? 0 : 0.5;
  const ratings = { ...(options.previousRatings ?? {}) };
  if (options.leftBuildId === options.rightBuildId) {
    return {
      leftBuildId: options.leftBuildId,
      rightBuildId: options.rightBuildId,
      leftScore,
      rightScore,
      winnerBuildId: null,
      ratings,
    };
  }
  const leftPrevious = ratings[options.leftBuildId] ?? defaultRatingEntry(options.leftBuildId);
  const rightPrevious = ratings[options.rightBuildId] ?? defaultRatingEntry(options.rightBuildId);
  const expectedLeft = expectedScore(leftPrevious.rating, rightPrevious.rating);
  const leftRating = leftPrevious.rating + ELO_K_FACTOR * (result - expectedLeft);
  const rightRating = rightPrevious.rating + ELO_K_FACTOR * ((1 - result) - (1 - expectedLeft));
  ratings[options.leftBuildId] = nextRatingEntry(leftPrevious, leftRating, result);
  ratings[options.rightBuildId] = nextRatingEntry(rightPrevious, rightRating, 1 - result);
  return {
    leftBuildId: options.leftBuildId,
    rightBuildId: options.rightBuildId,
    leftScore,
    rightScore,
    winnerBuildId: result === 1 ? options.leftBuildId : result === 0 ? options.rightBuildId : null,
    ratings,
  };
}

export function matchSummaryFromReplay(replay: BattleReplay, seed: number): ArenaMatchSummary {
  const finalFrame = replay.frames[replay.frames.length - 1];
  const scores = finalFrame?.ruleState?.scores ?? [];
  const scoreForTeam = (teamId: number) => scores.find((score) => score.teamId === teamId);
  return {
    seed,
    winnerTeamId: finalFrame?.ruleState?.outcome?.winnerTeamId ?? null,
    leftKills: scoreForTeam(1)?.kills ?? 0,
    rightKills: scoreForTeam(2)?.kills ?? 0,
    replayFrameCount: replay.frames.length,
  };
}

export function seedsFromStart(startSeed: number, count: number): number[] {
  const safeCount = Math.max(1, Math.min(25, Math.floor(count)));
  return Array.from({ length: safeCount }, (_, index) => Math.floor(startSeed) + index);
}

export function arenaBotSourcesByUnit(left: BotBuild, right: BotBuild): Record<number, string> {
  return { 1: left.code, 2: right.code };
}

export function canStartArenaEvaluation(builds: BotBuild[], leftBuildId: string, rightBuildId: string): boolean {
  if (!leftBuildId || !rightBuildId) {
    return false;
  }
  const ids = new Set(builds.map((build) => build.id));
  return ids.has(leftBuildId) && ids.has(rightBuildId);
}

export function removeArenaBuildState(options: RemoveArenaBuildStateOptions): RemoveArenaBuildStateResult {
  const builds = options.builds.filter((build) => build.id !== options.removeBuildId);
  const ratings = { ...options.ratings };
  delete ratings[options.removeBuildId];
  const selected = normalizeBuildSelection(builds, options.selectedLeftBuildId, options.selectedRightBuildId);
  return {
    builds,
    ratings,
    selectedLeftBuildId: selected.left,
    selectedRightBuildId: selected.right,
  };
}

export function removeArenaRepoState(options: RemoveArenaRepoStateOptions): RemoveArenaBuildStateResult {
  const removedIds = new Set(
    options.builds
      .filter((build) => build.source.kind === "github"
        && build.source.owner === options.owner
        && build.source.repo === options.repo
        && build.source.ref === options.ref)
      .map((build) => build.id),
  );
  const builds = options.builds.filter((build) => !removedIds.has(build.id));
  const ratings = { ...options.ratings };
  for (const id of removedIds) {
    delete ratings[id];
  }
  const selected = normalizeBuildSelection(builds, options.selectedLeftBuildId, options.selectedRightBuildId);
  return {
    builds,
    ratings,
    selectedLeftBuildId: selected.left,
    selectedRightBuildId: selected.right,
  };
}

function parseOwnerRepoRef(value: string): GitHubBotReference {
  const match = value.match(/^([^/\s]+)\/([^@\s]+)(?:@(.+))?$/);
  if (!match) {
    throw new Error("Use owner/repo, owner/repo@ref, github:owner/repo@ref, or a github.com URL.");
  }
  return {
    owner: match[1],
    repo: stripGitSuffix(match[2]),
    ref: match[3] || DEFAULT_GITHUB_REF,
  };
}

function stripGitSuffix(repo: string): string {
  return repo.endsWith(".git") ? repo.slice(0, -4) : repo;
}

function rawGitHubBaseUrl(reference: GitHubBotReference): string {
  return `https://raw.githubusercontent.com/${reference.owner}/${reference.repo}/${reference.ref}`;
}

async function fetchTextFromUrl(url: string): Promise<string> {
  const response = await fetch(url);
  if (!response.ok) {
    throw new Error(`${response.status} ${response.statusText}`.trim());
  }
  return response.text();
}

function parseManifest(text: string): GitHubBotManifest {
  const parsed = JSON.parse(text) as GitHubBotManifest;
  if (!isRecord(parsed)) {
    throw new Error("robolocks.bot.json must be a JSON object.");
  }
  if (typeof parsed.entry !== "string" || parsed.entry.trim() === "") {
    throw new Error("robolocks.bot.json must define an entry file.");
  }
  return parsed;
}

function parseBotBuildUnit(text: string): BotBuildUnit {
  const parsed = JSON.parse(text) as unknown;
  if (!isRecord(parsed)) {
    throw new Error("unit config must be a JSON object.");
  }
  const unitPresetId = typeof parsed.unitPresetId === "string" ? parsed.unitPresetId : HANGAR_UNIT_PRESETS[0]?.id ?? "standard_tank";
  const modules = isRecord(parsed.modules) ? parsed.modules : undefined;
  return modules ? { unitPresetId, modules } : { unitPresetId };
}

function manifestString(value: unknown, field: string, fallback: string): string {
  if (value === undefined || value === null || value === "") {
    return fallback;
  }
  if (typeof value !== "string") {
    throw new Error(`robolocks.bot.json field ${field} must be a string.`);
  }
  return value;
}

function applyEntrantToUnit(units: Record<string, unknown>[], index: number, build: BotBuild): void {
  const unit = units[index];
  if (!unit) {
    return;
  }
  unit.name = build.name;
  if (build.unit.modules) {
    unit.modules = build.unit.modules;
  } else {
    const preset = unitPresetById(build.unit.unitPresetId);
    unit.modules = preset.modules;
  }
}

function unitPresetById(id: string): HangarUnitPreset {
  return HANGAR_UNIT_PRESETS.find((preset) => preset.id === id) ?? HANGAR_UNIT_PRESETS[0];
}

function clampTickLimit(value: number): number {
  return Math.max(1, Math.min(MAX_HANGAR_TICKS, Math.floor(value)));
}

function slugify(value: string): string {
  return value.toLowerCase().replace(/[^a-z0-9]+/g, "-").replace(/^-|-$/g, "") || "bot";
}

function hashText(value: string): string {
  let hash = 2166136261;
  for (let i = 0; i < value.length; i += 1) {
    hash ^= value.charCodeAt(i);
    hash = Math.imul(hash, 16777619);
  }
  return (hash >>> 0).toString(16).padStart(8, "0");
}

function matchScore(winnerTeamId: number | null, teamId: number): number {
  if (winnerTeamId === null) {
    return 0.5;
  }
  return winnerTeamId === teamId ? 1 : 0;
}

function expectedScore(rating: number, opponentRating: number): number {
  return 1 / (1 + 10 ** ((opponentRating - rating) / 400));
}

function defaultRatingEntry(buildId: string): ArenaRatingEntry {
  return { buildId, rating: DEFAULT_RATING, matches: 0, wins: 0, losses: 0, draws: 0 };
}

function nextRatingEntry(previous: ArenaRatingEntry, rating: number, result: number): ArenaRatingEntry {
  return {
    ...previous,
    rating: Math.round(rating),
    matches: previous.matches + 1,
    wins: previous.wins + (result === 1 ? 1 : 0),
    losses: previous.losses + (result === 0 ? 1 : 0),
    draws: previous.draws + (result === 0.5 ? 1 : 0),
  };
}

function normalizeBuildSelection(builds: BotBuild[], left: string, right: string): { left: string; right: string } {
  const ids = builds.map((build) => build.id);
  return {
    left: ids.includes(left) ? left : ids[0] ?? "",
    right: ids.includes(right) ? right : ids.find((id) => id !== left) ?? ids[1] ?? ids[0] ?? "",
  };
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null;
}
