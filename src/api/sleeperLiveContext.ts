import { POOL } from '@/data/draftPool';
import type { SleeperAPI } from '@/types';
import type { PoolPlayer } from '@/types/draft';
import { canonicalTeam, normalizeName } from '@/utils/playerNames';
import { logger } from '@/utils/logger';
import { getAllPlayers, getNFLState } from './sleeper';

const CACHE_KEY = 'ffa:sleeper-draft-context:v1';
const CACHE_VERSION = 1;
const FIRST_LOAD_TIMEOUT_MS = 6_000;

interface SleeperLiveRawPlayer extends SleeperAPI.Player {
  depth_chart_order?: number | null;
  depth_chart_position?: string | null;
  injury_body_part?: string | null;
  injury_notes?: string | null;
  injury_start_date?: string | null;
  practice_participation?: string | null;
  years_exp?: number | null;
}

export interface SleeperNFLContextState {
  week: number;
  season: string;
  season_type: string;
}

export interface SleeperPlayerFacts {
  sleeperId: string;
  team?: string;
  status?: string;
  injuryStatus?: string;
  injuryBodyPart?: string;
  injuryNotes?: string;
  injuryStartDate?: string;
  practiceParticipation?: string;
  depthChartOrder?: number;
  depthChartPosition?: string;
  rookie?: boolean;
}

export interface SleeperDraftContextCache {
  version: number;
  contextDate: string;
  fetchedAt: string;
  poolGeneratedAt: string;
  season: number;
  nflState?: SleeperNFLContextState;
  players: Record<string, SleeperPlayerFacts>;
}

export interface SleeperDraftContextResult {
  contextDate: string | null;
  fetchedAt: string | null;
  source: 'live' | 'cache' | 'stale-cache' | 'bundled';
  nflState?: SleeperNFLContextState;
}

function localDateKey(date = new Date()): string {
  const year = date.getFullYear();
  const month = String(date.getMonth() + 1).padStart(2, '0');
  const day = String(date.getDate()).padStart(2, '0');
  return `${year}-${month}-${day}`;
}

function severeRosterStatus(status?: string | null): string | undefined {
  if (!status) return undefined;
  const normalized = status.trim();
  const lower = normalized.toLowerCase();
  if (
    lower === 'ir' ||
    lower.includes('injured reserve') ||
    lower === 'pup' ||
    lower.includes('physically unable') ||
    lower === 'nfi' ||
    lower.includes('non-football') ||
    lower === 'out' ||
    lower.includes('suspend')
  ) {
    return normalized;
  }
  return undefined;
}

function effectiveInjuryStatus(player: SleeperLiveRawPlayer): string | undefined {
  return player.injury_status?.trim() || severeRosterStatus(player.status);
}

function playerLookupKey(name: string, position: string, team: string): string {
  const pos = position === 'DEF' ? 'DST' : position;
  return `${normalizeName(name)}|${pos}|${canonicalTeam(team)}`;
}

function fullName(player: SleeperLiveRawPlayer): string {
  return player.full_name?.trim() || `${player.first_name ?? ''} ${player.last_name ?? ''}`.trim();
}

function factsFromRaw(id: string, raw: SleeperLiveRawPlayer): SleeperPlayerFacts {
  const injuryStatus = effectiveInjuryStatus(raw);
  return {
    sleeperId: id,
    ...(raw.team ? { team: canonicalTeam(raw.team) } : {}),
    ...(raw.status ? { status: raw.status } : {}),
    ...(injuryStatus ? { injuryStatus } : {}),
    ...(raw.injury_body_part ? { injuryBodyPart: raw.injury_body_part } : {}),
    ...(raw.injury_notes ? { injuryNotes: raw.injury_notes } : {}),
    ...(raw.injury_start_date ? { injuryStartDate: raw.injury_start_date } : {}),
    ...(raw.practice_participation ? { practiceParticipation: raw.practice_participation } : {}),
    ...(raw.depth_chart_order != null ? { depthChartOrder: raw.depth_chart_order } : {}),
    ...(raw.depth_chart_position ? { depthChartPosition: raw.depth_chart_position } : {}),
    ...(raw.years_exp != null ? { rookie: raw.years_exp === 0 } : {}),
  };
}

export function applySleeperFactsToPlayer(player: PoolPlayer, facts: SleeperPlayerFacts): void {
  if (facts.team && player.pos !== 'DST') player.team = facts.team;
  if (facts.depthChartOrder != null) player.depthChartOrder = facts.depthChartOrder;

  if (facts.injuryStatus) {
    player.injuryStatus = facts.injuryStatus;
    if (facts.injuryBodyPart) player.injuryBodyPart = facts.injuryBodyPart;
    else delete player.injuryBodyPart;
    if (facts.injuryNotes) player.injuryNotes = facts.injuryNotes;
    else delete player.injuryNotes;
    if (facts.injuryStartDate) player.injuryStartDate = facts.injuryStartDate;
    else delete player.injuryStartDate;
  } else {
    // A daily healthy response must clear an injury that was true when the
    // bundled pool was generated; otherwise the Draft Room can remain stale
    // for the rest of preseason even though Sleeper has cleared the player.
    delete player.injuryStatus;
    delete player.injuryBodyPart;
    delete player.injuryNotes;
    delete player.injuryStartDate;
  }

  if (facts.rookie === true) player.rookie = true;
  else if (facts.rookie === false) delete player.rookie;
}

