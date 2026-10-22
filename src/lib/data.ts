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

// ---- Achievements page ----

export type ProgressRow = {
  title: string;
  cover: string | null;
  fallback: string | null;
  earned: number;
  total: number;
  percent: number;
  complete: boolean; // Steam 100% or PSN platinum
};

const byCompletion = (a: ProgressRow, b: ProgressRow) =>
  Number(b.complete) - Number(a.complete) || b.percent - a.percent || b.earned - a.earned || a.title.localeCompare(b.title);

const MIN_STEAM_MINUTES = 180; // games played under 3 hours are left off the achievements board

/** Steam games with 3h+ playtime and at least one unlocked achievement, 100% games first. Built from data/steam-cache.json. */
export function steamProgress(): ProgressRow[] {
  const file = path.join(process.cwd(), "data", "steam-cache.json");
  if (!fs.existsSync(file)) return [];
  const cache = JSON.parse(fs.readFileSync(file, "utf8")) as Record<string, { name: string; total: number; earned: number; minutes: number }>;
  return Object.entries(cache)
    .filter(([, g]) => g.total > 0 && g.earned > 0 && g.minutes >= MIN_STEAM_MINUTES)
    .map(([appid, g]) => ({
      title: g.name,
      cover: localArt(g.name) ?? steamArt(Number(appid), "cover"),
      fallback: `https://shared.akamai.steamstatic.com/store_item_assets/steam/apps/${appid}/header.jpg`,
      earned: g.earned,
      total: g.total,
      percent: Math.floor((100 * g.earned) / g.total),
      complete: g.earned === g.total,
    }))
    .sort(byCompletion);
}

/** PlayStation games from data/psn.json (written by the PSN sync), platinums first. Empty until that exists. */
export function psnProgress(): ProgressRow[] {
  const file = path.join(process.cwd(), "data", "psn.json");
  if (!fs.existsSync(file)) return [];
  const games = JSON.parse(fs.readFileSync(file, "utf8")) as { title: string; cover: string | null; progress: number; earned: number; total: number; platinum: boolean }[];
  return games
    .map((g) => ({ title: g.title, cover: localArt(g.title) ?? g.cover, fallback: null, earned: g.earned, total: g.total, percent: g.progress, complete: g.platinum }))
    .sort(byCompletion);
}

export const fmtDate =(iso: string | Date) =>
  new Date(iso).toLocaleDateString("en-GB", { day: "numeric", month: "short", year: "numeric" });
