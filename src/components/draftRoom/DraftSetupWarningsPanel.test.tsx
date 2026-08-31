import { render, screen } from '@testing-library/react';
import { describe, expect, it } from 'vitest';
import type { League } from '@/types';
import type { DraftRoomConfig } from '@/types/draft';
import { DraftSetupWarningsPanel } from './DraftSetupWarningsPanel';

const league: League = {
  id: 'league-1',
  platform: 'sleeper',
  name: 'Test League',
  season: 2026,
  draftType: 'snake',
  teams: [],
  scoringType: 'half_ppr',
  totalTeams: 10,
  isLoaded: true,
  rosterSlots: { QB: 1, RB: 2, WR: 2, TE: 1, FLEX: 2, SUPERFLEX: 0, K: 1, DST: 1, BENCH: 6, IR: 1 },
};

const config: DraftRoomConfig = {
  leagueKey: 'sleeper:league-1:2026',
  season: 2026,
  draftType: 'snake',
  leagueType: 'redraft',
  snakeFormat: 'standard',
  teams: Array.from({ length: 10 }, (_, i) => ({ id: `team-${i + 1}`, name: `Team ${i + 1}` })),
  myTeamId: 'team-1',
  rosterSlots: { QB: 1, RB: 2, WR: 2, TE: 1, FLEX: 2, SUPERFLEX: 0, K: 1, DST: 1, BENCH: 6, IR: 1 },
  scoring: 'half_ppr',
  budget: 200,
  rounds: 16,
  mode: 'mock',
};

describe('DraftSetupWarningsPanel', () => {
  it('renders nothing when setup matches and showClean is false', () => {
    const { container } = render(<DraftSetupWarningsPanel league={league} config={config} />);
    expect(container).toBeEmptyDOMElement();
  });

  it('can render a clean status when requested', () => {
    render(<DraftSetupWarningsPanel league={league} config={config} showClean />);
    expect(screen.getByText('Setup sanity check passed.')).toBeInTheDocument();
  });

  it('renders setup mismatch warnings', () => {
    render(
      <DraftSetupWarningsPanel
        league={league}
        config={{
          ...config,
          teams: config.teams.slice(0, 8),
          rosterSlots: { ...config.rosterSlots, FLEX: 1 },
        }}
      />,
    );

    expect(screen.getByRole('alert', { name: 'Draft setup warnings' })).toBeInTheDocument();
    expect(screen.getByText('Team count mismatch')).toBeInTheDocument();
    expect(screen.getByText('Roster slot mismatch')).toBeInTheDocument();
  });
});
