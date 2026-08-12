import { describe, expect, it } from 'vitest';
import type { RosterSlots } from '@/types';
import type { PoolPlayer } from '@/types/draft';
import type { PlayerContextLabel } from './draftRisk';
import type { TeamDraftState } from './draftEngine';
import { suggestPicks, type SuggestOptions } from './suggestions';

const SLOTS: RosterSlots = {
  QB: 1,
  RB: 2,
  WR: 2,
  TE: 1,
  FLEX: 1,
  SUPERFLEX: 0,
  K: 1,
  DST: 1,
  BENCH: 6,
  IR: 1,
};

function player(partial: Partial<PoolPlayer> & { id: string; pos: string }): PoolPlayer {
  return {
    name: partial.id,
    team: 'KC',
    posRank: 1,
    overallRank: 1,
    tier: 1,
    bye: 10,
    baseValue: null,
    ...partial,
  } as PoolPlayer;
}

function team(partial: Partial<TeamDraftState> = {}): TeamDraftState {
  return {
    teamId: 't1',
    picks: [],
    openSlots: 15,
    spent: 0,
    remaining: 200,
    maxBid: 186,
    avgPrice: 0,
    slotsFilled: { QB: 0, RB: 0, WR: 0, TE: 0, FLEX: 0, SUPERFLEX: 0, K: 0, DST: 0, BENCH: 0 },
    starterNeeds: { QB: 1, RB: 2, WR: 2, TE: 1, K: 1, DST: 1 },
    posCounts: { QB: 0, RB: 0, WR: 0, TE: 0, K: 0, DST: 0 },
    byeCounts: {},
    fullAt: { QB: false, RB: false, WR: false, TE: false, K: false, DST: false },
    ...partial,
  };
}

function opts(partial: Partial<SuggestOptions> = {}): SuggestOptions {
  return {
    pickCount: 0,
    teamCount: 12,
    scoring: 'half_ppr',
    positionalDemand: { QB: 12, RB: 12, WR: 12, TE: 12, K: 12, DST: 12 },
    ...partial,
  };
}

function values(pool: PoolPlayer[], byId: Record<string, number>): Map<string, number> {
  return new Map(pool.map(p => [p.id, byId[p.id] ?? 1]));
}

function label(labelText: string, tone: PlayerContextLabel['tone']): PlayerContextLabel {
  return { label: labelText, tone, title: labelText };
}

describe('suggestPicks context overlay scoring', () => {
  it('uses good context as a small tiebreaker between equal startable players', () => {
    const pool = [
      player({ id: 'wr-good', pos: 'WR', overallRank: 2 }),
      player({ id: 'wr-plain', pos: 'WR', overallRank: 1 }),
    ];
    const top = suggestPicks(
      pool,
      team(),
      SLOTS,
      values(pool, { 'wr-good': 20, 'wr-plain': 20 }),
      opts({
        contextForPlayer: p => (p.id === 'wr-good' ? label('Scheme good', 'good') : label('—', 'neutral')),
      }),
    );

    expect(top[0].player.id).toBe('wr-good');
    expect(top[0].reasons).toContain('context plus: Scheme good');
  });

  it('uses warning context as a small penalty without overriding a clear value gap', () => {
    const pool = [
      player({ id: 'wr-risk', pos: 'WR', overallRank: 1 }),
      player({ id: 'wr-safe', pos: 'WR', overallRank: 2 }),
    ];
    const top = suggestPicks(
      pool,
      team(),
      SLOTS,
      values(pool, { 'wr-risk': 24, 'wr-safe': 20 }),
      opts({
        contextForPlayer: p => (p.id === 'wr-risk' ? label('Committee', 'warn') : label('—', 'neutral')),
      }),
    );

    const risk = top.find(s => s.player.id === 'wr-risk')!;
    expect(risk.reasons).toContain('context risk: Committee');
    expect(top[0].player.id).toBe('wr-risk');
  });

  it('does not apply context boosts to pure bench-only players', () => {
    const pool = [
      player({ id: 'qb-bench', pos: 'QB', overallRank: 1 }),
      player({ id: 'wr-start', pos: 'WR', overallRank: 2 }),
    ];
    const me = team({
      slotsFilled: { QB: 1, RB: 0, WR: 0, TE: 0, FLEX: 0, SUPERFLEX: 0, K: 0, DST: 0, BENCH: 0 },
      starterNeeds: { QB: 0, RB: 2, WR: 2, TE: 1, K: 1, DST: 1 },
    });
    const top = suggestPicks(
      pool,
      me,
      SLOTS,
      values(pool, { 'qb-bench': 30, 'wr-start': 20 }),
      opts({ contextForPlayer: () => label('Scheme good', 'good') }),
    );

    const qb = top.find(s => s.player.id === 'qb-bench')!;
    expect(qb.reasons).toContain('backup QB');
    expect(qb.reasons.join(' ')).not.toMatch(/context/);
    expect(top[0].player.id).toBe('wr-start');
  });
});
