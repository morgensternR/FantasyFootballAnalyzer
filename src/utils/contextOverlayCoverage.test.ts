import { describe, expect, it } from 'vitest';
import type { PoolPlayer } from '@/types/draft';
import {
  draftPoolPlayerKeys,
  draftPoolTeamKeys,
  validateContextOverlayAgainstPool,
} from './contextOverlayCoverage';

const bijan: PoolPlayer = {
  id: 'bijan-robinson-rb',
  sleeperId: '9758',
  name: 'Bijan Robinson',
  team: 'ATL',
  pos: 'RB',
  posRank: 1,
  overallRank: 2,
  tier: 1,
  bye: 5,
  baseValue: 60,
};

const pool = [bijan];

function teamFile(teams: Record<string, unknown>) {
  return { teams };
}

function playerFile(players: Record<string, unknown>) {
  return { players };
}

describe('context overlay pool coverage', () => {
  it('collects draft-pool team keys', () => {
    expect(draftPoolTeamKeys(pool)).toEqual(new Set(['ATL']));
  });

  it('collects all supported player context keys', () => {
    expect(draftPoolPlayerKeys(pool)).toEqual(
      new Set(['bijan-robinson-rb', '9758', 'bijan robinson', 'bijan robinson|ATL', 'Bijan Robinson|ATL']),
    );
  });

  it('accepts context keyed by generated player id and valid team abbreviation', () => {
    const issues = validateContextOverlayAgainstPool(
      teamFile({
        ATL: {
          offensiveLineRank: 3,
          confidence: 'high',
          sourceUrls: ['https://example.com/line-rank'],
        },
      }),
      playerFile({
        'bijan-robinson-rb': {
          committeeRisk: 'low',
          confidence: 'high',
          sourceUrls: ['https://example.com/player-note'],
        },
      }),
      pool,
    );
    expect(issues).toEqual([]);
  });

  it('accepts context keyed by Sleeper id or normalized name', () => {
    expect(
      validateContextOverlayAgainstPool(
        teamFile({}),
        playerFile({
          '9758': {
            draftNote: 'Sleeper-id match',
            confidence: 'medium',
            sourceUrls: ['https://example.com/sleeper-id'],
          },
          'bijan robinson|ATL': {
            draftNote: 'Name-team match',
            confidence: 'medium',
            sourceUrls: ['https://example.com/name-team'],
          },
        }),
        pool,
      ),
    ).toEqual([]);
  });

  it('flags unknown team and player keys', () => {
    const issues = validateContextOverlayAgainstPool(
      teamFile({
        XYZ: {
          offensiveLineRank: 1,
          confidence: 'low',
          sourceUrls: ['https://example.com/bad-team'],
        },
      }),
      playerFile({
        'bad-player': {
          draftNote: 'Unknown player',
          confidence: 'low',
          sourceUrls: ['https://example.com/bad-player'],
        },
      }),
      pool,
    );
    expect(issues.map(item => item.path)).toContain('teamContext.teams.XYZ');
    expect(issues.map(item => item.path)).toContain('playerContext.players.bad-player');
  });
});
