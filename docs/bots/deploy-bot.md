# Deploying Bots

Publish a Robolocks bot by putting a small Python bot repo on GitHub. Arena can
then import it directly from the browser with `owner/repo` or `owner/repo@ref`.

For the bot API itself, read [writing-bots.md](writing-bots.md). For how imported
bots are evaluated in the browser, read [arena-guide.md](arena-guide.md).

---

## Minimal Repo

A single-bot repo needs only two files:

```text
robolocks.bot.json
bot.py
```

`robolocks.bot.json`:

```json
{
  "name": "ridge-runner",
  "version": "0.1.0",
  "sdkVersion": "0.1",
  "entry": "bot.py",
  "author": "you"
}
```

`bot.py`:

```python
from robolocks import AimAt, BattleState, FireIfSolution, MoveTo, OrderLike, ScanArc, run_bot


def on_tick(state: BattleState) -> list[OrderLike]:
    own = state.own_unit
    enemy = state.contacts.closest_enemy()
    if enemy is None:
        return [ScanArc(direction=own.turret_heading, width=160.0)]
    return [
        AimAt(enemy.position),
        ScanArc(direction=own.turret_heading, width=160.0),
        FireIfSolution(min_hit_chance=0.35),
        MoveTo(enemy.position),
    ]


run_bot(on_tick)
```

Push those files to GitHub. In Arena, enter:

```text
your-org/ridge-runner
```

If the bot is not on the `main` branch, include a ref:

```text
your-org/ridge-runner@dev
your-org/ridge-runner@v0.1.0
https://github.com/your-org/ridge-runner/tree/dev
```

Arena fetches raw files from GitHub, imports the bot into the local browser bot
pool, and stores the imported repo in localStorage.

---

## Manifest Reference

The repo root must contain `robolocks.bot.json`.

Required:

| Field | Meaning |
| --- | --- |
| `entry` | Python file to load, relative to the repo root. |

Optional:

| Field | Meaning |
| --- | --- |
| `name` | Bot display name in Arena. Defaults to the repo name. |
| `version` | Build metadata. Defaults to the imported Git ref. |
| `sdkVersion` | SDK compatibility metadata. Defaults to `0.1`. |
| `unit` | Unit config JSON path, relative to the repo root. |
| `author` | Display/build metadata. |
| `description` | Metadata for humans; currently not shown in the UI. |

The browser import is file-based. It does not run install scripts, package
managers, or repository setup commands.

---

## Unit Config

If `unit` is omitted, Arena uses the default Hangar unit preset. To pin a unit
preset, add a unit file and reference it from the manifest.

`robolocks.bot.json`:

```json
{
  "name": "ridge-runner",
  "entry": "bot.py",
  "unit": "unit.json"
}
```

`unit.json`:

```json
{
  "unitPresetId": "scout_optics"
}
```

Advanced unit config can include explicit module overrides:

```json
{
  "unitPresetId": "standard_tank",
  "modules": {
    "mobility": { "id": "tracked_chassis_mk1" },
    "weapon": { "id": "standard_cannon_v0" }
  }
}
```

Keep the bot code and unit config in sync. A bot tuned for a fast scout may stall
or overcommit if imported with a slow heavy unit.

---

## Multiple Bots In One Repo

Use `bots[]` when a repo should publish several bots. Shared fields at the top
level are inherited by each bot entry unless the entry overrides them.

```json
{
  "version": "0.1.0",
  "sdkVersion": "0.1",
  "author": "you",
  "unit": "units/standard.json",
  "bots": [
    {
      "name": "ridge-skirmisher",
      "entry": "bots/skirmisher.py"
    },
    {
      "name": "wall-runner",
      "entry": "bots/wall_runner.py",
      "unit": "units/wall-runner.json"
    }
  ]
}
```

When imported, Arena adds every valid `bots[]` entry to the same local bot pool.
Removing the repo from Arena removes all bots imported from that `owner/repo@ref`.

---

## Recommended Repo Layout

```text
robolocks-bot/
  robolocks.bot.json
  README.md
  bots/
    skirmisher.py
    wall_runner.py
  units/
    standard.json
    wall-runner.json
```

Add a short README that explains:

- What each bot is trying to do.
- Which Arena rule/map it was tuned against.
- Which ref or tag others should import.
- Any current weaknesses or known matchups.

---

## Release Flow

1. Test the bot in Hangar until movement, sensing, and firing are stable.
2. Save the bot locally and run it in Arena against a few opponents.
3. Move the Python source and unit config into the GitHub repo.
4. Add or update `robolocks.bot.json`.
5. Commit and push.
6. Import `owner/repo@branch` in Arena and verify it appears in the bot pool.
7. When it looks good, tag the repo:

   ```bash
   git tag v0.1.0
   git push origin v0.1.0
   ```

8. Share the stable import string:

   ```text
   owner/repo@v0.1.0
   ```

Using a tag makes matchups repeatable. Importing `owner/repo` tracks `main`, so a
new push can change the bot without changing the import text.

---

## Import Checklist

If Arena cannot import the repo, check:

- The repo is public, or raw GitHub files are reachable from the browser.
- `robolocks.bot.json` is at the repo root.
- The manifest has `entry` or at least one `bots[].entry`.
- Every `entry` path exists at the selected ref.
- Every referenced `unit` path exists at the selected ref.
- The bot file ends with `run_bot(on_tick)`.
- The bot imports from `robolocks`, not from local SDK files.

If the bot imports but does nothing, it is usually a bot logic issue rather than a
deployment issue: make sure it scans, returns orders, and does not combine
conflicting movement orders.
