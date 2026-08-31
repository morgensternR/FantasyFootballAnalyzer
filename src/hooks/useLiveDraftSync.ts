import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import type { League } from '@/types';
import { getLeagueDrafts, getLiveDraftPicks, type SleeperLivePick } from '@/api/sleeperDraft';
import { logger } from '@/utils/logger';
import type { DraftEventInput, ExternalDraftPlayer } from '@/types/draft';
import type { UseDraftRoomReturn } from './useDraftRoom';

// Sleeper's public API asks clients to stay below roughly 1000 calls/minute.
// 750 ms is ~80 pick-feed calls/minute while Live Sync is enabled, leaving a
// wide safety margin while keeping normal pick-detection latency below a
// second before network time. Do not run this poll anywhere except an active
// Sleeper live draft.
const POLL_MS = 750;
const EXTERNAL_PLAYER_PREFIX = 'sleeper-external:';

export type LiveSyncStatus = 'idle' | 'connecting' | 'syncing' | 'error';

export interface UseLiveDraftSyncReturn {
  // Sleeper live-mode drafts only; everything else stays manual.
  available: boolean;
  enabled: boolean;
  status: LiveSyncStatus;
  error: string | null;
  toggle: () => void;
}

function normalizeSleeperPosition(raw?: string): string {
  const pos = raw?.trim().toUpperCase() || 'OTHER';
  if (pos === 'DEF' || pos === 'D/ST') return 'DST';
  return pos;
}

function externalPlayerFromPick(pick: SleeperLivePick): ExternalDraftPlayer {
  const first = pick.metadata?.first_name?.trim();
  const last = pick.metadata?.last_name?.trim();
  const name = [first, last].filter(Boolean).join(' ') || `Sleeper player ${pick.player_id}`;
  const injuryStatus = pick.metadata?.injury_status || undefined;
  return {
    platform: 'sleeper',
    platformPlayerId: pick.player_id,
    name,
    pos: normalizeSleeperPosition(pick.metadata?.position),
    team: pick.metadata?.team?.trim().toUpperCase() || 'FA',
    ...(injuryStatus ? { injuryStatus } : {}),
  };
}

