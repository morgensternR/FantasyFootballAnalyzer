import { logger } from './logger';

const DRAFTROOM_PREFIX = 'ffa:draftroom:v1:';
const CLOCK_CACHE_PREFIX = 'ffa:draft-pick-clock:v1:';
const ESPN_PROXY_URL =
  import.meta.env.VITE_ESPN_PROXY_URL ||
  'https://fantasy-football-analyzer-mu.vercel.app/api/espn-proxy';
const YAHOO_API_BASE =
  import.meta.env.VITE_YAHOO_API_URL || 'https://fantasy-football-analyzer-mu.vercel.app';

export type DraftClockPlatform = 'sleeper' | 'espn' | 'yahoo';

export interface ActiveDraftIdentity {
  platform: DraftClockPlatform;
  leagueId: string;
  season: number;
  eventCount: number;
  pickStartedAt: number;
}

export interface DraftPickClockSetting {
  seconds: number | null;
  source: string;
}

interface StoredDraftSession {
  config?: {
    leagueKey?: string;
  };
  events?: Array<{ ts?: number }>;
  phase?: string;
  savedAt?: number;
}

function parseLeagueKey(
  leagueKey: string,
): Omit<ActiveDraftIdentity, 'eventCount' | 'pickStartedAt'> | null {
  const parts = leagueKey.split(':');
  if (parts.length < 3) return null;
  const platform = parts[0] as DraftClockPlatform;
  if (!['sleeper', 'espn', 'yahoo'].includes(platform)) return null;
  const season = Number(parts[parts.length - 1]);
  if (!Number.isFinite(season)) return null;
  const leagueId = parts.slice(1, -1).join(':');
  if (!leagueId) return null;
  return { platform, leagueId, season };
}

export function readActiveDraftIdentity(): ActiveDraftIdentity | null {
  try {
    let newest: { savedAt: number; session: StoredDraftSession } | null = null;
    for (let i = 0; i < localStorage.length; i++) {
      const key = localStorage.key(i);
      if (!key?.startsWith(DRAFTROOM_PREFIX)) continue;
      const raw = localStorage.getItem(key);
      if (!raw) continue;
      const session = JSON.parse(raw) as StoredDraftSession;
      if (session.phase !== 'drafting' || !session.config?.leagueKey) continue;
      const savedAt = Number(session.savedAt) || 0;
      if (!newest || savedAt > newest.savedAt) newest = { savedAt, session };
    }
    if (!newest?.session.config?.leagueKey) return null;
    const parsed = parseLeagueKey(newest.session.config.leagueKey);
    if (!parsed) return null;
    const events = Array.isArray(newest.session.events) ? newest.session.events : [];
    const latestEventTs = Number(events[events.length - 1]?.ts);
    return {
      ...parsed,
      eventCount: events.length,
      pickStartedAt: Number.isFinite(latestEventTs) ? latestEventTs : newest.savedAt || Date.now(),
    };
  } catch (err) {
    logger.debug('[draftPickClock] Could not read active draft identity:', err);
    return null;
  }
}

function normalizeSeconds(value: unknown): number | null {
  const seconds = Number(value);
  if (!Number.isFinite(seconds) || seconds < 5 || seconds > 3600) return null;
  return Math.round(seconds);
}

function cacheKey(identity: ActiveDraftIdentity): string {
  return `${CLOCK_CACHE_PREFIX}${identity.platform}:${identity.leagueId}:${identity.season}`;
}

function readCached(identity: ActiveDraftIdentity): DraftPickClockSetting | null {
  try {
    const raw = sessionStorage.getItem(cacheKey(identity));
    if (!raw) return null;
    const parsed = JSON.parse(raw) as DraftPickClockSetting;
    const seconds = normalizeSeconds(parsed.seconds);
    return seconds === null ? null : { seconds, source: parsed.source || identity.platform };
  } catch {
    return null;
  }
}

function saveCached(identity: ActiveDraftIdentity, setting: DraftPickClockSetting): void {
  if (setting.seconds === null) return;
  try {
    sessionStorage.setItem(cacheKey(identity), JSON.stringify(setting));
  } catch {
    // Cache is optional; the clock still works for the current mount.
  }
}

