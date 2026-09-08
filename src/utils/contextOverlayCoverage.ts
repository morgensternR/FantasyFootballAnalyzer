import type { PoolPlayer } from '@/types/draft';
import { playerContextKeysFor } from './contextLabels';
import {
  formatContextValidationIssues,
  type ContextValidationIssue,
  validateContextOverlayFiles,
} from './contextOverlayValidation';

type UnknownRecord = Record<string, unknown>;

function isRecord(value: unknown): value is UnknownRecord {
  return typeof value === 'object' && value !== null && !Array.isArray(value);
}

function issue(path: string, message: string): ContextValidationIssue {
  return { path, message };
}

function nearestCandidates(key: string, candidates: string[], limit = 5): string[] {
  const needle = key.toLowerCase();
  return candidates
    .filter(candidate => candidate.toLowerCase().includes(needle) || needle.includes(candidate.toLowerCase()))
    .slice(0, limit);
}

export function draftPoolTeamKeys(players: PoolPlayer[]): Set<string> {
  return new Set(players.map(player => player.team).filter(Boolean));
}

export function draftPoolPlayerKeys(players: PoolPlayer[]): Set<string> {
  return new Set(players.flatMap(playerContextKeysFor));
}

export function validateContextOverlayAgainstPool(
  teamContextFile: unknown,
  playerContextFile: unknown,
  players: PoolPlayer[],
): ContextValidationIssue[] {
  const issues = validateContextOverlayFiles(teamContextFile, playerContextFile);
  const knownTeams = draftPoolTeamKeys(players);
  const knownPlayerKeys = draftPoolPlayerKeys(players);
  const playerKeyList = [...knownPlayerKeys];

  if (isRecord(teamContextFile) && isRecord(teamContextFile.teams)) {
    for (const team of Object.keys(teamContextFile.teams)) {
      if (!knownTeams.has(team)) {
        issues.push(issue(`teamContext.teams.${team}`, 'does not match any team in the current draft pool'));
      }
    }
  }

  if (isRecord(playerContextFile) && isRecord(playerContextFile.players)) {
    for (const playerKey of Object.keys(playerContextFile.players)) {
      if (!knownPlayerKeys.has(playerKey)) {
        const candidates = nearestCandidates(playerKey, playerKeyList);
        issues.push(
          issue(
            `playerContext.players.${playerKey}`,
            candidates.length > 0
              ? `does not match the current draft pool. Close known keys: ${candidates.join(', ')}`
              : 'does not match the current draft pool. Use npm run context:keys to find valid keys',
          ),
        );
      }
    }
  }

  return issues;
}

export function formatContextOverlayPoolIssues(issues: ContextValidationIssue[]): string {
  return formatContextValidationIssues(issues);
}
