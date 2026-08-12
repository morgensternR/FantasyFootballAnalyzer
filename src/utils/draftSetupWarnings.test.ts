import { describe, expect, it } from 'vitest';
import type { League, RosterSlots } from '@/types';
import type { DraftRoomConfig } from '@/types/draft';
import { draftSetupWarnings } from './draftSetupWarnings';

const SLOTS: RosterSlots = {
  QB: 1,
  RB: 2,
  WR: 2,
  TE: 1,
  FLEX: 2,
  SUPERFLEX: 0,
  K: 1,
  DST: 1,
  BENCH: 6,
  IR: 1,
};

function league(partial: Partial<League> = {}): League {
  return {
    id: 'L1',
    platform: 'sleeper',
    name: 'Test League',
    season: 2026,
    draftType: 'snake',
    teams: [],
    scoringType: 'half_ppr',
    totalTeams: 10,
    isLoaded: true,
    rosterSlots: SLOTS,
    ...partial,
  };
}

function config(partial: Partial<DraftRoomConfig> = {}): DraftRoomConfig {
  return {
    leagueKey: 'sleeper:L1:2026',
    season: 2026,
    draftType: 'snake',
    leagueType: 'redraft',
    dynastyMode: 'startup',
    snakeFormat: 'standard',
    teams: Array.from({ length: 10 }, (_, i) => ({ id: `t${i + 1}`, name: `Team ${i + 1}` })),
    myTeamId: 't1',
    rosterSlots: SLOTS,
    scoring: 'half_ppr',
    budget: 200,
    rounds: 16,
    mode: 'mock',
    ...partial,
  };
}

describe('draftSetupWarnings', () => {
  it('returns no warnings when setup matches loaded league settings', () => {
    expect(draftSetupWarnings(league(), config())).toEqual([]);
  });

  it('flags team count, draft type, and scoring mismatches', () => {
    const warnings = draftSetupWarnings(
      league({ totalTeams: 12, draftType: 'auction', scoringType: 'ppr' }),
      config({ draftType: 'snake', scoring: 'half_ppr' }),
    );

    expect(warnings.map(w => w.code)).toEqual([
      'team_count_mismatch',
      'draft_type_mismatch',
      'scoring_mismatch',
    ]);
  });

  it('flags roster slot and implied round-count mismatches', () => {
    const warnings = draftSetupWarnings(
      league({ rosterSlots: { ...SLOTS, FLEX: 1 } }),
      config({ rosterSlots: { ...SLOTS, FLEX: 2 }, rounds: 99 }),
    );

    expect(warnings.map(w => w.code)).toContain('roster_slot_mismatch');
    expect(warnings.map(w => w.code)).toContain('round_count_mismatch');
    expect(warnings.find(w => w.code === 'roster_slot_mismatch')?.message).toContain('FLEX');
  });

  it('flags auction budget mismatch only for auction setup', () => {
    const warnings = draftSetupWarnings(
      league({ draftType: 'auction', auctionBudget: 250 }),
      config({ draftType: 'auction', budget: 200 }),
    );

    expect(warnings.map(w => w.code)).toContain('auction_budget_mismatch');
  });

  it('flags missing superflex when the loaded league uses one', () => {
    const warnings = draftSetupWarnings(
      league({ hasSuperflex: true }),
      config({ rosterSlots: { ...SLOTS, SUPERFLEX: 0 } }),
    );

    expect(warnings.map(w => w.code)).toContain('superflex_missing');
  });
});
