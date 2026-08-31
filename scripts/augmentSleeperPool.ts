// Adds CURRENT Sleeper draft-market players that FantasyPros did not seed into
// the bundled draft pool. This closes a real draft-day failure mode without
// dumping Sleeper's huge legacy player map onto the board.
//
// Eligibility is intentionally strict: the row must have a positive current
// Sleeper ADP in at least one scoring format and a fantasy-relevant position.
// Old/novel players with no current ADP remain valid for live-sync catch-up
// (useLiveDraftSync records them as external picks) but do not receive a fake
// ranking here.

import { existsSync, readFileSync, writeFileSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';
import { basePosition, canonicalTeam, matchPlayer, normalizeName } from '../src/utils/playerNames';
import { currentDraftSeason } from './season';

const seasonArg = process.argv.find(a => a.startsWith('--season='));
const SEASON = seasonArg ? Number(seasonArg.split('=')[1]) : currentDraftSeason();
if (!Number.isInteger(SEASON) || SEASON < 2020 || SEASON > 2100) {
  console.error(`Bad season "${seasonArg}"`);
  process.exit(1);
}

const root = join(dirname(fileURLToPath(import.meta.url)), '..');
const poolPath = join(root, 'src', 'data', `draftPool.${SEASON}.json`);
const adpPath = join(root, 'data', 'raw', `sleeper-adp.${SEASON}.json`);
const playersPath = join(root, 'data', 'raw', 'sleeper-players.json');
const auditPath = join(root, 'data', 'raw', `sleeper-only.${SEASON}.json`);

interface PoolPlayer {
  id: string;
  name: string;
  team: string;
  pos: string;
  posRank: number;
  overallRank: number;
  tier: number;
  bye: number | null;
  baseValue: number | null;
  sleeperAdp?: number;
  sleeperAdpPpr?: number;
  sleeperAdpStd?: number;
  sleeperAdp2qb?: number;
  projPts?: number;
  projPtsPpr?: number;
  projPtsStd?: number;
  sleeperId?: string;
  injuryStatus?: string;
  injuryBodyPart?: string;
  injuryNotes?: string;
  injuryStartDate?: string;
  rookie?: boolean;
  depthChartOrder?: number;
  rankSource?: 'sleeper-only';
  [key: string]: unknown;
}

interface DraftPoolFile {
  season: number;
  generatedAt: string;
  baseline: { budget: number; teams: number; rounds: number };
  players: PoolPlayer[];
}

interface SleeperAdpRow {
  name: string;
  pos: string;
  team: string;
  adpHalfPpr: number | null;
  adpPpr: number | null;
  adpStd: number | null;
  adp2qb: number | null;
  ptsHalfPpr?: number | null;
  ptsPpr?: number | null;
  ptsStd?: number | null;
}

interface SleeperPlayerRow {
  sleeperId: string;
  name: string;
  pos: string;
  team: string;
  status: string | null;
  injuryStatus: string | null;
  injuryBodyPart?: string | null;
  injuryNotes?: string | null;
  injuryStartDate?: string | null;
  yearsExp: number | null;
  depthChartOrder: number | null;
}

function readSnapshot<T>(path: string): T | null {
  if (!existsSync(path)) return null;
  const parsed = JSON.parse(readFileSync(path, 'utf8')) as { data?: T };
  return parsed.data ?? null;
}

function positive(value: number | null | undefined): number | null {
  return typeof value === 'number' && Number.isFinite(value) && value > 0 ? value : null;
}

function marketRank(row: SleeperAdpRow): number | null {
  return positive(row.adpHalfPpr) ?? positive(row.adpPpr) ?? positive(row.adpStd) ?? positive(row.adp2qb);
}

function fantasyPos(raw: string): string | null {
  const pos = basePosition(raw);
  if (pos === 'DEF') return 'DST';
  return ['QB', 'RB', 'WR', 'TE', 'K', 'DST'].includes(pos) ? pos : null;
}

function baseId(name: string, pos: string, team: string): string {
  if (pos === 'DST') return `dst-${canonicalTeam(team).toLowerCase()}`;
  return `${normalizeName(name).replace(/\s+/g, '-')}-${pos.toLowerCase()}`;
}

function uniqueId(name: string, pos: string, team: string, sleeperId: string | undefined, used: Set<string>): string {
  const base = baseId(name, pos, team);
  if (!used.has(base)) return base;
  const franchise = canonicalTeam(team).toLowerCase() || 'fa';
  const teamId = `${base}-${franchise}`;
  if (!used.has(teamId)) return teamId;
  return `${teamId}-sleeper-${sleeperId ?? 'market'}`;
}

if (!existsSync(poolPath) || !existsSync(adpPath)) {
  console.log(`Sleeper pool augmentation skipped: missing ${!existsSync(poolPath) ? poolPath : adpPath}`);
  process.exit(0);
}

const pool = JSON.parse(readFileSync(poolPath, 'utf8')) as DraftPoolFile;
const adp = readSnapshot<{ players: SleeperAdpRow[] }>(adpPath);
if (!adp?.players?.length) {
  console.log('Sleeper pool augmentation skipped: no Sleeper ADP rows.');
  process.exit(0);
}
const sleeperPlayers = readSnapshot<{ players: SleeperPlayerRow[] }>(playersPath)?.players ?? [];
const usedIds = new Set(pool.players.map(p => p.id));

// Sleeper position rank is derived only from Sleeper's own market order. We do
// not pretend a player missing from FantasyPros has a FantasyPros position
// rank/tier.
const sleeperPosRank = new Map<string, number>();
for (const pos of ['QB', 'RB', 'WR', 'TE', 'K', 'DST']) {
  const rows = adp.players
    .map(row => ({ row, pos: fantasyPos(row.pos), rank: marketRank(row) }))
    .filter(item => item.pos === pos && item.rank !== null)
    .sort((a, b) => (a.rank as number) - (b.rank as number));
  rows.forEach((item, index) => {
    sleeperPosRank.set(`${normalizeName(item.row.name)}|${pos}|${canonicalTeam(item.row.team)}`, index + 1);
  });
}

const added: Array<{ name: string; pos: string; team: string; adp: number; sleeperId?: string }> = [];
const skippedAmbiguous: string[] = [];

for (const row of adp.players) {
  const pos = fantasyPos(row.pos);
  const adpRank = marketRank(row);
  if (!pos || adpRank === null) continue;

  const existing = matchPlayer({ name: row.name, pos, team: row.team }, pool.players);
  if (existing) continue;

  // If same normalized name+position already exists but team cannot resolve
  // the identity, do not guess and create a duplicate. Record it for review.
  const sameKey = pool.players.filter(
    p => normalizeName(p.name) === normalizeName(row.name) && basePosition(p.pos) === pos,
  );
  if (sameKey.length > 0) {
    skippedAmbiguous.push(`${row.name} (${pos} ${row.team}) -> ${sameKey.map(p => `${p.name} ${p.team}`).join(', ')}`);
    continue;
  }

  const sleeper = matchPlayer({ name: row.name, pos, team: row.team }, sleeperPlayers) ?? undefined;
  const sleeperId = sleeper?.sleeperId;
  const id = uniqueId(row.name, pos, row.team, sleeperId, usedIds);
  usedIds.add(id);

  const posKey = `${normalizeName(row.name)}|${pos}|${canonicalTeam(row.team)}`;
  const player: PoolPlayer = {
    id,
    name: row.name,
    team: canonicalTeam(row.team) || row.team,
    pos,
    posRank: sleeperPosRank.get(posKey) ?? 999,
    // This is explicitly a Sleeper market rank, not FantasyPros ECR. Keeping
    // the rank on the common numeric scale makes the player visible near the
    // market area where Sleeper users are actually drafting him.
    overallRank: Math.max(1, Math.round(adpRank)),
    tier: 0,
    bye: null,
    baseValue: null,
    rankSource: 'sleeper-only',
    ...(positive(row.adpHalfPpr) !== null ? { sleeperAdp: Math.round((row.adpHalfPpr as number) * 10) / 10 } : {}),
    ...(positive(row.adpPpr) !== null ? { sleeperAdpPpr: Math.round((row.adpPpr as number) * 10) / 10 } : {}),
    ...(positive(row.adpStd) !== null ? { sleeperAdpStd: Math.round((row.adpStd as number) * 10) / 10 } : {}),
    ...(positive(row.adp2qb) !== null ? { sleeperAdp2qb: Math.round((row.adp2qb as number) * 10) / 10 } : {}),
    ...(positive(row.ptsHalfPpr) !== null ? { projPts: Math.round((row.ptsHalfPpr as number) * 10) / 10 } : {}),
    ...(positive(row.ptsPpr) !== null ? { projPtsPpr: Math.round((row.ptsPpr as number) * 10) / 10 } : {}),
    ...(positive(row.ptsStd) !== null ? { projPtsStd: Math.round((row.ptsStd as number) * 10) / 10 } : {}),
  };

  if (sleeper) {
    player.sleeperId = sleeper.sleeperId;
    if (sleeper.injuryStatus) {
      player.injuryStatus = sleeper.injuryStatus;
      if (sleeper.injuryBodyPart) player.injuryBodyPart = sleeper.injuryBodyPart;
      if (sleeper.injuryNotes) player.injuryNotes = sleeper.injuryNotes;
      if (sleeper.injuryStartDate) player.injuryStartDate = sleeper.injuryStartDate;
    }
    if (sleeper.yearsExp === 0) player.rookie = true;
    if (sleeper.depthChartOrder != null) player.depthChartOrder = sleeper.depthChartOrder;
  }

  pool.players.push(player);
  added.push({ name: player.name, pos, team: player.team, adp: adpRank, sleeperId });
}

pool.players.sort((a, b) => a.overallRank - b.overallRank || a.name.localeCompare(b.name));
writeFileSync(poolPath, JSON.stringify(pool, null, 2) + '\n');
writeFileSync(
  auditPath,
  JSON.stringify(
    {
      season: SEASON,
      generatedAt: new Date().toISOString(),
      rule: 'Sleeper-only players require positive current Sleeper ADP; legacy player-map entries are excluded.',
      added,
      skippedAmbiguous,
    },
    null,
    2,
  ) + '\n',
);

console.log(`Sleeper-only augmentation: added ${added.length} current market players.`);
if (skippedAmbiguous.length) console.warn(`Sleeper-only augmentation: skipped ${skippedAmbiguous.length} ambiguous identities.`);
