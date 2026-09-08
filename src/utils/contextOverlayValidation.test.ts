import { describe, expect, it } from 'vitest';
import {
  formatContextValidationIssues,
  validateContextOverlayFiles,
  validatePlayerContext,
  validateTeamContext,
} from './contextOverlayValidation';

describe('context overlay validation', () => {
  it('accepts empty overlay files', () => {
    expect(validateContextOverlayFiles({ teams: {} }, { players: {} })).toEqual([]);
  });

  it('accepts sourced team and player entries', () => {
    expect(
      validateContextOverlayFiles(
        {
          teams: {
            KC: {
              ocChange: true,
              offensiveLineRank: 4,
              confidence: 'medium',
              sourceUrls: ['https://example.com/team-note'],
            },
          },
        },
        {
          players: {
            '123': {
              roleTag: 'Lead committee',
              committeeRisk: 'medium',
              schemeFit: 'neutral',
              confidence: 'high',
              sourceUrls: ['https://example.com/player-note'],
            },
          },
        },
      ),
    ).toEqual([]);
  });

  it('requires confidence and sources when a manual note is populated', () => {
    const issues = validatePlayerContext({ draftNote: 'Role depends on camp usage' }, 'players.abc');
    expect(formatContextValidationIssues(issues)).toContain('players.abc.confidence');
    expect(formatContextValidationIssues(issues)).toContain('players.abc.sourceUrls');
  });

  it('rejects invalid ranks, enums, and URLs', () => {
    const issues = validateTeamContext(
      {
        offensiveLineRank: 0,
        confidence: 'certain',
        sourceUrls: ['not-a-url'],
      },
      'teams.BAD',
    );
    const formatted = formatContextValidationIssues(issues);
    expect(formatted).toContain('teams.BAD.offensiveLineRank');
    expect(formatted).toContain('teams.BAD.confidence');
    expect(formatted).toContain('teams.BAD.sourceUrls[0]');
  });

  it('rejects unsupported fields so stale schemas do not silently drift', () => {
    const issues = validatePlayerContext(
      {
        roleTag: 'Workhorse',
        unsupported: true,
        confidence: 'medium',
        sourceUrls: ['https://example.com/source'],
      },
      'players.123',
    );
    expect(formatContextValidationIssues(issues)).toContain('players.123.unsupported');
  });
});
