import { describe, expect, it } from 'vitest';
import type { PoolPlayer } from '@/types/draft';
import { volumeLabel, volumeTooltip, type VolumePlayerContext } from './volumeContext';

function player(pos: string): PoolPlayer {
  return {
    id: `test-${pos.toLowerCase()}`,
    name: 'Test Player',
    team: 'DEN',
    pos,
    posRank: 1,
    overallRank: 1,
    tier: 1,
    bye: 7,
    baseValue: 1,
  };
}

describe('volume context presentation', () => {
  it('shows carries and targets for RB projected volume', () => {
    const context: VolumePlayerContext = {
      name: 'Test Player',
      team: 'DEN',
      pos: 'RB',
      projection: {
        rushAttempts: 248.4,
        targets: 63.2,
        receptions: 49.5,
        opportunities: 311.6,
        sourceCount: 2,
        confidence: 'high',
        spreadPct: 7.8,
        sources: {
          fantasypros: { rushAttempts: 252, targets: 61 },
          sleeper: { rushAttempts: 244.8, targets: 65.4 },
        },
      },
    };

    expect(volumeLabel(player('RB'), context)).toBe('248 CAR · 63 TGT');
    const tooltip = volumeTooltip(player('RB'), 'Listed RB1 on the depth chart.', context)!;
    expect(tooltip).toContain('312 projected opportunities');
    expect(tooltip).toContain('High · 7.8% source spread · 2 sources');
    expect(tooltip).toContain('FantasyPros');
  });

  it('uses targets as the fast volume signal for WR/TE', () => {
    const context: VolumePlayerContext = {
      name: 'Test Player',
      team: 'DEN',
      pos: 'WR',
      projection: {
        targets: 141.7,
        receptions: 96.2,
        sourceCount: 1,
        confidence: 'single',
        sources: { sleeper: { targets: 141.7, receptions: 96.2 } },
      },
    };
    expect(volumeLabel(player('WR'), context)).toBe('142 TGT');
  });

  it('falls back to previous-season actual snap share when no projection exists', () => {
    const context: VolumePlayerContext = {
      name: 'Test Player',
      team: 'DEN',
      pos: 'TE',
      actual: {
        season: 2025,
        games: 17,
        offenseSnaps: 812,
        offenseSnapPct: 78.6,
        last4SnapPct: 84.2,
      },
    };
    expect(volumeLabel(player('TE'), context)).toBe('79% SNP');
    const tooltip = volumeTooltip(player('TE'), undefined, context)!;
    expect(tooltip).toContain('2025 actual snaps: 812 offensive snaps over 17 games');
    expect(tooltip).toContain('not a projected snap percentage');
  });
});
