import { describe, expect, it } from 'vitest';
import infrastructure from './teamInfrastructure.2026.json';

const HISTORY = new Set(['excellent', 'positive', 'neutral', 'concerning', 'poor', 'first_time', 'unknown']);
const EXPERIENCE = new Set(['first_time', 'limited', 'experienced', 'veteran']);

describe('2026 team infrastructure data', () => {
  it('covers all 32 NFL teams with play-caller and offensive-line context', () => {
    const entries = Object.entries(infrastructure.teams);
    expect(entries).toHaveLength(32);

    for (const [team, ctx] of entries) {
      expect(team).toMatch(/^[A-Z]{2,3}$/);
      expect(ctx.playCaller, `${team} play caller`).toBeTruthy();
      expect(EXPERIENCE.has(ctx.experience), `${team} experience`).toBe(true);
      expect(HISTORY.has(ctx.history), `${team} history`).toBe(true);
      expect(ctx.offensiveLineRank, `${team} OL consensus`).toBeGreaterThanOrEqual(1);
      expect(ctx.offensiveLineRank, `${team} OL consensus`).toBeLessThanOrEqual(32);
      expect(ctx.olPffRank, `${team} PFF OL rank`).toBeGreaterThanOrEqual(1);
      expect(ctx.olPffRank, `${team} PFF OL rank`).toBeLessThanOrEqual(32);
      expect(ctx.olSharpRank, `${team} Sharp OL rank`).toBeGreaterThanOrEqual(1);
      expect(ctx.olSharpRank, `${team} Sharp OL rank`).toBeLessThanOrEqual(32);
    }
  });

  it('keeps source provenance and distinct checked dates', () => {
    expect(infrastructure.checkedDate).toMatch(/^2026-\d{2}-\d{2}$/);
    expect(infrastructure.olCheckedDate).toBe('2026-08-12');
    expect(infrastructure.sourceUrls).toEqual(expect.arrayContaining([
      'https://www.pff.com/news/nfl-offensive-line-rankings-2026',
      'https://www.sharpfootballanalysis.com/analysis/best-nfl-offensive-line-rankings/',
    ]));
  });

  it('does not encode first-time callers as poor history', () => {
    for (const [team, ctx] of Object.entries(infrastructure.teams)) {
      if (ctx.experience === 'first_time') {
        expect(ctx.history, team).toBe('first_time');
      }
    }
  });
});
