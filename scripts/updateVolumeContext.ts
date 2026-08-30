// Builds source-backed offensive volume context for the Draft Room.
//
// Automatic sources:
//   - FantasyPros preseason consensus projections (documented projections API)
//   - Sleeper season projections (public endpoint used by Sleeper's web client)
//   - nflverse/PFR previous-season game-level snap counts
//
// Optional manually imported/licensed sources can be placed at:
//   data/volume/manual.<season>.json
// See docs/draft-volume-context.md for the schema.
//
// Output:
//   src/data/volumeContext.<season>.json
//   src/data/volumeContext.ts (season indirection)
//
// Run with:
//   npm run update:volume
//   npm run update:volume -- --season=2027

import { existsSync, readFileSync, writeFileSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';
import { canonicalTeam, normalizeName } from '../src/utils/playerNames';
import { currentDraftSeason } from './season';

const seasonArg = process.argv.find(arg => arg.startsWith('--season='));
const SEASON = seasonArg ? Number(seasonArg.split('=')[1]) : currentDraftSeason();
if (!Number.isInteger(SEASON) || SEASON < 2020 || SEASON > 2100) {
  console.error(`Bad season "${seasonArg}"`);
  process.exit(1);
}

const ACTUAL_SEASON = SEASON - 1;
const root = join(dirname(fileURLToPath(import.meta.url)), '..');
const poolPath = join(root, 'src', 'data', `draftPool.${SEASON}.json`);
const outPath = join(root, 'src', 'data', `volumeContext.${SEASON}.json`);
const indirectionPath = join(root, 'src', 'data', 'volumeContext.ts');
const manualPath = join(root, 'data', 'volume', `manual.${SEASON}.json`);

// Same browser key already used by scripts/fetchRankings.ts. It is the public
// FantasyPros site key, not a user credential.
const FP_API_KEY = 'zjxN52G3lP4fORpHRftGI2mTU8cTwxVNvkjByM3j';
const POSITIONS = ['QB', 'RB', 'WR', 'TE'] as const;
type OffensivePosition = typeof POSITIONS[number];

interface PoolRow {
  id: string;
  name: string;
  team: string;
  pos: string;
}

interface DraftPoolFile {
  season: number;
  players: PoolRow[];
}

interface SourceMeta {
  id: string;
  label: string;
  fetchedAt: string;
  url: string;
  kind: 'projection' | 'actual';
  note?: string;
}

interface SourceProjection {
  passAttempts?: number;
  rushAttempts?: number;
  targets?: number;
  receptions?: number;
}

interface ProjectionRow extends SourceProjection {
  source: string;
  name: string;
  team?: string;
  pos: string;
}

interface ActualSnapRow {
  name: string;
  pos: string;
  season: number;
  games: number;
  offenseSnaps: number;
  offenseSnapPct: number;
  last4SnapPct?: number;
}

interface ManualFile {
  sources?: Array<{
    id: string;
    label: string;
    url: string;
    checkedAt?: string;
    note?: string;
  }>;
  players?: Array<{
    source: string;
    name: string;
    team?: string;
    pos: string;
    passAttempts?: number;
    rushAttempts?: number;
    targets?: number;
    receptions?: number;
  }>;
}

interface VolumePlayerOutput {
  name: string;
  team: string;
  pos: string;
  projection?: {
    passAttempts?: number;
    rushAttempts?: number;
    targets?: number;
    receptions?: number;
    opportunities?: number;
    sourceCount: number;
    confidence: 'high' | 'medium' | 'low' | 'single';
    spreadPct?: number;
    sources: Record<string, SourceProjection>;
  };
  actual?: {
    season: number;
    games: number;
    offenseSnaps: number;
    offenseSnapPct: number;
    last4SnapPct?: number;
  };
}

interface VolumeFileOutput {
  season: number;
  actualSeason: number;
  generatedAt: string;
  sources: SourceMeta[];
  players: Record<string, VolumePlayerOutput>;
}

function round1(value: number): number {
  return Math.round(value * 10) / 10;
}

function finite(value: unknown): number | undefined {
  const n = Number(value);
  return Number.isFinite(n) && n >= 0 ? n : undefined;
}

function compactProjection(input: SourceProjection): SourceProjection {
  const out: SourceProjection = {};
  if (input.passAttempts != null) out.passAttempts = round1(input.passAttempts);
  if (input.rushAttempts != null) out.rushAttempts = round1(input.rushAttempts);
  if (input.targets != null) out.targets = round1(input.targets);
  if (input.receptions != null) out.receptions = round1(input.receptions);
  return out;
}

async function request(url: string, headers: Record<string, string> = {}): Promise<Response> {
  let last: unknown;
  for (let attempt = 0; attempt < 3; attempt++) {
    if (attempt > 0) await new Promise(resolve => setTimeout(resolve, attempt === 1 ? 1000 : 4000));
    try {
      const response = await fetch(url, {
        headers: {
          'User-Agent': 'FantasyFootballAnalyzer (github.com/morgensternR/FantasyFootballAnalyzer)',
          ...headers,
        },
        signal: AbortSignal.timeout(30_000),
      });
      if (!response.ok) throw new Error(`${response.status} ${response.statusText} for ${url}`);
      return response;
    } catch (error) {
      last = error;
      console.warn(`Volume source attempt ${attempt + 1} failed: ${String(error)}`);
    }
  }
  throw last;
}

async function getJson<T>(url: string, headers: Record<string, string> = {}): Promise<T> {
  return (await request(url, headers)).json() as Promise<T>;
}

async function getText(url: string): Promise<string> {
  return (await request(url)).text();
}

function parseCsv(text: string): string[][] {
  const rows: string[][] = [];
  let row: string[] = [];
  let field = '';
  let quoted = false;
  for (let i = 0; i < text.length; i++) {
    const ch = text[i];
    if (quoted) {
      if (ch === '"' && text[i + 1] === '"') {
        field += '"';
        i++;
      } else if (ch === '"') quoted = false;
      else field += ch;
    } else if (ch === '"') quoted = true;
    else if (ch === ',') {
      row.push(field);
      field = '';
    } else if (ch === '\n' || ch === '\r') {
      if (ch === '\r' && text[i + 1] === '\n') i++;
      row.push(field);
      field = '';
      if (row.some(value => value.trim() !== '')) rows.push(row);
      row = [];
    } else field += ch;
  }
  if (field || row.length) {
    row.push(field);
    if (row.some(value => value.trim() !== '')) rows.push(row);
  }
  return rows;
}

function key(name: string, pos: string): string {
  return `${normalizeName(name)}|${pos.toUpperCase()}`;
}

function choosePoolPlayer(
  row: { name: string; pos: string; team?: string },
  poolIndex: Map<string, PoolRow[]>,
): PoolRow | null {
  const candidates = poolIndex.get(key(row.name, row.pos)) ?? [];
  if (candidates.length === 1) return candidates[0];
  if (candidates.length === 0) return null;
  const wantedTeam = row.team ? canonicalTeam(row.team) : '';
  if (wantedTeam) {
    const exact = candidates.find(player => canonicalTeam(player.team) === wantedTeam);
    if (exact) return exact;
  }
  return null;
}

function extractStats(row: Record<string, unknown>): Record<string, unknown> {
  const raw = row.stats;
  if (Array.isArray(raw)) {
    const first = raw.find(item => item && typeof item === 'object');
    return (first ?? {}) as Record<string, unknown>;
  }
  return raw && typeof raw === 'object' ? raw as Record<string, unknown> : row;
}

async function fetchFantasyPros(): Promise<{ rows: ProjectionRow[]; meta: SourceMeta } | null> {
  const fetchedAt = new Date().toISOString();
  const rows: ProjectionRow[] = [];
  try {
    for (const position of POSITIONS) {
      const query = `position=${position}&week=0`;
      const urls = [
        `https://api.fantasypros.com/v2/json/nfl/${SEASON}/projections?${query}`,
        `https://api.fantasypros.com/public/v2/json/nfl/${SEASON}/projections?${query}`,
      ];
      let payload: { players?: Array<Record<string, unknown>> } | null = null;
      let lastError: unknown;
      for (const url of urls) {
        try {
          payload = await getJson(url, { 'x-api-key': FP_API_KEY });
          if (Array.isArray(payload?.players)) break;
        } catch (error) {
          lastError = error;
        }
      }
      if (!Array.isArray(payload?.players)) throw lastError ?? new Error(`No FantasyPros ${position} projections`);
      for (const raw of payload.players) {
        const stats = extractStats(raw);
        const name = String(raw.name ?? raw.player_name ?? '').trim();
        if (!name) continue;
        const row: ProjectionRow = {
          source: 'fantasypros',
          name,
          team: String(raw.team_id ?? raw.player_team_id ?? '').trim() || undefined,
          pos: String(raw.position_id ?? raw.player_position_id ?? position).toUpperCase(),
          passAttempts: finite(stats.pass_att ?? raw.pass_att),
          rushAttempts: finite(stats.rush_att ?? raw.rush_att),
          targets: finite(stats.rec_tgt ?? stats.targets ?? raw.rec_tgt ?? raw.targets),
          receptions: finite(stats.rec ?? stats.receptions ?? raw.rec ?? raw.receptions),
        };
        if (Object.keys(compactProjection(row)).length > 0) rows.push(row);
      }
    }
    console.log(`FantasyPros volume: ${rows.length} projection rows`);
    return {
      rows,
      meta: {
        id: 'fantasypros',
        label: 'FantasyPros consensus projections',
        fetchedAt,
        url: 'https://api.fantasypros.com/public/v2/docs/',
        kind: 'projection',
        note: 'Preseason consensus statistical projections.',
      },
    };
  } catch (error) {
    console.warn(`FantasyPros volume unavailable: ${String(error)}`);
    return null;
  }
}

async function fetchSleeper(): Promise<{ rows: ProjectionRow[]; meta: SourceMeta } | null> {
  const fetchedAt = new Date().toISOString();
  try {
    const positionQuery = POSITIONS.map(position => `position[]=${position}`).join('&');
    const url = `https://api.sleeper.com/projections/nfl/${SEASON}?season_type=regular&${positionQuery}&order_by=adp_half_ppr`;
    const payload = await getJson<Array<{
      team?: string | null;
      player?: { first_name?: string; last_name?: string; full_name?: string; position?: string };
      stats?: Record<string, unknown>;
    }>>(url);
    if (!Array.isArray(payload)) throw new Error('Sleeper projections payload is not an array');
    const rows: ProjectionRow[] = [];
    for (const item of payload) {
      const player = item.player ?? {};
      const name = String(player.full_name ?? `${player.first_name ?? ''} ${player.last_name ?? ''}`).trim();
      const pos = String(player.position ?? '').toUpperCase();
      if (!name || !POSITIONS.includes(pos as OffensivePosition)) continue;
      const stats = item.stats ?? {};
      const row: ProjectionRow = {
        source: 'sleeper',
        name,
        team: item.team ?? undefined,
        pos,
        passAttempts: finite(stats.pass_att),
        rushAttempts: finite(stats.rush_att),
        targets: finite(stats.rec_tgt),
        receptions: finite(stats.rec),
      };
      if (Object.keys(compactProjection(row)).length > 0) rows.push(row);
    }
    console.log(`Sleeper volume: ${rows.length} projection rows`);
    return {
      rows,
      meta: {
        id: 'sleeper',
        label: 'Sleeper season projections',
        fetchedAt,
        url: `https://api.sleeper.com/projections/nfl/${SEASON}?season_type=regular`,
        kind: 'projection',
        note: 'Public Sleeper projection feed; undocumented, so treated as an independent model input rather than ground truth.',
      },
    };
  } catch (error) {
    console.warn(`Sleeper volume unavailable: ${String(error)}`);
    return null;
  }
}

function loadManual(): { rows: ProjectionRow[]; meta: SourceMeta[] } {
  if (!existsSync(manualPath)) return { rows: [], meta: [] };
  try {
    const file = JSON.parse(readFileSync(manualPath, 'utf8')) as ManualFile;
    const definitions = new Map((file.sources ?? []).map(source => [source.id, source]));
    const rows = (file.players ?? [])
      .filter(row => definitions.has(row.source))
      .map(row => ({
        ...row,
        pos: row.pos.toUpperCase(),
      } satisfies ProjectionRow));
    const used = new Set(rows.map(row => row.source));
    const meta: SourceMeta[] = [...used].flatMap(id => {
      const source = definitions.get(id);
      if (!source) return [];
      return [{
        id,
        label: source.label,
        fetchedAt: source.checkedAt ?? new Date().toISOString(),
        url: source.url,
        kind: 'projection' as const,
        note: source.note ?? 'Manually imported/licensed projection source.',
      }];
    });
    console.log(`Manual volume: ${rows.length} rows from ${meta.length} source(s)`);
    return { rows, meta };
  } catch (error) {
    console.warn(`Manual volume file ignored: ${String(error)}`);
    return { rows: [], meta: [] };
  }
}

async function fetchActualSnaps(): Promise<{ rows: ActualSnapRow[]; meta: SourceMeta } | null> {
  const fetchedAt = new Date().toISOString();
  const url = `https://github.com/nflverse/nflverse-data/releases/download/snap_counts/snap_counts_${ACTUAL_SEASON}.csv`;
  try {
    const csv = await getText(url);
    const parsed = parseCsv(csv);
    if (parsed.length < 2) throw new Error('nflverse snap-count CSV is empty');
    const header = parsed[0].map(value => value.trim());
    const index = (name: string): number => {
      const i = header.indexOf(name);
      if (i < 0) throw new Error(`nflverse snap-count CSV missing ${name}`);
      return i;
    };
    const cols = {
      gameId: index('game_id'),
      season: index('season'),
      gameType: index('game_type'),
      week: index('week'),
      player: index('player'),
      pos: index('position'),
      offenseSnaps: index('offense_snaps'),
      offensePct: index('offense_pct'),
    };
    const groups = new Map<string, Array<{
      gameId: string;
      week: number;
      name: string;
      pos: string;
      snaps: number;
      snapFraction: number;
    }>>();
    for (const raw of parsed.slice(1)) {
      if (raw[cols.gameType] !== 'REG') continue;
      const season = Number(raw[cols.season]);
      if (season !== ACTUAL_SEASON) continue;
      const pos = raw[cols.pos]?.trim().toUpperCase();
      if (!POSITIONS.includes(pos as OffensivePosition)) continue;
      const snaps = Number(raw[cols.offenseSnaps]);
      const pctRaw = Number(raw[cols.offensePct]);
      if (!Number.isFinite(snaps) || snaps <= 0 || !Number.isFinite(pctRaw) || pctRaw <= 0) continue;
      const snapFraction = pctRaw > 1 ? pctRaw / 100 : pctRaw;
      if (!(snapFraction > 0 && snapFraction <= 1.01)) continue;
      const name = raw[cols.player]?.trim();
      const gameId = raw[cols.gameId]?.trim();
      if (!name || !gameId) continue;
      const item = {
        gameId,
        week: Number(raw[cols.week]) || 0,
        name,
        pos,
        snaps,
        snapFraction,
      };
      const groupKey = key(name, pos);
      const list = groups.get(groupKey);
      if (list) list.push(item);
      else groups.set(groupKey, [item]);
    }

    const rows: ActualSnapRow[] = [];
    for (const list of groups.values()) {
      const totalSnaps = list.reduce((sum, row) => sum + row.snaps, 0);
      const totalTeamSnaps = list.reduce((sum, row) => sum + row.snaps / row.snapFraction, 0);
      const snapPct = totalTeamSnaps > 0 ? (totalSnaps / totalTeamSnaps) * 100 : 0;
      const recent = [...list].sort((a, b) => b.week - a.week).slice(0, 4);
      const recentSnaps = recent.reduce((sum, row) => sum + row.snaps, 0);
      const recentTeamSnaps = recent.reduce((sum, row) => sum + row.snaps / row.snapFraction, 0);
      rows.push({
        name: list[0].name,
        pos: list[0].pos,
        season: ACTUAL_SEASON,
        games: new Set(list.map(row => row.gameId)).size,
        offenseSnaps: Math.round(totalSnaps),
        offenseSnapPct: round1(snapPct),
        ...(recentTeamSnaps > 0 ? { last4SnapPct: round1((recentSnaps / recentTeamSnaps) * 100) } : {}),
      });
    }
    console.log(`nflverse snaps: ${rows.length} offensive players from ${ACTUAL_SEASON}`);
    return {
      rows,
      meta: {
        id: 'nflverse-snaps',
        label: `nflverse/PFR ${ACTUAL_SEASON} snap counts`,
        fetchedAt,
        url: `https://github.com/nflverse/nflverse-data/releases/download/snap_counts/snap_counts_${ACTUAL_SEASON}.csv`,
        kind: 'actual',
        note: 'Previous-season regular-season game-level offensive snaps. Actual usage, not a 2026 projection.',
      },
    };
  } catch (error) {
    console.warn(`nflverse snap counts unavailable: ${String(error)}`);
    return null;
  }
}

function average(values: Array<number | undefined>): number | undefined {
  const good = values.filter((value): value is number => value != null && Number.isFinite(value));
  if (!good.length) return undefined;
  return round1(good.reduce((sum, value) => sum + value, 0) / good.length);
}

function primaryVolume(pos: string, source: SourceProjection): number | undefined {
  if (pos === 'QB') return source.passAttempts ?? source.rushAttempts;
  if (pos === 'RB') {
    if (source.rushAttempts != null && source.targets != null) return source.rushAttempts + source.targets;
    return source.rushAttempts ?? source.targets;
  }
  if (pos === 'WR' || pos === 'TE') return source.targets ?? source.receptions;
  return undefined;
}

function confidenceFor(pos: string, sources: SourceProjection[]): {
  sourceCount: number;
  confidence: 'high' | 'medium' | 'low' | 'single';
  spreadPct?: number;
} {
  const values = sources.map(source => primaryVolume(pos, source)).filter((value): value is number => value != null);
  if (values.length <= 1) return { sourceCount: values.length || sources.length, confidence: 'single' };
  const mean = values.reduce((sum, value) => sum + value, 0) / values.length;
  const spreadPct = mean > 0 ? round1(((Math.max(...values) - Math.min(...values)) / mean) * 100) : 0;
  return {
    sourceCount: values.length,
    confidence: spreadPct <= 10 ? 'high' : spreadPct <= 20 ? 'medium' : 'low',
    spreadPct,
  };
}

if (!existsSync(poolPath)) {
  console.error(`Missing ${poolPath}. Run npm run build:draft-data first.`);
  process.exit(1);
}

const pool = JSON.parse(readFileSync(poolPath, 'utf8')) as DraftPoolFile;
const offensivePool = pool.players.filter(player => POSITIONS.includes(player.pos as OffensivePosition));
const poolIndex = new Map<string, PoolRow[]>();
for (const player of offensivePool) {
  const playerKey = key(player.name, player.pos);
  const list = poolIndex.get(playerKey);
  if (list) list.push(player);
  else poolIndex.set(playerKey, [player]);
}

const [fp, sleeper, actual] = await Promise.all([
  fetchFantasyPros(),
  fetchSleeper(),
  fetchActualSnaps(),
]);
const manual = loadManual();
const projectionBundles = [fp, sleeper].filter((bundle): bundle is NonNullable<typeof bundle> => bundle != null);
const projectionRows = [
  ...projectionBundles.flatMap(bundle => bundle.rows),
  ...manual.rows,
];

if (projectionRows.length === 0) {
  console.warn('No volume projection source succeeded. Leaving the existing volume context untouched.');
  process.exit(0);
}

const sourceMeta: SourceMeta[] = [
  ...projectionBundles.map(bundle => bundle.meta),
  ...manual.meta,
  ...(actual ? [actual.meta] : []),
];

const byPlayer = new Map<string, Map<string, SourceProjection>>();
let projectionMisses = 0;
for (const row of projectionRows) {
  const player = choosePoolPlayer(row, poolIndex);
  if (!player) {
    projectionMisses++;
    continue;
  }
  const projection = compactProjection(row);
  if (!Object.keys(projection).length) continue;
  let sourceMap = byPlayer.get(player.id);
  if (!sourceMap) {
    sourceMap = new Map();
    byPlayer.set(player.id, sourceMap);
  }
  sourceMap.set(row.source, projection);
}

const actualByPlayer = new Map<string, ActualSnapRow>();
let actualMisses = 0;
for (const row of actual?.rows ?? []) {
  const player = choosePoolPlayer(row, poolIndex);
  if (!player) {
    actualMisses++;
    continue;
  }
  actualByPlayer.set(player.id, row);
}

const players: Record<string, VolumePlayerOutput> = {};
for (const player of offensivePool) {
  const sourceMap = byPlayer.get(player.id);
  const actualRow = actualByPlayer.get(player.id);
  if (!sourceMap?.size && !actualRow) continue;
  const sourceEntries = sourceMap ? [...sourceMap.entries()] : [];
  const projections = sourceEntries.map(([, projection]) => projection);
  const passAttempts = average(projections.map(projection => projection.passAttempts));
  const rushAttempts = average(projections.map(projection => projection.rushAttempts));
  const targets = average(projections.map(projection => projection.targets));
  const receptions = average(projections.map(projection => projection.receptions));
  const projection = sourceEntries.length
    ? {
        ...(passAttempts != null ? { passAttempts } : {}),
        ...(rushAttempts != null ? { rushAttempts } : {}),
        ...(targets != null ? { targets } : {}),
        ...(receptions != null ? { receptions } : {}),
        ...(player.pos === 'RB' && rushAttempts != null && targets != null
          ? { opportunities: round1(rushAttempts + targets) }
          : {}),
        ...confidenceFor(player.pos, projections),
        sources: Object.fromEntries(sourceEntries),
      }
    : undefined;
  players[player.id] = {
    name: player.name,
    team: player.team,
    pos: player.pos,
    ...(projection ? { projection } : {}),
    ...(actualRow ? {
      actual: {
        season: actualRow.season,
        games: actualRow.games,
        offenseSnaps: actualRow.offenseSnaps,
        offenseSnapPct: actualRow.offenseSnapPct,
        ...(actualRow.last4SnapPct != null ? { last4SnapPct: actualRow.last4SnapPct } : {}),
      },
    } : {}),
  };
}

const output: VolumeFileOutput = {
  season: SEASON,
  actualSeason: ACTUAL_SEASON,
  generatedAt: new Date().toISOString(),
  sources: sourceMeta,
  players,
};

writeFileSync(outPath, `${JSON.stringify(output, null, 2)}\n`);
writeFileSync(
  indirectionPath,
  `// Generated by scripts/updateVolumeContext.ts. Do not edit by hand.\nimport data from './volumeContext.${SEASON}.json';\nexport default data;\n`,
);

console.log(`Volume context: ${Object.keys(players).length}/${offensivePool.length} offensive pool players`);
console.log(`Projection join misses: ${projectionMisses}; snap join misses: ${actualMisses}`);
console.log(`Wrote ${outPath}`);
