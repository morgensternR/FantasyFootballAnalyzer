import type { League, RosterSlots } from '@/types';
import type { DraftRoomConfig } from '@/types/draft';
import { draftableSlotCount } from './draftEngine';

export type DraftSetupWarningCode =
  | 'team_count_mismatch'
  | 'draft_type_mismatch'
  | 'scoring_mismatch'
  | 'roster_slot_mismatch'
  | 'round_count_mismatch'
  | 'auction_budget_mismatch'
  | 'superflex_missing';

export interface DraftSetupWarning {
  code: DraftSetupWarningCode;
  title: string;
  message: string;
}

const ROSTER_KEYS: Array<keyof RosterSlots> = ['QB', 'RB', 'WR', 'TE', 'FLEX', 'SUPERFLEX', 'K', 'DST', 'BENCH'];

function warn(code: DraftSetupWarningCode, title: string, message: string): DraftSetupWarning {
  return { code, title, message };
}

export function draftSetupWarnings(league: League, config: DraftRoomConfig): DraftSetupWarning[] {
  const warnings: DraftSetupWarning[] = [];

  if (league.totalTeams > 0 && config.teams.length !== league.totalTeams) {
    warnings.push(
      warn(
        'team_count_mismatch',
        'Team count mismatch',
        `Loaded league reports ${league.totalTeams} teams, but Draft Room setup has ${config.teams.length}.`,
      ),
    );
  }

  if (league.draftType !== config.draftType) {
    warnings.push(
      warn(
        'draft_type_mismatch',
        'Draft type mismatch',
        `Loaded league is ${league.draftType}, but Draft Room setup is ${config.draftType}.`,
      ),
    );
  }

  if (!league.scoringIsApproximate && league.scoringType !== 'custom' && config.scoring !== league.scoringType) {
    warnings.push(
      warn(
        'scoring_mismatch',
        'Scoring mismatch',
        `Loaded league scoring is ${league.scoringType}, but Draft Room setup is ${config.scoring}.`,
      ),
    );
  }

  if (league.rosterSlots) {
    const mismatches = ROSTER_KEYS.filter(key => config.rosterSlots[key] !== league.rosterSlots?.[key]);
    if (mismatches.length > 0) {
      warnings.push(
        warn(
          'roster_slot_mismatch',
          'Roster slot mismatch',
          mismatches
            .map(key => `${key}: league ${league.rosterSlots?.[key] ?? 0}, setup ${config.rosterSlots[key]}`)
            .join('; '),
        ),
      );
    }
  }

  const expectedRounds = draftableSlotCount(config.rosterSlots);
  if (config.rounds !== expectedRounds) {
    warnings.push(
      warn(
        'round_count_mismatch',
        'Round count mismatch',
        `Setup has ${config.rounds} rounds, but roster slots imply ${expectedRounds} draftable spots.`,
      ),
    );
  }

  if (config.draftType === 'auction' && league.auctionBudget && config.budget !== league.auctionBudget) {
    warnings.push(
      warn(
        'auction_budget_mismatch',
        'Auction budget mismatch',
        `Loaded league budget is $${league.auctionBudget}, but Draft Room setup is $${config.budget}.`,
      ),
    );
  }

  if (league.hasSuperflex && config.rosterSlots.SUPERFLEX === 0) {
    warnings.push(
      warn(
        'superflex_missing',
        'Superflex missing',
        'Loaded league appears to use a QB-eligible flex, but Draft Room setup has SUPERFLEX set to 0.',
      ),
    );
  }

  return warnings;
}
