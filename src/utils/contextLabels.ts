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

function confidenceSuffix(confidence?: ContextConfidence): string {
  return confidence ? ` (${confidence} confidence)` : '';
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
  const parts = [ctx.roleTag, ctx.committeeRisk ? `committee ${ctx.committeeRisk}` : null, ctx.campSignal, ctx.schemeFit ? `scheme ${ctx.schemeFit}` : null, ctx.draftNote].filter(Boolean);
  if (parts.length === 0) return null;
  return `${parts.join(' · ')}${confidenceSuffix(ctx.confidence)}`;
}
