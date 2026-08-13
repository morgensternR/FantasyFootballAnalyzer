import type { PlayerContext, TeamContext } from './contextLabels';

export interface ContextValidationIssue {
  path: string;
  message: string;
}

const CONFIDENCE = new Set(['high', 'medium', 'low']);
const COMMITTEE_RISK = new Set(['low', 'medium', 'high']);
const SCHEME_FIT = new Set(['good', 'neutral', 'risk', 'unknown']);
const CONTEXT_TREND = new Set(['up', 'stable', 'down', 'major_concern']);
const METADATA_FIELDS = new Set(['confidence', 'sourceUrls', 'contextDate', 'scheduleConfidence']);

const TEAM_FIELDS = new Set([
  'offenseRank',
  'defenseRank',
  'scheduleRank',
  'scheduleConfidence',
  'contextTrend',
  'contextNote',
  'contextDate',
  'ocChange',
  'playCallerChange',
  'offensiveLineRank',
  'runBlockRank',
  'passBlockRank',
  'schemeNote',
  'confidence',
  'sourceUrls',
]);

const PLAYER_FIELDS = new Set([
  'roleTag',
  'committeeRisk',
  'campSignal',
  'schemeFit',
  'draftNote',
  'confidence',
  'sourceUrls',
]);

type UnknownRecord = Record<string, unknown>;

function isRecord(value: unknown): value is UnknownRecord {
  return typeof value === 'object' && value !== null && !Array.isArray(value);
}

function issue(path: string, message: string): ContextValidationIssue {
  return { path, message };
}

function validateBoolean(value: unknown, path: string): ContextValidationIssue[] {
  return typeof value === 'boolean' ? [] : [issue(path, 'must be boolean')];
}

function validateOptionalString(value: unknown, path: string): ContextValidationIssue[] {
  return value === undefined || typeof value === 'string' ? [] : [issue(path, 'must be a string')];
}

function validateRank(value: unknown, path: string): ContextValidationIssue[] {
  if (value === undefined) return [];
  return Number.isInteger(value) && Number(value) >= 1 && Number(value) <= 32
    ? []
    : [issue(path, 'must be an integer from 1 to 32, where lower is better/easier')];
}

function validateEnum(value: unknown, allowed: Set<string>, path: string): ContextValidationIssue[] {
  if (value === undefined) return [];
  return typeof value === 'string' && allowed.has(value)
    ? []
    : [issue(path, `must be one of: ${[...allowed].join(', ')}`)];
}

function validateSourceUrls(value: unknown, path: string): ContextValidationIssue[] {
  if (value === undefined) return [];
  if (!Array.isArray(value)) return [issue(path, 'must be an array of source URLs')];
  return value.flatMap((url, i) => {
    if (typeof url !== 'string') return [issue(`${path}[${i}]`, 'must be a string URL')];
    try {
      const parsed = new URL(url);
      return parsed.protocol === 'http:' || parsed.protocol === 'https:'
        ? []
        : [issue(`${path}[${i}]`, 'must be an http(s) URL')];
    } catch {
      return [issue(`${path}[${i}]`, 'must be a valid URL')];
    }
  });
}

function hasSubstantiveFields(ctx: UnknownRecord): boolean {
  return Object.keys(ctx).some(key => !METADATA_FIELDS.has(key));
}

function validateManualSourceDiscipline(ctx: UnknownRecord, path: string): ContextValidationIssue[] {
  if (!hasSubstantiveFields(ctx)) return [];
  const issues: ContextValidationIssue[] = [];
  if (!ctx.confidence) issues.push(issue(`${path}.confidence`, 'is required when the context entry has draft notes'));
  if (!Array.isArray(ctx.sourceUrls) || ctx.sourceUrls.length === 0) {
    issues.push(issue(`${path}.sourceUrls`, 'must include at least one source URL when the context entry has draft notes'));
  }
  return issues;
}

function validateUnknownFields(
  ctx: UnknownRecord,
  allowed: Set<string>,
  path: string,
): ContextValidationIssue[] {
  return Object.keys(ctx)
    .filter(key => !allowed.has(key))
    .map(key => issue(`${path}.${key}`, 'is not a supported field'));
}