// Auto-ingests Sleeper draft picks into the event log so nobody has to
// transcribe a live draft by hand. Sleeper is authoritative for PICK
// PROGRESSION; the bundled pool is only authoritative for our analysis. That
// distinction matters when a commissioner drafts an old/obscure player who is
// valid in Sleeper but absent from our ranked pool: the pick still has to
// advance our clock instead of killing sync for every later selection.
//
// Yahoo/ESPN stay manual for now (Yahoo has no equivalent public draft feed;
// ESPN picks carry ids the Draft Room does not yet map reliably enough).
export function useLiveDraftSync(league: League, room: UseDraftRoomReturn): UseLiveDraftSyncReturn {
  const { config, derived, phase, pool, logEvents } = room;
  const [enabled, setEnabled] = useState(false);
  const [status, setStatus] = useState<LiveSyncStatus>('idle');
  const [error, setError] = useState<string | null>(null);
  const draftIdRef = useRef<string | null>(null);
  const inFlightRef = useRef(false);
  // Drafted-player identity is normally enough to dedupe, but an external
  // Sleeper player is intentionally absent from the bundled analysis pool.
  // Keep the authoritative Sleeper pick numbers too so that same oddball pick
  // never gets re-fed on every 750 ms poll.
  const syncedPickNosRef = useRef(new Set<number>());

  // A guest's `platform` is just the Rankings delta lens, not a real Sleeper
  // league, so live sync never applies (there's no draft id to poll).
  const available =
    !league.isGuest && league.platform === 'sleeper' && config.mode === 'live' && phase === 'drafting';

  // Sleeper player id -> pool player id (bundled by the data pipeline).
  const bySleeperId = useMemo(() => {
    const map = new Map<string, string>();
    for (const p of pool.players) {
      if (p.sleeperId) map.set(p.sleeperId, p.id);
    }
    return map;
  }, [pool.players]);

  const teamIds = useMemo(() => new Set(config.teams.map(t => t.id)), [config.teams]);

  const stop = useCallback((message: string | null) => {
    setEnabled(false);
    setStatus(message ? 'error' : 'idle');
    setError(message);
  }, []);

  const toggle = useCallback(() => {
    if (enabled) {
      stop(null);
      return;
    }
    setError(null);
    setStatus('connecting');
    setEnabled(true);
  }, [enabled, stop]);

  useEffect(() => {
    if (!enabled || !available) return;
    let cancelled = false;

    const syncOnce = async () => {
      // Never stack requests when a slow network response takes longer than the
      // poll interval. One outstanding request is enough; the next interval
      // catches the complete Sleeper backlog.
      if (inFlightRef.current) return;
      inFlightRef.current = true;
      try {
        if (!draftIdRef.current) {
          const drafts = await getLeagueDrafts(league.id);
          if (cancelled) return;
          // The draft that's actually running wins; otherwise the newest.
          const active =
            drafts.find(d => d.status === 'drafting') ??
            drafts.sort((a, b) => (b.start_time ?? 0) - (a.start_time ?? 0))[0];
          if (!active) {
            stop('No Sleeper draft found for this league yet.');
            return;
          }
          draftIdRef.current = active.draft_id;
        }

        const picks = await getLiveDraftPicks(draftIdRef.current);
        if (cancelled) return;
        setStatus('syncing');

        // Ingest by player identity when possible. In keeper leagues the room
        // may already contain a player at a different event index than Sleeper,
        // so pick_no alone cannot decide whether a NORMAL ranked player is a
        // duplicate. For players absent from our pool, pick_no is the only
        // stable identity we have and is therefore tracked separately.
        const fresh = [...picks].sort((a, b) => a.pick_no - b.pick_no);

        // Map the whole backlog first, then ingest it as ONE validated batch:
        // logEvent per pick would validate every pick against the same
        // pre-batch board and stamp them with the same stale seq.
        const batch: DraftEventInput[] = [];
        const pickNos: number[] = [];
        for (const pick of fresh) {
          if (syncedPickNosRef.current.has(pick.pick_no)) continue;

          const mappedPlayerId = bySleeperId.get(pick.player_id);
          // An unknown player must still advance the draft. The event carries
          // Sleeper's name/position/team metadata so deriveDraftState can count
          // the actual roster slot while leaving rank/value intentionally blank.
          const playerId = mappedPlayerId ?? `${EXTERNAL_PLAYER_PREFIX}${pick.player_id}`;
          const externalPlayer = mappedPlayerId ? undefined : externalPlayerFromPick(pick);
          const teamId = pick.roster_id !== null ? String(pick.roster_id) : null;

          if (mappedPlayerId && derived.draftedPlayerIds.has(mappedPlayerId)) {
            // Already represented locally (manual catch-up or keeper). Mark the
            // Sleeper pick consumed so we don't reconsider it every poll.
            syncedPickNosRef.current.add(pick.pick_no);
            continue;
          }
          if (!teamId || !teamIds.has(teamId)) {
            // Unknown teams mean the room's draft-order model is wrong. Unlike
            // an unknown PLAYER this can corrupt every later pick, so stop and
            // ask for a league refresh rather than guessing.
            stop('A Sleeper pick belongs to a team this room does not know. Refresh the league/draft order, then reconnect Live Sync.');
            return;
          }
          if (!mappedPlayerId) {
            logger.warn(
              `[liveSync] Sleeper pick ${pick.pick_no} player ${pick.player_id} is not in the analysis pool; tracking the pick as external and keeping sync active.`,
            );
          }

          const amount = Number(pick.metadata?.amount);
          const externalFields = externalPlayer ? { externalPlayer } : {};
          batch.push(
            config.draftType === 'auction' && Number.isFinite(amount) && amount > 0
              ? {
                  kind: 'auction_sale' as const,
                  playerId,
                  ...externalFields,
                  nominatedById: teamId,
                  wonById: teamId,
                  price: amount,
                }
              : {
                  kind: 'snake_pick' as const,
                  playerId,
                  ...externalFields,
                  teamId,
                  isKeeper: pick.is_keeper ?? undefined,
                },
          );
          pickNos.push(pick.pick_no);
        }
        if (batch.length > 0) {
          const rejection = logEvents(batch);
          if (rejection) {
            // logEvents commits the valid prefix before returning the first
            // rejection. Record those accepted Sleeper pick numbers now so the
            // next fast poll does not feed them twice.
            for (let i = 0; i < rejection.index; i++) {
              syncedPickNosRef.current.add(pickNos[i]);
            }
            // A duplicate can still slip through when a keeper auto-log races
            // this poll. The reducer refuses it; consume that Sleeper pick and
            // let the next tick continue instead of killing the session.
            if (rejection.error === 'That player has already been drafted.') {
              syncedPickNosRef.current.add(pickNos[rejection.index]);
              return;
            }
            stop(
              `Sleeper pick ${pickNos[rejection.index]} was rejected (${rejection.error}). Refresh the league if the room order changed, then reconnect Live Sync.`,
            );
            return;
          }
          for (const pickNo of pickNos) syncedPickNosRef.current.add(pickNo);
        }
      } catch (err) {
        logger.warn('[liveSync] poll failed:', err);
        if (!cancelled) setStatus('error');
        // Transient network errors keep polling; the next tick pulls the whole
        // backlog so no pick is lost merely because one request failed.
      } finally {
        inFlightRef.current = false;
      }
    };

    void syncOnce();
    const timer = setInterval(syncOnce, POLL_MS);
    return () => {
      cancelled = true;
      clearInterval(timer);
      inFlightRef.current = false;
    };
  }, [enabled, available, league.id, derived.draftedPlayerIds, bySleeperId, teamIds, config.draftType, logEvents, stop]);

  // Leaving the drafting phase (complete or reset) ends the session.
  useEffect(() => {
    if (!available && enabled) stop(null);
  }, [available, enabled, stop]);

  return { available, enabled, status, error, toggle };
}
