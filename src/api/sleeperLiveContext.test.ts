import { describe, expect, it } from 'vitest';
import { POOL } from '@/data/draftPool';
import type { PoolPlayer } from '@/types/draft';
import {
  applySleeperFactsToPlayer,
  isSleeperContextCacheFresh,
  type SleeperDraftContextCache,
} from './sleeperLiveContext';

function player(partial: Partial<PoolPlayer> = {}): PoolPlayer {
  return {
    id: 'test-player-rb',
    sleeperId: '1234',
    name: 'Test Player',
    team: 'SF',
    pos: 'RB',
    posRank: 10,
    overallRank: 25,
    tier: 4,
    bye: 14,
    baseValue: 12,
    ...partial,
  };
}

function cache(partial: Partial<SleeperDraftContextCache> = {}): SleeperDraftContextCache {
  return {
    version: 1,
    contextDate: '2026-08-13',
    fetchedAt: '2026-08-13T12:00:00.000Z',
    poolGeneratedAt: POOL.generatedAt,
    season: POOL.season,
    players: {},
    ...partial,
  };
}

describe('Sleeper live draft context', () => {
  it('applies current team, depth and injury facts without changing player identity', () => {
    const p = player();

    applySleeperFactsToPlayer(p, {
      sleeperId: '1234',
      team: 'SEA',
      injuryStatus: 'Questionable',
      injuryBodyPart: 'Hamstring',
      injuryStartDate: '2026-08-10',
      depthChartOrder: 2,
      rookie: false,
    });

    expect(p.id).toBe('test-player-rb');
    expect(p.sleeperId).toBe('1234');
    expect(p.team).toBe('SEA');
    expect(p.depthChartOrder).toBe(2);
    expect(p.injuryStatus).toBe('Questionable');
    expect(p.injuryBodyPart).toBe('Hamstring');
    expect(p.injuryStartDate).toBe('2026-08-10');
  });

  it('clears stale bundled injury details when Sleeper reports the player healthy', () => {
    const p = player({
      injuryStatus: 'PUP',
      injuryBodyPart: 'Knee',
      injuryNotes: 'Old bundled note',
      injuryStartDate: '2026-07-20',
    });

    applySleeperFactsToPlayer(p, {
      sleeperId: '1234',
      team: 'SF',
      status: 'Active',
      depthChartOrder: 1,
      rookie: false,
    });

    expect(p.injuryStatus).toBeUndefined();
    expect(p.injuryBodyPart).toBeUndefined();
    expect(p.injuryNotes).toBeUndefined();
    expect(p.injuryStartDate).toBeUndefined();
    expect(p.depthChartOrder).toBe(1);
  });

  it('does not rewrite DST franchise identity from player facts', () => {
    const p = player({ id: 'dst-sf', pos: 'DST', team: 'SF' });

    applySleeperFactsToPlayer(p, {
      sleeperId: 'SF',
      team: 'SEA',
    });

    expect(p.team).toBe('SF');
  });

  it('accepts only same-day cache data built against the current pool snapshot', () => {
    expect(isSleeperContextCacheFresh(cache(), '2026-08-13')).toBe(true);
    expect(isSleeperContextCacheFresh(cache(), '2026-08-14')).toBe(false);
    expect(
      isSleeperContextCacheFresh(
        cache({ poolGeneratedAt: '2026-08-12T00:00:00.000Z' }),
        '2026-08-13',
      ),
    ).toBe(false);
    expect(
      isSleeperContextCacheFresh(
        cache({ season: POOL.season + 1 }),
        '2026-08-13',
      ),
    ).toBe(false);
  });
});