export function validateTeamContext(ctx: unknown, path: string): ContextValidationIssue[] {
  if (!isRecord(ctx)) return [issue(path, 'must be an object')];
  return [
    ...validateUnknownFields(ctx, TEAM_FIELDS, path),
    ...validateRank(ctx.offenseRank, `${path}.offenseRank`),
    ...validateRank(ctx.defenseRank, `${path}.defenseRank`),
    ...validateRank(ctx.scheduleRank, `${path}.scheduleRank`),
    ...validateEnum(ctx.scheduleConfidence, CONFIDENCE, `${path}.scheduleConfidence`),
    ...validateEnum(ctx.contextTrend, CONTEXT_TREND, `${path}.contextTrend`),
    ...validateOptionalString(ctx.contextNote, `${path}.contextNote`),
    ...validateOptionalString(ctx.contextDate, `${path}.contextDate`),
    ...(ctx.ocChange === undefined ? [] : validateBoolean(ctx.ocChange, `${path}.ocChange`)),
    ...(ctx.playCallerChange === undefined ? [] : validateBoolean(ctx.playCallerChange, `${path}.playCallerChange`)),
    ...validateRank(ctx.offensiveLineRank, `${path}.offensiveLineRank`),
    ...validateRank(ctx.runBlockRank, `${path}.runBlockRank`),
    ...validateRank(ctx.passBlockRank, `${path}.passBlockRank`),
    ...validateOptionalString(ctx.schemeNote, `${path}.schemeNote`),
    ...validateEnum(ctx.confidence, CONFIDENCE, `${path}.confidence`),
    ...validateSourceUrls(ctx.sourceUrls, `${path}.sourceUrls`),
    ...validateManualSourceDiscipline(ctx, path),
  ];
}

export function validatePlayerContext(ctx: unknown, path: string): ContextValidationIssue[] {
  if (!isRecord(ctx)) return [issue(path, 'must be an object')];
  return [
    ...validateUnknownFields(ctx, PLAYER_FIELDS, path),
    ...validateOptionalString(ctx.roleTag, `${path}.roleTag`),
    ...validateEnum(ctx.committeeRisk, COMMITTEE_RISK, `${path}.committeeRisk`),
    ...validateOptionalString(ctx.campSignal, `${path}.campSignal`),
    ...validateEnum(ctx.schemeFit, SCHEME_FIT, `${path}.schemeFit`),
    ...validateOptionalString(ctx.draftNote, `${path}.draftNote`),
    ...validateEnum(ctx.confidence, CONFIDENCE, `${path}.confidence`),
    ...validateSourceUrls(ctx.sourceUrls, `${path}.sourceUrls`),
    ...validateManualSourceDiscipline(ctx, path),
  ];
}

export function validateTeamContextFile(input: unknown): ContextValidationIssue[] {
  if (!isRecord(input)) return [issue('teamContext', 'must be an object')];
  if (!isRecord(input.teams)) return [issue('teamContext.teams', 'must be an object')];
  return Object.entries(input.teams).flatMap(([team, ctx]) => {
    const keyIssues = /^[A-Z]{2,3}$/.test(team)
      ? []
      : [issue(`teamContext.teams.${team}`, 'team key should be a 2-3 letter uppercase NFL abbreviation')];
    return [...keyIssues, ...validateTeamContext(ctx, `teamContext.teams.${team}`)];
  });
}

export function validatePlayerContextFile(input: unknown): ContextValidationIssue[] {
  if (!isRecord(input)) return [issue('playerContext', 'must be an object')];
  if (!isRecord(input.players)) return [issue('playerContext.players', 'must be an object')];
  return Object.entries(input.players).flatMap(([playerId, ctx]) => {
    const keyIssues = playerId.trim().length > 0
      ? []
      : [issue('playerContext.players.<empty>', 'player key must be non-empty')];
    return [...keyIssues, ...validatePlayerContext(ctx, `playerContext.players.${playerId}`)];
  });
}

export function validateContextOverlayFiles(
  teamContextFile: unknown,
  playerContextFile: unknown,
): ContextValidationIssue[] {
  return [
    ...validateTeamContextFile(teamContextFile),
    ...validatePlayerContextFile(playerContextFile),
  ];
}

export function formatContextValidationIssues(issues: ContextValidationIssue[]): string {
  return issues.map(item => `- ${item.path}: ${item.message}`).join('\n');
}

export type { PlayerContext, TeamContext };
