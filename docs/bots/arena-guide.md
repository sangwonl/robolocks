# Arena Guide

Arena is the browser-side evaluation loop for bots. Use the Hangar to build and
save bots, then use Arena to run repeatable matchups between any saved Hangar bot
and any imported GitHub bot.

Arena is local-first:

- It runs in your browser against the WASM engine.
- It stores imported repos, selected bots, practice ratings, and the last run
  summary in browser localStorage.
- It does not use a server, shared database, or official leaderboard yet.

For bot API details, read [writing-bots.md](writing-bots.md). For execution model
and determinism, read [bot-system.md](bot-system.md).

---

## Quick Start

1. Open the browser app:

   ```bash
   cd web
   npm install
   npm run dev
   ```

2. Go to **Hangar**.
3. Pick a unit preset and bot logic preset, or write Python code in the editor.
4. Run the Hangar test until the bot behaves well enough.
5. Click **New bot**, enter a name, then **Save**. This adds the bot to the Arena
   pool.
6. Go to **Arena**.
7. Select **My bot** and **Opponent** from the same bot pool.
8. Set battle, rule, seed, run count, and tick deadline.
9. Click **Run**.

The final replay shown in the battle scene is the last seed from the Arena run.
The Arena panel keeps the aggregate result across all seeds.

---

## Bot Pool

Arena can run any two bots from the same pool:

- **Hangar bots**: saved from the Hangar tab. These are local browser builds made
  from the current Python code and unit preset.
- **Imported bots**: loaded from GitHub repos with a `robolocks.bot.json`
  manifest.

Both **My bot** and **Opponent** use the same pool. You can run:

- Hangar bot vs imported bot.
- Hangar bot vs Hangar bot.
- Imported bot vs imported bot.
- A bot against itself, if you want a sanity check. Self-play does not update
  ratings.

The names **My bot** and **Opponent** are UI roles for the current run:

- **My bot** becomes team 1 in the engine.
- **Opponent** becomes team 2.
- The run summary reports results as `My bot` and `Opponent`, not `left` and
  `right`.

---

## Saving Bots From Hangar

Hangar is where you author a local bot:

1. Choose the unit preset.
2. Edit the Python source.
3. Click **Apply** in the editor when you want the current source to be used by
   the simulation.
4. Use **Run** to test the bot against the configured test opponent.
5. Use the **Bot** control:
   - Default state: select an existing saved bot, or delete it.
   - **New bot**: switches to a name input.
   - **Save**: stores a new bot snapshot with the current unit preset and Python
     source.
   - **Cancel**: returns to the saved bot selector without saving.

Saving creates a new bot entry. It does not overwrite an existing bot. Delete a
saved Hangar bot from Hangar; Arena removes that bot from local ratings and run
summary references.

---

## Importing GitHub Bots

Arena imports a bot from a GitHub repository by fetching raw files from the
selected ref. Enter one of these forms in the **Bot pool** input:

```text
owner/repo
owner/repo@ref
github:owner/repo@ref
https://github.com/owner/repo
https://github.com/owner/repo/tree/ref
```

If no ref is provided, Arena uses `main`.

The repository must contain `robolocks.bot.json` at its root. A simple repo can
export one bot:

```json
{
  "name": "ridge-runner",
  "version": "0.1.0",
  "sdkVersion": "0.1",
  "entry": "bot.py",
  "unit": "unit.json",
  "author": "you"
}
```

Required:

| Field | Meaning |
| --- | --- |
| `entry` | Python bot file to load. |

Optional:

| Field | Meaning |
| --- | --- |
| `name` | Display name in Arena. Defaults to the repo name. |
| `version` | Display/build metadata. Defaults to the Git ref. |
| `sdkVersion` | SDK compatibility metadata. Defaults to `0.1`. |
| `unit` | JSON file describing the unit preset/modules. |
| `author` | Display/build metadata. |
| `description` | Metadata; currently not shown in the UI. |

If `unit` is omitted, Arena uses the default Hangar unit preset.

A repo can also export multiple bots. Shared metadata (`version`, `sdkVersion`,
`unit`, `author`) is inherited by each entry unless the entry overrides it:

