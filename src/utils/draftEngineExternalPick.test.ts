import { describe, expect, it } from 'vitest';
import type { DraftEvent, DraftRoomConfig, PoolPlayer } from '@/types/draft';
import { deriveDraftState, validateEvent } from './draftEngine';

const pool: PoolPlayer[] = [
  { id: 'known-rb', name: 'Known RB', team: 'BUF', pos: 'RB', posRank: 1, overallRank: 1, tier: 1, bye: 7, baseValue: 20 },
  { id: 'known-qb', name: 'Known QB', team: 'BUF', pos: 'QB', posRank: 1, overallRank: 2, tier: 1, bye: 7, baseValue: 10 },
];

const config: DraftRoomConfig = {
  leagueKey: 'sleeper:L1:2026',
  season: 2026,
  draftType: 'snake',
  teams: [{ id: '1', name: 'One' }, { id: '2', name: 'Two' }],
  myTeamId: '1',
  rosterSlots: { QB: 1, RB: 1, WR: 0, TE: 0, FLEX: 0, SUPERFLEX: 0, K: 0, DST: 0, BENCH: 1, IR: 0 },
  scoring: 'half_ppr',
  budget: 200,
  rounds: 3,
  mode: 'live',
};

function externalRb(): DraftEvent {
  return {
    kind: 'snake_pick',
    seq: 0,
    ts: 1,
    playerId: 'sleeper-external:old-1',
    teamId: '1',
    externalPlayer: {
      platform: 'sleeper',
      platformPlayerId: 'old-1',
      name: 'Oddball Veteran',
      pos: 'RB',
      team: 'FA',
    },
  };
}

describe('external live-draft players', () => {
  it('advances pick order and consumes the correct team roster slot', () => {
    const state = deriveDraftState(config, pool, [externalRb()]);
    const team = state.teams.get('1')!;

    expect(state.pickCount).toBe(1);
    expect(state.onTheClockId).toBe('2');
    expect(state.draftedPlayerIds.has('sleeper-external:old-1')).toBe(true);
    expect(team.picks).toHaveLength(1);
    expect(team.picks[0].player.name).toBe('Oddball Veteran');
    expect(team.slotsFilled.RB).toBe(1);
    expect(team.openSlots).toBe(2);
  });

  it('uses external position metadata in validation instead of treating it as an unknown bench player', () => {
    const first = externalRb();
    const state = deriveDraftState(config, pool, [first]);
    // RB starter is full but one bench spot remains, so another RB is legal.
    const secondExternal: DraftEvent = {
      ...first,
      seq: 1,
      playerId: 'sleeper-external:old-2',
      externalPlayer: { ...first.externalPlayer!, platformPlayerId: 'old-2', name: 'Another Veteran' },
    };
    expect(validateEvent(config, state, secondExternal)).toBeNull();

    const afterSecond = deriveDraftState(config, pool, [first, secondExternal]);
    const thirdExternal: DraftEvent = {
      ...first,
      seq: 2,
      playerId: 'sleeper-external:old-3',
      externalPlayer: { ...first.externalPlayer!, platformPlayerId: 'old-3', name: 'Third Veteran' },
    };
    expect(validateEvent(config, afterSecond, thirdExternal)).toMatch(/cannot roster another RB/);
  });
});
