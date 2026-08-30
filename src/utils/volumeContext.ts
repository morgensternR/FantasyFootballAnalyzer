import type { PoolPlayer } from '@/types/draft';
import volumeContextData from '@/data/volumeContext';

export type VolumeConfidence = 'high' | 'medium' | 'low' | 'single';

export interface VolumeSourceProjection {
  passAttempts?: number;
  rushAttempts?: number;
  targets?: number;
  receptions?: number;
}

export interface VolumePlayerContext {
  name: string;
  team: string;
  pos: string;
  projection?: {
    passAttempts?: number;
    rushAttempts?: number;
    targets?: number;
    receptions?: number;
    opportunities?: number;
    sourceCount: number;
    confidence: VolumeConfidence;
    spreadPct?: number;
    sources: Record<string, VolumeSourceProjection>;
  };
  actual?: {
    season: number;
    games: number;
    offenseSnaps: number;
    offenseSnapPct: number;
    last4SnapPct?: number;
  };
}

interface VolumeFile {
  season: number;
  actualSeason: number;
  generatedAt?: string;
  sources: Array<{
    id: string;
    label: string;
    fetchedAt: string;
    url: string;
    kind: 'projection' | 'actual';
    note?: string;
  }>;
  players: Record<string, VolumePlayerContext>;
}

const DATA = volumeContextData as VolumeFile;
const SOURCE_BY_ID = new Map(DATA.sources.map(source => [source.id, source]));
const SOURCE_LABEL_FALLBACKS: Record<string, string> = {
  fantasypros: 'FantasyPros consensus',
  sleeper: 'Sleeper',
  'nflverse-snaps': 'nflverse/PFR snap counts',
  '4for4': '4for4',
  footballguys: 'Footballguys',
  rotowire: 'RotoWire',
  fantasylife: 'Fantasy Life',
  cbs: 'CBS Sports',
};

export const VOLUME_GLOSSARY =
  'Projected offensive workload plus previous-season snap usage. Projection numbers are a consensus of available sources; snap percentage is historical actual usage, not a projected 2026 snap share.';

export function volumeContextForPlayer(player: PoolPlayer): VolumePlayerContext | null {
  return DATA.players[player.id] ?? null;
}

function rounded(value: number | undefined): string {
  return value == null ? '-' : String(Math.round(value));
}

export function volumeLabel(player: PoolPlayer, context = volumeContextForPlayer(player)): string | null {
  if (!context) return null;
  const projection = context.projection;
  if (projection) {
    if (player.pos === 'QB' && projection.passAttempts != null) {
      return `${rounded(projection.passAttempts)} PA${projection.rushAttempts != null ? ` · ${rounded(projection.rushAttempts)} RU` : ''}`;
    }
    if (player.pos === 'RB') {
      if (projection.rushAttempts != null && projection.targets != null) {
        return `${rounded(projection.rushAttempts)} CAR · ${rounded(projection.targets)} TGT`;
      }
      if (projection.rushAttempts != null && projection.receptions != null) {
        return `${rounded(projection.rushAttempts)} CAR · ${rounded(projection.receptions)} REC`;
      }
      if (projection.opportunities != null) return `${rounded(projection.opportunities)} OPP`;
      if (projection.rushAttempts != null) return `${rounded(projection.rushAttempts)} CAR`;
    }
    if ((player.pos === 'WR' || player.pos === 'TE') && projection.targets != null) {
      return `${rounded(projection.targets)} TGT`;
    }
    if (projection.receptions != null) return `${rounded(projection.receptions)} REC`;
  }
  if (context.actual) return `${Math.round(context.actual.offenseSnapPct)}% SNP`;
  return null;
}

function confidenceText(confidence: VolumeConfidence, sourceCount: number, spreadPct?: number): string {
  if (confidence === 'single') return `Single-source (${sourceCount || 1} source)`;
  const label = confidence === 'high' ? 'High' : confidence === 'medium' ? 'Medium' : 'Low';
  return `${label}${spreadPct != null ? ` · ${spreadPct}% source spread` : ''} · ${sourceCount} sources`;
}

