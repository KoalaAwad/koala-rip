// Loads the JSON data files and joins rankings with per-game info (Steam, OpenCritic, art).
import fs from "node:fs";
import path from "node:path";
import rankingsJson from "../../data/rankings.json";
import gamesJson from "../../data/games.json";
import profileJson from "../../data/profile.json";

export type RankEntry = { rank: number; title: string; score: number; review: string | null };
export type GameInfo = {
  title: string;
  appid?: number | null;
  reviewDesc?: string | null;
  reviewPct?: number | null;
  reviewTotal?: number | null;
  metacritic?: number | null;
  opencritic?: number | null;
  opencriticTier?: string | null;
  cover?: string | null;
  header?: string | null;
};

export const rankings = rankingsJson as Record<string, RankEntry[]>;
export const profile = profileJson;
const games = gamesJson as Record<string, GameInfo>;

export const years = Object.keys(rankings).sort((a, b) => Number(b) - Number(a));

export const slugify = (s: string) =>
  s.toLowerCase().normalize("NFKD").replace(/[^\w\s-]/g, "").trim().replace(/[\s_]+/g, "-").replace(/-+/g, "-");

export const steamArt = (appid: number, kind: "hero" | "cover") =>
  `https://shared.akamai.steamstatic.com/store_item_assets/steam/apps/${appid}/${kind === "hero" ? "library_hero.jpg" : "library_600x900.jpg"}`;

// Manually added art: drop public/covers/<slug>.jpg|png|webp (portrait) or public/covers/<slug>-hero.* (wide).
function localArt(title: string, suffix = "") {
  for (const ext of ["jpg", "png", "webp"]) {
    const file = `${slugify(title)}${suffix}.${ext}`;
    if (fs.existsSync(path.join(process.cwd(), "public", "covers", file))) return `/covers/${file}`;
  }
  return null;
}

export function gameInfo(title: string): GameInfo {
  return games[title] ?? { title };
}

export function coverFor(title: string) {
  const g = gameInfo(title);
  return localArt(title) ?? g.cover ?? g.header ?? null;
}

export function heroArtFor(title: string) {
  const g = gameInfo(title);
  return localArt(title, "-hero") ?? (g.appid ? steamArt(g.appid, "hero") : null);
}

/** Steam's own colour bands: any "Positive" is blue, "Mixed" is tan, anything negative is rust. */
export function sentiment(desc?: string | null) {
  if (!desc) return "";
  if (/Positive/.test(desc)) return "pos";
  if (/Mixed/.test(desc)) return "mix";
  return "neg";
}

export function critic(g: GameInfo) {
  if (g.opencritic) return { source: "OpenCritic", score: g.opencritic };
  if (g.metacritic) return { source: "Metacritic", score: g.metacritic };
  return null;
}

export function scoreFor(title: string) {
  for (const y of years) {
    const hit = rankings[y].find((e) => e.title === title);
    if (hit) return hit.score;
  }
  return null;
}

export const fmtDate = (iso: string | Date) =>
  new Date(iso).toLocaleDateString("en-GB", { day: "numeric", month: "short", year: "numeric" });