async function sleeperPickClock(leagueId: string): Promise<DraftPickClockSetting> {
  const leagueResponse = await fetch(`https://api.sleeper.app/v1/league/${encodeURIComponent(leagueId)}`);
  if (!leagueResponse.ok) return { seconds: null, source: 'Sleeper draft setting unavailable' };
  const league = await leagueResponse.json() as { draft_id?: string | null };
  if (!league.draft_id) return { seconds: null, source: 'Sleeper league has no draft id' };
  const draftResponse = await fetch(`https://api.sleeper.app/v1/draft/${encodeURIComponent(league.draft_id)}`);
  if (!draftResponse.ok) return { seconds: null, source: 'Sleeper draft setting unavailable' };
  const draft = await draftResponse.json() as { settings?: { pick_timer?: number } };
  const seconds = normalizeSeconds(draft.settings?.pick_timer);
  return {
    seconds,
    source: seconds === null ? 'Sleeper pick_timer unavailable' : 'Sleeper league pick_timer',
  };
}

function espnSeasonFor(leagueId: string, fallback: number): number {
  try {
    const raw = localStorage.getItem('ffa:lastconn:v1');
    if (raw) {
      const last = JSON.parse(raw) as { espn?: { leagueId?: string; season?: number } };
      if (last.espn?.leagueId === leagueId && Number.isFinite(last.espn.season)) {
        return Number(last.espn.season);
      }
    }
    const prefix = `ffa:league:v3:espn:${leagueId}:`;
    for (let i = 0; i < localStorage.length; i++) {
      const key = localStorage.key(i);
      if (!key?.startsWith(prefix)) continue;
      const year = Number(key.slice(prefix.length));
      if (Number.isFinite(year)) return year;
    }
  } catch {
    // Fall through to the draft-room season.
  }
  return fallback;
}

async function espnPickClock(identity: ActiveDraftIdentity): Promise<DraftPickClockSetting> {
  const season = espnSeasonFor(identity.leagueId, identity.season);
  let response: Response;
  let creds: { espnS2?: string; swid?: string } | undefined;
  try {
    const raw = sessionStorage.getItem(`espn_credentials:${identity.leagueId}`);
    if (raw) creds = JSON.parse(raw) as { espnS2?: string; swid?: string };
  } catch {
    creds = undefined;
  }

  if (creds?.espnS2 && creds.swid) {
    const query = new URLSearchParams({
      season: String(season),
      leagueId: identity.leagueId,
      view: 'mSettings',
    });
    response = await fetch(`${ESPN_PROXY_URL}?${query.toString()}`, {
      headers: {
        Accept: 'application/json',
        'X-ESPN-S2': encodeURIComponent(creds.espnS2),
        'X-ESPN-SWID': encodeURIComponent(creds.swid),
      },
    });
  } else {
    const url =
      `https://lm-api-reads.fantasy.espn.com/apis/v3/games/ffl/seasons/${season}` +
      `/segments/0/leagues/${encodeURIComponent(identity.leagueId)}?view=mSettings`;
    response = await fetch(url, { headers: { Accept: 'application/json' } });
  }

  if (!response.ok) return { seconds: null, source: 'ESPN draft setting unavailable' };
  const league = await response.json() as {
    settings?: { draftSettings?: { timePerSelection?: number } };
  };
  const seconds = normalizeSeconds(league.settings?.draftSettings?.timePerSelection);
  return {
    seconds,
    source: seconds === null ? 'ESPN timePerSelection unavailable' : 'ESPN league timePerSelection',
  };
}

async function yahooPickClock(leagueId: string): Promise<DraftPickClockSetting> {
  const token = localStorage.getItem('yahoo_access_token');
  if (!token) return { seconds: null, source: 'Yahoo login required for pick time' };
  const endpoint = `/league/${leagueId}/settings`;
  const response = await fetch(
    `${YAHOO_API_BASE}/api/yahoo-api?endpoint=${encodeURIComponent(endpoint)}`,
    { headers: { Authorization: `Bearer ${token}` } },
  );
  if (!response.ok) return { seconds: null, source: 'Yahoo draft setting unavailable' };
  const data = await response.json() as {
    fantasy_content?: { league?: { settings?: { draft_pick_time?: string | number } } };
  };
  const seconds = normalizeSeconds(data.fantasy_content?.league?.settings?.draft_pick_time);
  return {
    seconds,
    source: seconds === null ? 'Yahoo draft_pick_time unavailable' : 'Yahoo league draft_pick_time',
  };
}

