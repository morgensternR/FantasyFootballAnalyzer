import { describe, expect, it } from 'vitest';
import type { RosterSlots } from '@/types';
import type { PoolPlayer } from '@/types/draft';
import { byeFitPenalty, byeRiskGroups, candidateByeFit, playerRisk, playerRole } from './draftRisk';

const SLOTS: RosterSlots = { QB: 1, RB: 2, WR: 2, TE: 1, FLEX: 1, SUPERFLEX: 0, K: 1, DST: 1, BENCH: 6, IR: 1 };

function player(partial: Partial<PoolPlayer> & { id: string; pos: string }): PoolPlayer {
  return {
    id: partial.id,
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

describe('draft risk helpers', () => {
  it('keeps a single candidate bye visually quiet', () => {
    const fit = candidateByeFit(player({ id: 'wr-clean', pos: 'WR', bye: 6 }), [], SLOTS);
    expect(fit.label).toBe('Clean');
    expect(fit.tone).toBe('neutral');
    expect(byeFitPenalty(fit)).toBe(0);
  });

  it('detects a third core starter on the same bye', () => {
    const roster = [
      { player: player({ id: 'rb-week-7', pos: 'RB', bye: 7 }) },
      { player: player({ id: 'wr-week-7', pos: 'WR', bye: 7 }) },
    ];
    const fit = candidateByeFit(player({ id: 'wr-same-bye', pos: 'WR', bye: 7 }), roster, SLOTS);
    expect(fit.label).toBe('W7 3 core');
    expect(fit.tone).toBe('warn');
    expect(byeFitPenalty(fit)).toBe(3);
  });

  it('summarizes bye groups with core and bench counts', () => {
    const roster = [
      { player: player({ id: 'rb-week-9', pos: 'RB', bye: 9 }) },
      { player: player({ id: 'wr-week-9', pos: 'WR', bye: 9 }) },
      { player: player({ id: 'te-week-9', pos: 'TE', bye: 9 }) },
    ];
    const [group] = byeRiskGroups(roster, SLOTS);
    expect(group.week).toBe(9);
    expect(group.coreCount).toBe(3);
    expect(group.benchCount).toBe(0);
    expect(group.label).toBe('warning');
  });

  it('separates fantasy positional rank from NFL depth role', () => {
    const role = playerRole(player({ id: 'ranked-rb2-lead-back', pos: 'RB', posRank: 2, depthChartOrder: 1 }));
    expect(role.label).toBe('RB1');
    expect(role.title).toMatch(/NFL role/);
  });

  it('raises risk for rookies, injuries, and high expert disagreement', () => {
    const risk = playerRisk(player({
      id: 'risky-player',
      pos: 'WR',
      rookie: true,
      injuryStatus: 'Questionable',
      injuryBodyPart: 'Hamstring',
      rankStd: 22,
    }));
    expect(risk.label).toBe('High');
    expect(risk.tone).toBe('bad');
    expect(risk.title).toMatch(/Hamstring/);
    expect(risk.title).toMatch(/expert disagreement/);
  });
});
