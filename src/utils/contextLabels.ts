import type { PoolPlayer } from '@/types/draft';
import type { PlayerContextLabel, RiskTone } from './draftRisk';
import { normalizeName } from './playerNames';

export type ContextConfidence = 'high' | 'medium' | 'low';
export type CommitteeRisk = 'low' | 'medium' | 'high';
export type SchemeFit = 'good' | 'neutral' | 'risk' | 'unknown';

export interface TeamContext {
  ocChange?: boolean;
  playCallerChange?: boolean;
  offensiveLineRank?: number;
  runBlockRank?: number;
  passBlockRank?: number;
  schemeNote?: string;
  confidence?: ContextConfidence;
  sourceUrls?: string[];
}

export interface PlayerContext {
  roleTag?: string;
  committeeRisk?: CommitteeRisk;
  campSignal?: string;
  schemeFit?: SchemeFit;
  draftNote?: string;
  confidence?: ContextConfidence;
  sourceUrls?: string[];
}

export interface TeamContextFile {
  teams: Record<string, TeamContext>;
}

export interface PlayerContextFile {
  players: Record<string, PlayerContext>;
}

export const CONTEXT_GLOSSARY =
  'Manual analyst overlay. Includes sourced notes such as offensive line rank, OC/play-caller change, committee risk, camp usage, scheme fit, and draft notes. Treat it as context, not a projection.';

function confidenceSuffix(confidence?: ContextConfidence): string {
  return confidence ? ` (${confidence} confidence)` : '';
}

function contextTone(player?: PlayerContext, team?: TeamContext): RiskTone {
  if (player?.committeeRisk === 'high' || player?.schemeFit === 'risk' || player?.confidence === 'low') {
    return 'warn';
  }
  if (team?.offensiveLineRank && team.offensiveLineRank >= 24) return 'warn';
  if (team?.runBlockRank && team.runBlockRank >= 24) return 'warn';
  if (team?.passBlockRank && team.passBlockRank >= 24) return 'warn';
  if (player?.schemeFit === 'good' || player?.committeeRisk === 'low' || team?.confidence === 'high') {
    return 'good';
  }
  return player || team ? 'neutral' : 'neutral';
}

export function playerContextKeysFor(player: PoolPlayer): string[] {
  const normalized = normalizeName(player.name);
  return [
    player.id,
    player.sleeperId,
    normalized,
    `${normalized}|${player.team}`,
    `${player.name}|${player.team}`,
  ].filter((key): key is string => !!key);
}

export function resolvePlayerContext(
  player: PoolPlayer,
  playerContexts: Record<string, PlayerContext>,
): { key: string; context: PlayerContext } | null {
  for (const key of playerContextKeysFor(player)) {
    const context = playerContexts[key];
    if (context) return { key, context };
  }
  return null;
}

export function teamContextSummary(ctx?: TeamContext): string | null {
  if (!ctx) return null;
  const parts: string[] = [];
  if (ctx.ocChange) parts.push('OC change');
  if (ctx.playCallerChange) parts.push('play-caller change');
  if (ctx.offensiveLineRank) parts.push(`OL #${ctx.offensiveLineRank}`);
  if (ctx.runBlockRank) parts.push(`run block #${ctx.runBlockRank}`);
  if (ctx.passBlockRank) parts.push(`pass block #${ctx.passBlockRank}`);
  if (ctx.schemeNote) parts.push(ctx.schemeNote);
  if (parts.length === 0) return null;
  return `${parts.join(' · ')}${confidenceSuffix(ctx.confidence)}`;
}

export function playerContextSummary(ctx?: PlayerContext): string | null {
  if (!ctx) return null;
  const parts = [
    ctx.roleTag,
    ctx.committeeRisk ? `committee ${ctx.committeeRisk}` : null,
    ctx.campSignal,
    ctx.schemeFit ? `scheme ${ctx.schemeFit}` : null,
    ctx.draftNote,
  ].filter(Boolean);
  if (parts.length === 0) return null;
  return `${parts.join(' · ')}${confidenceSuffix(ctx.confidence)}`;
}

function labelFromContext(player?: PlayerContext, team?: TeamContext): string {
  if (player?.draftNote) return 'Note';
  if (player?.committeeRisk === 'high') return 'Committee';
  if (player?.campSignal) return 'Camp';
  if (player?.schemeFit && player.schemeFit !== 'unknown') return `Scheme ${player.schemeFit}`;
  if (team?.ocChange || team?.playCallerChange) return 'New OC';
  if (team?.offensiveLineRank) return `OL #${team.offensiveLineRank}`;
  return '—';
}

export function contextLabelForPlayer(
  player: PoolPlayer,
  playerContexts: Record<string, PlayerContext>,
  teamContexts: Record<string, TeamContext>,
): PlayerContextLabel {
  const resolvedPlayerContext = resolvePlayerContext(player, playerContexts);
  const playerContext = resolvedPlayerContext?.context;
  const teamContext = teamContexts[player.team];
  const playerSummary = playerContextSummary(playerContext);
  const teamSummary = teamContextSummary(teamContext);

  if (!playerSummary && !teamSummary) {
    return {
      label: '—',
      tone: 'neutral',
      title: `${CONTEXT_GLOSSARY}\n\nNo manual overlay note exists for ${player.name}. Supported player keys: ${playerContextKeysFor(player).join(', ')}.`,
    };
  }

  const sections = [
    `${CONTEXT_GLOSSARY}\n`,
    `Player: ${player.name}`,
    resolvedPlayerContext ? `Matched player key: ${resolvedPlayerContext.key}` : null,
    playerSummary ? `Player context: ${playerSummary}` : null,
    teamSummary ? `Team context: ${teamSummary}` : null,
    playerContext?.sourceUrls?.length ? `Player sources: ${playerContext.sourceUrls.join(' · ')}` : null,
    teamContext?.sourceUrls?.length ? `Team sources: ${teamContext.sourceUrls.join(' · ')}` : null,
  ].filter(Boolean);

  return {
    label: labelFromContext(playerContext, teamContext),
    tone: contextTone(playerContext, teamContext),
    title: sections.join('\n'),
  };
}