export async function resolveDraftPickClock(
  identity: ActiveDraftIdentity,
): Promise<DraftPickClockSetting> {
  if (identity.leagueId === 'guest') {
    return { seconds: null, source: 'Guest mode has no connected league pick-time setting' };
  }
  const cached = readCached(identity);
  if (cached) return cached;

  try {
    const setting =
      identity.platform === 'sleeper'
        ? await sleeperPickClock(identity.leagueId)
        : identity.platform === 'espn'
          ? await espnPickClock(identity)
          : await yahooPickClock(identity.leagueId);
    saveCached(identity, setting);
    return setting;
  } catch (err) {
    logger.debug('[draftPickClock] Could not resolve league pick timer:', err);
    return { seconds: null, source: `${identity.platform} pick-time setting unavailable` };
  }
}

function draftTabs(): HTMLElement | null {
  for (const button of document.querySelectorAll<HTMLButtonElement>('button')) {
    if (button.textContent?.trim().toUpperCase() !== 'BOARD') continue;
    const parent = button.parentElement;
    if (!parent) continue;
    const labels = Array.from(parent.querySelectorAll('button')).map(
      item => item.textContent?.trim().toUpperCase() ?? '',
    );
    if (labels.includes('TIERS') && labels.includes('TEAMS') && labels.includes('NFL TEAMS')) {
      return parent;
    }
  }
  return null;
}

function formatRemaining(seconds: number): string {
  const mins = Math.floor(seconds / 60);
  const secs = String(seconds % 60).padStart(2, '0');
  return mins > 0 ? `${mins}:${secs}` : `0:${secs}`;
}

export function installDraftPickClock(): () => void {
  if (typeof window === 'undefined' || typeof document === 'undefined') return () => {};

  let disposed = false;
  let identity: ActiveDraftIdentity | null = null;
  let setting: DraftPickClockSetting | null = null;
  let lastEventCount = -1;
  let pickStartedAt = Date.now();
  let resolving = false;

  const setVisual = (remaining: number | null) => {
    const tabs = draftTabs();
    if (!tabs) return;
    tabs.dataset.draftPickClock = remaining === null ? '--' : formatRemaining(remaining);
    const state = remaining === null ? 'unknown' : remaining <= 10 ? 'urgent' : remaining <= 30 ? 'warning' : 'normal';
    tabs.dataset.draftPickClockState = state;
    tabs.title = setting
      ? `${setting.source}${setting.seconds ? `: ${setting.seconds}s per pick` : ''}. This is a reference countdown that resets when the app logs a pick.`
      : 'Loading the league draft pick-time setting…';
  };

  const resolveSetting = async (nextIdentity: ActiveDraftIdentity) => {
    if (resolving) return;
    resolving = true;
    try {
      const next = await resolveDraftPickClock(nextIdentity);
      if (disposed) return;
      setting = next;
    } finally {
      resolving = false;
    }
  };

  const tick = () => {
    const active = readActiveDraftIdentity();
    if (active) {
      const identityChanged =
        !identity ||
        active.platform !== identity.platform ||
        active.leagueId !== identity.leagueId ||
        active.season !== identity.season;
      if (identityChanged) {
        identity = active;
        lastEventCount = active.eventCount;
        pickStartedAt = active.pickStartedAt;
        setting = null;
        void resolveSetting(active);
      } else if (active.eventCount !== lastEventCount) {
        lastEventCount = active.eventCount;
        pickStartedAt = active.pickStartedAt;
      }
    }

    if (!identity && !resolving) {
      setVisual(null);
      return;
    }
    if (!setting?.seconds) {
      setVisual(null);
      return;
    }
    const elapsed = Math.floor((Date.now() - pickStartedAt) / 1000);
    const remaining = Math.max(0, setting.seconds - elapsed);
    setVisual(remaining);
  };

  tick();
  const interval = window.setInterval(tick, 250);

  return () => {
    disposed = true;
    window.clearInterval(interval);
    const tabs = draftTabs();
    if (tabs) {
      delete tabs.dataset.draftPickClock;
      delete tabs.dataset.draftPickClockState;
      tabs.removeAttribute('title');
    }
  };
}