export function applySleeperFactsToPool(
  poolPlayers: PoolPlayer[],
  factsByPoolId: Record<string, SleeperPlayerFacts>,
): void {
  for (const player of poolPlayers) {
    const facts = factsByPoolId[player.id];
    if (facts) applySleeperFactsToPlayer(player, facts);
  }
}

function readCache(): SleeperDraftContextCache | null {
  if (typeof window === 'undefined') return null;
  try {
    const raw = window.localStorage.getItem(CACHE_KEY);
    if (!raw) return null;
    const parsed = JSON.parse(raw) as SleeperDraftContextCache;
    if (
      parsed.version !== CACHE_VERSION ||
      parsed.season !== POOL.season ||
      typeof parsed.contextDate !== 'string' ||
      typeof parsed.poolGeneratedAt !== 'string' ||
      !parsed.players ||
      typeof parsed.players !== 'object'
    ) {
      return null;
    }
    return parsed;
  } catch (error) {
    logger.warn('[Sleeper] ignoring unreadable draft-context cache:', error);
    return null;
  }
}

function writeCache(cache: SleeperDraftContextCache): void {
  if (typeof window === 'undefined') return;
  try {
    window.localStorage.setItem(CACHE_KEY, JSON.stringify(cache));
  } catch (error) {
    // The compact cache should be far below common localStorage quotas, but a
    // private-mode/quota failure must never prevent the Draft Room from loading.
    logger.warn('[Sleeper] could not persist draft-context cache:', error);
  }
}

export function isSleeperContextCacheFresh(
  cache: SleeperDraftContextCache,
  today = localDateKey(),
): boolean {
  return (
    cache.version === CACHE_VERSION &&
    cache.season === POOL.season &&
    cache.poolGeneratedAt === POOL.generatedAt &&
    cache.contextDate === today
  );
}

function compactFactsForPool(
  poolPlayers: PoolPlayer[],
  rawPlayers: Record<string, SleeperAPI.Player>,
): Record<string, SleeperPlayerFacts> {
  const byLookup = new Map<string, { id: string; raw: SleeperLiveRawPlayer }>();
  for (const [id, rawBase] of Object.entries(rawPlayers)) {
    const raw = rawBase as SleeperLiveRawPlayer;
    if (!raw.position || !raw.team) continue;
    const name = fullName(raw);
    if (!name) continue;
    byLookup.set(playerLookupKey(name, raw.position, raw.team), { id, raw });
  }

  const result: Record<string, SleeperPlayerFacts> = {};
  for (const player of poolPlayers) {
    if (player.pos === 'DST') continue;
    let id = player.sleeperId;
    let raw = id ? (rawPlayers[id] as SleeperLiveRawPlayer | undefined) : undefined;

    if (!raw) {
      const fallback = byLookup.get(playerLookupKey(player.name, player.pos, player.team));
      id = fallback?.id;
      raw = fallback?.raw;
    }
    if (!id || !raw) continue;
    result[player.id] = factsFromRaw(id, raw);
  }
  return result;
}

function withTimeout<T>(promise: Promise<T>, timeoutMs: number): Promise<T> {
  return Promise.race([
    promise,
    new Promise<T>((_, reject) => {
      window.setTimeout(() => reject(new Error(`Sleeper context refresh timed out after ${timeoutMs} ms`)), timeoutMs);
    }),
  ]);
}

/**
 * Hydrates the bundled draft pool with current Sleeper player facts before the
 * first React render. Same-day cache hits are synchronous and network-free.
 * A stale cache is applied immediately as a fallback, then replaced by a live
 * response when available. Failure is deliberately non-fatal: the bundled
 * pool remains usable offline.
 */
export async function prepareSleeperDraftContext(): Promise<SleeperDraftContextResult> {
  if (typeof window === 'undefined') {
    return { contextDate: null, fetchedAt: null, source: 'bundled' };
  }

  const today = localDateKey();
  const cached = readCache();
  if (cached) applySleeperFactsToPool(POOL.players, cached.players);

  if (cached && isSleeperContextCacheFresh(cached, today)) {
    return {
      contextDate: cached.contextDate,
      fetchedAt: cached.fetchedAt,
      source: 'cache',
      nflState: cached.nflState,
    };
  }

  try {
    const [rawPlayers, nflState] = await withTimeout(
      Promise.all([getAllPlayers(), getNFLState()]),
      FIRST_LOAD_TIMEOUT_MS,
    );
    const players = compactFactsForPool(POOL.players, rawPlayers);
    const cache: SleeperDraftContextCache = {
      version: CACHE_VERSION,
      contextDate: today,
      fetchedAt: new Date().toISOString(),
      poolGeneratedAt: POOL.generatedAt,
      season: POOL.season,
      nflState,
      players,
    };
    applySleeperFactsToPool(POOL.players, players);
    writeCache(cache);
    return {
      contextDate: cache.contextDate,
      fetchedAt: cache.fetchedAt,
      source: 'live',
      nflState,
    };
  } catch (error) {
    logger.warn('[Sleeper] live draft context unavailable; using fallback:', error);
    if (cached) {
      return {
        contextDate: cached.contextDate,
        fetchedAt: cached.fetchedAt,
        source: 'stale-cache',
        nflState: cached.nflState,
      };
    }
    return { contextDate: null, fetchedAt: null, source: 'bundled' };
  }
}