function projectionLine(
  player: PoolPlayer,
  projection: VolumeSourceProjection & { opportunities?: number },
): string {
  if (player.pos === 'QB') {
    return [
      projection.passAttempts != null ? `${rounded(projection.passAttempts)} pass attempts` : null,
      projection.rushAttempts != null ? `${rounded(projection.rushAttempts)} rush attempts` : null,
    ].filter(Boolean).join(' · ');
  }
  if (player.pos === 'RB') {
    return [
      projection.rushAttempts != null ? `${rounded(projection.rushAttempts)} carries` : null,
      projection.targets != null ? `${rounded(projection.targets)} targets` : null,
      projection.receptions != null ? `${rounded(projection.receptions)} receptions` : null,
      projection.opportunities != null ? `${rounded(projection.opportunities)} projected opportunities` : null,
    ].filter(Boolean).join(' · ');
  }
  return [
    projection.targets != null ? `${rounded(projection.targets)} targets` : null,
    projection.receptions != null ? `${rounded(projection.receptions)} receptions` : null,
    projection.rushAttempts != null && projection.rushAttempts >= 5 ? `${rounded(projection.rushAttempts)} rush attempts` : null,
  ].filter(Boolean).join(' · ');
}

export function volumeTooltip(
  player: PoolPlayer,
  baseRoleTitle?: string,
  context = volumeContextForPlayer(player),
): string | null {
  if (!context) return null;
  const lines: string[] = ['NFL Role / Volume'];
  if (baseRoleTitle) lines.push(`• Role: ${baseRoleTitle}`);

  if (context.projection) {
    const line = projectionLine(player, context.projection);
    if (line) lines.push(`• 2026 projected volume: ${line}`);
    lines.push(
      `• Volume confidence: ${confidenceText(
        context.projection.confidence,
        context.projection.sourceCount,
        context.projection.spreadPct,
      )}`,
    );

    for (const [sourceId, projection] of Object.entries(context.projection.sources)) {
      const source = SOURCE_BY_ID.get(sourceId);
      const detail = projectionLine(player, projection);
      const label = source?.label ?? SOURCE_LABEL_FALLBACKS[sourceId] ?? sourceId;
      if (detail) lines.push(`• ${label}: ${detail}`);
    }
  }

  if (context.actual) {
    const recent = context.actual.last4SnapPct != null
      ? ` · last 4 active games ${context.actual.last4SnapPct}%`
      : '';
    lines.push(
      `• ${context.actual.season} actual snaps: ${context.actual.offenseSnaps} offensive snaps over ${context.actual.games} games · ${context.actual.offenseSnapPct}% snap share${recent}`,
    );
  }

  lines.push('• Snap share is previous-season actual usage, not a projected snap percentage.');
  lines.push('• For RBs, carries + targets are true opportunities when target projections exist; otherwise carries + receptions are shown as a conservative receiving-volume proxy. WR/TE use targets when available and receptions otherwise; QBs use pass attempts plus rushing attempts.');

  const sourceUrls = new Set<string>();
  for (const id of Object.keys(context.projection?.sources ?? {})) {
    const url = SOURCE_BY_ID.get(id)?.url;
    if (url) sourceUrls.add(url);
  }
  if (context.actual) {
    const actualSource = DATA.sources.find(source => source.kind === 'actual');
    if (actualSource?.url) sourceUrls.add(actualSource.url);
  }
  if (sourceUrls.size) lines.push(`• Sources: ${[...sourceUrls].join(' · ')}`);

  return lines.join('\n');
}

export function volumeEntryByRenderedPlayerText(text: string): { id: string; context: VolumePlayerContext } | null {
  const display = text.trim();
  const normalized = display.toLowerCase();
  if (!normalized) return null;

  let best: { id: string; context: VolumePlayerContext } | null = null;
  for (const [id, context] of Object.entries(DATA.players)) {
    const name = context.name.toLowerCase();
    if (!normalized.startsWith(name)) continue;
    if (!best || context.name.length > best.context.name.length) best = { id, context };
  }
  if (best) return best;

  // Keep players without an offensive-volume record (notably K and D/ST)
  // participating in the table sort with a null workload. The sorter always
  // places null workloads after projected offensive players in either sort
  // direction. This synthetic context is not shown as a volume label.
  return {
    id: `unprojected:${normalized}`,
    context: {
      name: display,
      team: '',
      pos: 'OTHER',
    },
  };
}

export function volumeDataStatus(): { generatedAt?: string; playerCount: number; sourceCount: number } {
  return {
    generatedAt: DATA.generatedAt || undefined,
    playerCount: Object.keys(DATA.players).length,
    sourceCount: DATA.sources.filter(source => source.kind === 'projection').length,
  };
}
