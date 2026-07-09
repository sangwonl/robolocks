export type TeamColors = {
  body: number;
  accent: number;
  arc: number;
  css: string;
};

const BLUE_TEAM: TeamColors = {
  body: 0x527ead,
  accent: 0x5f9ee6,
  arc: 0x77b7ff,
  css: "#5f9ee6",
};

const RED_TEAM: TeamColors = {
  body: 0xb9564f,
  accent: 0xdf645b,
  arc: 0xff7a70,
  css: "#df645b",
};

const NEUTRAL_TEAM: TeamColors = {
  body: 0x788470,
  accent: 0x343a32,
  arc: 0x788470,
  css: "#343a32",
};

const TEAM_COLORS: Record<number, TeamColors> = {
  1: BLUE_TEAM,
  2: RED_TEAM,
};

/** Resolves the render palette for a given engine `teamId`. Team 1 is blue, team 2 is red, everything else is neutral gray. */
export function teamColor(teamId: number): TeamColors {
  return TEAM_COLORS[teamId] ?? NEUTRAL_TEAM;
}

/**
 * CSS custom properties for the team palette, keyed by the variable name
 * styles.css expects (e.g. `--team-1-accent`). This is the single source of
 * truth for team colors: apply the result once at the app root (see
 * app.tsx) so styles.css never hardcodes a team hex directly.
 */
export function teamCssVariables(): Record<string, string> {
  return {
    "--team-1-accent": BLUE_TEAM.css,
    "--team-2-accent": RED_TEAM.css,
  };
}
