import { describe, expect, it } from 'vitest';
import type { PoolPlayer } from '@/types/draft';
import type { TeamContext } from './contextLabels';
import {
  injuryContextForPlayer,
  overallContextForPlayer,
  seasonOutlookForPlayer,
  teamChangesForPlayer,
} from './draftContextView';

function player(partial: Partial<PoolPlayer> = {}): PoolPlayer {
  return {
    id: 'test-rb',
    name: 'Test Runner',
    team: 'ATL',
    pos: 'RB',
    posRank: 8,
    overallRank: 20,
    tier: 3,
    bye: 5,
    baseValue: 20,
    ...partial,
  };
}

function contexts(team: string, ctx: TeamContext): Record<string, TeamContext> {
  return { [team]: ctx };
}

describe('split draft context views', () => {
  it('shows team offense, not team defense, as the main outlook for offensive players', () => {
    const p = player({ team: 'ATL', pos: 'RB' });
    const outlook = seasonOutlookForPlayer(
      p,
      contexts('ATL', {
        offenseRank: 24,
        defenseRank: 29,
        scheduleRank: 11,
        scheduleConfidence: 'low',
      }),
    );

    expect(outlook.label).toBe('Weak · Easy');
    expect(outlook.title).toContain('• Team offense: Weak #24');
    expect(outlook.title).not.toContain('• Team defense:');
    expect(outlook.title).toContain('DEF is intentionally not shown here');
    expect(outlook.title).toContain('source models materially disagree');
  });

  it('uses team defense for D/ST and explicitly defines DEF', () => {
    const p = player({ id: 'dst-atl', team: 'ATL', pos: 'DST' });
    const outlook = seasonOutlookForPlayer(
      p,
      contexts('ATL', {
        offenseRank: 24,
        defenseRank: 6,
        scheduleRank: 9,
        scheduleConfidence: 'high',
      }),
    );

    expect(outlook.label).toBe('Strong · Easy');
    expect(outlook.title).toContain('• Team defense: Strong #6');
    expect(outlook.title).toContain('DEF measures this NFL team’s defense against opposing offenses.');
  });

  it('treats a first-time play caller as neutral uncertainty rather than automatically bad', () => {
    const changes = teamChangesForPlayer(
      player({ team: 'BAL' }),
      contexts('BAL', {
        ocChange: true,
        playCallerChange: true,
        contextTrend: 'stable',
      }),
    );

    expect(changes.label).toBe('New caller · First-time · OL #26');
    expect(changes.tone).toBe('neutral');
    expect(changes.title).toContain('• Actual play caller: Declan Doyle');
    expect(changes.title).toContain('• Play-caller history: First-time');
    expect(changes.title).toContain('• 2026 new-caller fantasy outlook: #6 of 18 (CBS)');
  });

  it('shows one OL consensus rank while retaining PFF and Sharp source ranks in the bullets', () => {
    const changes = teamChangesForPlayer(
      player({ team: 'ATL' }),
      contexts('ATL', { ocChange: true, playCallerChange: true, contextTrend: 'stable' }),
    );

    expect(changes.label).toContain('OL #10');
    expect(changes.title).toContain('• Offensive line consensus: #10');
    expect(changes.title).toContain('• OL source rank — PFF: #9');
    expect(changes.title).toContain('• OL source rank — Sharp: #10');
    expect(changes.title).toContain('Chris Lindstrom');
  });

  it('shows live practice participation in the injury bullets', () => {
    const injury = injuryContextForPlayer(
      player({
        injuryStatus: 'Questionable',
        injuryBodyPart: 'Hamstring',
        practiceParticipation: 'Limited',
      }),
    );

    expect(injury.label).toBe('Questionable');
    expect(injury.tone).toBe('warn');
    expect(injury.title).toContain('• Body part: Hamstring');
    expect(injury.title).toContain('• Practice: Limited');
  });

  it('lets a major injury materially lower Overall CTX while leaving a healthy neutral case neutral', () => {
    const teamContexts = contexts('XYZ', {
      offenseRank: 16,
      defenseRank: 16,
      scheduleRank: 16,
      scheduleConfidence: 'high',
      contextTrend: 'stable',
    });
    const healthy = overallContextForPlayer(
      player({ team: 'XYZ' }),
      {},
      teamContexts,
    );
    const unavailable = overallContextForPlayer(
      player({ team: 'XYZ', injuryStatus: 'PUP' }),
      {},
      teamContexts,
    );

    expect(healthy.label).toBe('Neutral');
    expect(unavailable.label).toBe('High Risk');
    expect(unavailable.tone).toBe('bad');
    expect(unavailable.title).toContain('• Injury: PUP');
  });

  it('formats scan details as bullet lines instead of a paragraph wall', () => {
    const outlook = seasonOutlookForPlayer(
      player(),
      contexts('ATL', { offenseRank: 10, scheduleRank: 10 }),
    );
    expect(outlook.title.split('\n').filter(line => line.startsWith('• ')).length).toBeGreaterThanOrEqual(3);
  });
});