```json
{
  "version": "0.1.0",
  "sdkVersion": "0.1",
  "unit": "unit.json",
  "author": "you",
  "bots": [
    { "name": "ridge-skirmisher", "entry": "bots/skirmisher.py" },
    { "name": "wall-runner", "entry": "bots/wall_runner.py", "unit": "wall-unit.json" }
  ]
}
```

When a repo has `bots[]`, Arena adds every entry to the bot pool.

Example `unit.json`:

```json
{
  "unitPresetId": "scout_optics"
}
```

Advanced unit config can include explicit modules:

```json
{
  "unitPresetId": "standard_tank",
  "modules": {
    "mobility": { "id": "tracked_chassis_mk1" },
    "weapon": { "id": "standard_cannon_v0" }
  }
}
```

The imported repo list is grouped by `owner/repo@ref`. **Remove** removes the
whole repo import from the browser pool, not just a single bot row.

---

## Arena Settings

| Control | Meaning |
| --- | --- |
| `My bot` | Team 1 entrant for this run. |
| `Opponent` | Team 2 entrant for this run. |
| `Battlefield` | Map/spawn/obstacle preset. |
| `Rule` | Win condition: kill limit, timed deathmatch, or capture point. |
| `Seed` | First deterministic seed. |
| `Runs` | Number of sequential seeds to run. Seed `101` with `3` runs means `101`, `102`, `103`. |
| `Ticks` | Safety deadline for each run. The battle can end earlier when the rule resolves. |

The seed and run count are important because one deterministic battle can be
misleading. Running a small seed set gives a better first read on whether a bot
is robust or just lucky in one spawn/firing sequence.

---

## Practice Ratings

The ratings table is a local practice leaderboard for the browser.

Each row means:

| UI | Meaning |
| --- | --- |
| `#1`, `#2`, ... | Rank in this browser, sorted by rating. Unrated bots are listed after rated bots. |
| Bot name | A saved Hangar bot or imported GitHub bot in the pool. |
| Origin | `Hangar` for local saved bots, or `owner/repo` for imported bots. |
| Record | Number of completed rated Arena runs and W/L/D. |
| Rating | Local Elo-style score. Bots with no rated runs show `Unrated`. |

Ratings update only after completed Arena runs between two different bot IDs.
Self-play produces a run summary, but rating stays unchanged.

The initial rating baseline is 1000, but Arena does not display `1000` for bots
with no matches. They appear as `Unrated` until they finish a rated run.

---

## Run Summary

The run summary describes the most recent Arena evaluation:

```text
My bot: sample-skirmisher
Opponent: imported-kiter
3 runs · seeds 101, 102, 103
My bot 2 - 1 Opponent

seed 101 · kills 2-0 · My bot won
seed 102 · kills 0-2 · Opponent won
seed 103 · kills 2-1 · My bot won
```

The aggregate score is match wins across the seed set, not total kills. Kills are
shown per seed as extra detail.

The replay viewer shows the last run's replay. Use the run summary to understand
the full multi-seed evaluation.

---

## Troubleshooting

### Run is disabled

Arena needs at least one bot in the pool. Save a bot from Hangar or import a
GitHub repo.

### Import fails

Check:

- The repo is public, or the browser can access its raw GitHub files.
- `robolocks.bot.json` exists at the repo root.
- The manifest has a non-empty `entry`.
- `entry` and `unit` paths are relative to the repo root and exist at the chosen
  ref.

### Bot appears but does nothing

Open the bot in Hangar if it is local, or inspect the imported source in its repo.
Common causes:

- It never calls `run_bot(on_tick)`.
- It returns no orders.
- It never scans, so `contacts` stays empty.
- It aims/fires but does not move because its movement orders conflict.

### Results feel inconsistent

Arena is deterministic for the same engine version, bot sources, battle config,
and seed set. If the same run changes, check whether you changed:

- Bot code.
- Unit preset/module config.
- Battle/rule preset.
- Seed or run count.
- Engine/WASM build.

### Ratings look wrong

Ratings are local browser practice data. They are not official and are not shared
between browsers. Clearing browser storage clears them.
