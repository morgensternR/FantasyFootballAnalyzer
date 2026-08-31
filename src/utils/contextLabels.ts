import type { PoolPlayer } from '@/types/draft';
import type { PlayerContextLabel, RiskTone } from './draftRisk';
import { normalizeName } from './playerNames';

export type ContextConfidence = 'high' | 'medium' | 'low';
export type CommitteeRisk = 'low' | 'medium' | 'high';
export type SchemeFit = 'good' | 'neutral' | 'risk' | 'unknown';
export type TeamContextTrend = 'up' | 'stable' | 'down' | 'major_concern';

export interface TeamContext {
  // Compact, fantasy-facing team model. Lower rank is better/easier.
  offenseRank?: number;
  defenseRank?: number;
  scheduleRank?: number;
  scheduleConfidence?: ContextConfidence;
  contextTrend?: TeamContextTrend;
  contextNote?: string;
  contextDate?: string;
  // Slower-moving supporting context retained for audit/tooltips.
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
  contextDate?: string;
  teams: Record<string, TeamContext>;
}

export interface PlayerContextFile {
  players: Record<string, PlayerContext>;
}

export interface ContextSuggestionAdjustment {
  score: number;
  reason?: string;
}

export const CONTEXT_GLOSSARY =
  'Compact 2026 team/player context. OFF, DEF and SOS are consensus preseason signals; CTX captures coaching/scheme transition and other sourced uncertainty. Live Sleeper injury and depth facts are handled separately. Treat context as a tiebreaker, not a replacement projection.';

function confidenceSuffix(confidence?: ContextConfidence): string {
  return confidence ? ` (${confidence} confidence)` : '';
}

export function offenseLabel(rank?: number): string | null {
  if (!rank) return null;
  if (rank <= 5) return 'Elite';
  if (rank <= 11) return 'Strong';
  if (rank <= 21) return 'Average';
  if (rank <= 27) return 'Weak';
  return 'Very weak';
}

export function defenseLabel(rank?: number): string | null {
  return offenseLabel(rank);
}

export function scheduleLabel(rank?: number): string | null {
  if (!rank) return null;
  if (rank <= 6) return 'Very easy';
  if (rank <= 12) return 'Easy';
  if (rank <= 20) return 'Neutral';
  if (rank <= 26) return 'Hard';
  return 'Very hard';
}

function contextTone(player?: PlayerContext, team?: TeamContext): RiskTone {
  if (player?.committeeRisk === 'high' || player?.schemeFit === 'risk' || player?.confidence === 'low') {
    return 'warn';
  }
  if (team?.contextTrend === 'major_concern') return 'bad';
  if (team?.contextTrend === 'down' || team?.confidence === 'low') return 'warn';
  if (team?.offensiveLineRank && team.offensiveLineRank >= 24) return 'warn';
  if (team?.runBlockRank && team.runBlockRank >= 24) return 'warn';
  if (team?.passBlockRank && team.passBlockRank >= 24) return 'warn';
  if (player?.schemeFit === 'good' || player?.committeeRisk === 'low' || team?.contextTrend === 'up') {
    return 'good';
  }
  return 'neutral';
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
  const off = offenseLabel(ctx.offenseRank);
  const def = defenseLabel(ctx.defenseRank);
  const sos = scheduleLabel(ctx.scheduleRank);
  if (off) parts.push(`OFF ${off} #${ctx.offenseRank}`);
  if (def) parts.push(`DEF ${def} #${ctx.defenseRank}`);
  if (sos) parts.push(`SOS ${sos} #${ctx.scheduleRank}${ctx.scheduleConfidence === 'low' ? ' (mixed)' : ''}`);
  if (ctx.contextTrend) parts.push(`CTX ${ctx.contextTrend.replace('_', ' ')}`);
  if (ctx.contextNote) parts.push(ctx.contextNote);
  if (ctx.ocChange) parts.push('OC change');
  if (ctx.playCallerChange) parts.push('play-caller change');
  if (ctx.offensiveLineRank) parts.push(`OL #${ctx.offensiveLineRank}`);
  if (ctx.runBlockRank) parts.push(`run block #${ctx.runBlockRank}`);
  if (ctx.passBlockRank) parts.push(`pass block #${ctx.passBlockRank}`);
  if (ctx.schemeNote) parts.push(ctx.schemeNote);
  if (ctx.contextDate) parts.push(`checked ${ctx.contextDate}`);
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
  if (team?.offenseRank || team?.scheduleRank) {
    const off = offenseLabel(team.offenseRank) ?? '—';
    const sos = scheduleLabel(team.scheduleRank) ?? '—';
    return `${off} · ${sos}`;
  }
  if (team?.ocChange || team?.playCallerChange) return 'New OC';
  if (team?.offensiveLineRank) return `OL #${team.offensiveLineRank}`;
  return '—';
}

export function contextSuggestionAdjustment(label?: PlayerContextLabel): ContextSuggestionAdjustment {
  if (!label || label.label === '—') return { score: 0 };
  if (label.tone === 'good') return { score: 1, reason: `context plus: ${label.label}` };
  if (label.tone === 'warn') return { score: -1.5, reason: `context risk: ${label.label}` };
  if (label.tone === 'bad') return { score: -3, reason: `context red flag: ${label.label}` };
  return { score: 0.25, reason: `context note: ${label.label}` };
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
      title: `${CONTEXT_GLOSSARY}\n\nNo context note exists for ${player.name}. Supported player keys: ${playerContextKeysFor(player).join(', ')}.`,
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
