import infrastructureJson from '@/data/teamInfrastructure.2026.json';
import type { PoolPlayer } from '@/types/draft';
import type { PlayerContextLabel, RiskTone } from './draftRisk';
import {
  offenseLabel,
  defenseLabel,
  resolvePlayerContext,
  scheduleLabel,
  type PlayerContext,
  type TeamContext,
} from './contextLabels';

export type PlayCallerHistory =
  | 'excellent'
  | 'positive'
  | 'neutral'
  | 'concerning'
  | 'poor'
  | 'first_time'
  | 'unknown';

interface TeamInfrastructureContext {
  offensiveCoordinator?: string;
  playCaller?: string;
  experience?: 'first_time' | 'limited' | 'experienced' | 'veteran';
  history?: PlayCallerHistory;
  newCallerRank?: number;
  historyNote?: string;
  offensiveLineRank?: number;
  olPffRank?: number;
  olSharpRank?: number;
  offensiveLineNote?: string;
}

interface TeamInfrastructureFile {
  checkedDate?: string;
  olCheckedDate?: string;
  sourceUrls?: string[];
  teams: Record<string, TeamInfrastructureContext>;
}

const INFRASTRUCTURE = infrastructureJson as TeamInfrastructureFile;

export const INJURY_GLOSSARY =
  'Current player availability. Sleeper is the live factual backbone for individual players; injury news/reporting can add prognosis separately. D/ST needs a unit-level defensive injury rollup and is not labeled healthy from a missing single-player record.';

export const OUTLOOK_GLOSSARY =
  'Season Outlook is the broad fantasy environment. For QB/RB/WR/TE/K it uses that player’s TEAM OFFENSE plus schedule. For D/ST it uses TEAM DEFENSE plus schedule. DEF means the strength of that NFL team’s defense against opposing offenses — it is not offensive-line defense or pass protection.';

export const TEAM_CHANGES_GLOSSARY =
  'Team Changes isolates offensive coaching/play-caller and offensive-line/scheme context for offensive fantasy players. A coordinator title change is not automatically negative: the actual play caller and that caller’s history matter more. First-time callers are uncertainty, not automatically bad. OL is one consensus rank; PFF and Sharp source ranks stay in the tooltip. D/ST does not inherit offensive infrastructure context.';

export const OVERALL_CONTEXT_GLOSSARY =
  'Overall CTX compresses Injury + Season Outlook + relevant Team Changes + player-specific committee/scheme notes into one quick draft signal. It is a tiebreaker, not a replacement for rank, ADP, tier, or projected points.';

function bulletTitle(title: string, lines: Array<string | null | undefined>): string {
  return [title, '', ...lines.filter(Boolean).map(line => `• ${line}`)].join('\n');
}

function rankTone(rank?: number): RiskTone {
  if (!rank) return 'neutral';
  if (rank <= 11) return 'good';
  if (rank >= 28) return 'bad';
  if (rank >= 22) return 'warn';
  return 'neutral';
}

function scheduleTone(rank?: number): RiskTone {
  if (!rank) return 'neutral';
  if (rank <= 12) return 'good';
  if (rank >= 27) return 'bad';
  if (rank >= 21) return 'warn';
  return 'neutral';
}

function worseTone(a: RiskTone, b: RiskTone): RiskTone {
  const weight: Record<RiskTone, number> = { good: 0, neutral: 1, warn: 2, bad: 3 };
  return weight[a] >= weight[b] ? a : b;
}

function injurySeverity(status?: string): 'healthy' | 'minor' | 'major' {
  if (!status) return 'healthy';
  const lower = status.toLowerCase();
  if (
    lower.includes('ir') ||
    lower.includes('pup') ||
    lower.includes('out') ||
    lower.includes('suspend') ||
    lower.includes('nfi')
  ) {
    return 'major';
  }
  return 'minor';
}

export function injuryContextForPlayer(player: PoolPlayer): PlayerContextLabel {
  if (player.pos === 'DST') {
    return {
      label: '—',
      tone: 'neutral',
      title: bulletTitle('Injury / availability', [
        'D/ST represents an entire defensive unit, not one Sleeper player.',
        'A missing single-player injury designation must not be interpreted as a healthy defense.',
        'Unit-level defensive starter injuries can be added as a separate team-defense input later.',
      ]),
    };
  }

  const severity = injurySeverity(player.injuryStatus);
  if (severity === 'healthy') {
    return {
      label: 'Healthy',
      tone: 'good',
      title: bulletTitle('Injury / availability', [
        'Status: Healthy / no current Sleeper injury designation',
        player.practiceParticipation ? `Practice: ${player.practiceParticipation}` : null,
        'Live Sleeper status refreshes daily when the app is used',
        'A separate prognosis source can still add return-timeline context later',
      ]),
    };
  }

  const status = player.injuryStatus ?? 'Injured';
  return {
    label: status,
    tone: severity === 'major' ? 'bad' : 'warn',
    title: bulletTitle('Injury / availability', [
      `Status: ${status}`,
      player.injuryBodyPart ? `Body part: ${player.injuryBodyPart}` : null,
      player.practiceParticipation ? `Practice: ${player.practiceParticipation}` : null,
      player.injuryStartDate ? `Started: ${player.injuryStartDate}` : null,
      player.injuryNotes ? `Sleeper note: ${player.injuryNotes}` : null,
      'Status/practice are refreshed from Sleeper when the daily app cache is stale',
    ]),
  };
}

export function seasonOutlookForPlayer(
  player: PoolPlayer,
  teamContexts: Record<string, TeamContext>,
): PlayerContextLabel {
  const team = teamContexts[player.team];
  if (!team) {
    return {
      label: '—',
      tone: 'neutral',
      title: bulletTitle('Season Outlook', ['No team outlook is populated for this team yet.']),
    };
  }

  const isDefense = player.pos === 'DST';
  const strengthRank = isDefense ? team.defenseRank : team.offenseRank;
  const strengthLabel = isDefense ? defenseLabel(strengthRank) : offenseLabel(strengthRank);
  const sosLabel = scheduleLabel(team.scheduleRank);
  const label = `${strengthLabel ?? '—'} · ${sosLabel ?? '—'}`;
  const tone = worseTone(rankTone(strengthRank), scheduleTone(team.scheduleRank));

  return {
    label,
    tone,
    title: bulletTitle('Season Outlook', [
      isDefense
        ? `Team defense: ${strengthLabel ?? 'Not ranked'}${strengthRank ? ` #${strengthRank}` : ''}`
        : `Team offense: ${strengthLabel ?? 'Not ranked'}${strengthRank ? ` #${strengthRank}` : ''}`,
      `Schedule: ${sosLabel ?? 'Not ranked'}${team.scheduleRank ? ` #${team.scheduleRank}` : ''}`,
      team.scheduleConfidence
        ? `Schedule confidence: ${team.scheduleConfidence}${team.scheduleConfidence === 'low' ? ' — source models materially disagree' : ''}`
        : null,
      isDefense
        ? 'DEF measures this NFL team’s defense against opposing offenses.'
        : 'DEF is intentionally not shown here: for an offensive player, team offense is the relevant broad environment.',
      'OFF/DEF/SOS are consensus preseason signals; lower rank is better, while SOS #1 is easiest.',
    ]),
  };
}

function historyLabel(history?: PlayCallerHistory): string {
  switch (history) {
    case 'excellent': return 'Excellent';
    case 'positive': return 'Positive';
    case 'neutral': return 'Neutral';
    case 'concerning': return 'Concerning';
    case 'poor': return 'Poor';
    case 'first_time': return 'First-time';
    default: return 'Not graded';
  }
}

function historyTone(history?: PlayCallerHistory): RiskTone {
  if (history === 'excellent' || history === 'positive') return 'good';
  if (history === 'concerning') return 'warn';
  if (history === 'poor') return 'bad';
  return 'neutral';
}

export function teamChangesForPlayer(
  player: PoolPlayer,
  teamContexts: Record<string, TeamContext>,
): PlayerContextLabel {
  if (player.pos === 'DST') {
    return {
      label: 'DEF only',
      tone: 'neutral',
      title: bulletTitle('Team Changes', [
        'Offensive coordinator, offensive play-caller, and offensive-line changes are not applied to D/ST.',
        'Use the DEF + SOS Season Outlook for the current D/ST baseline.',
        'A separate defensive coordinator/personnel-change layer is not populated yet.',
      ]),
    };
  }

  const team = teamContexts[player.team];
  const infra = INFRASTRUCTURE.teams[player.team];

  if (!team && !infra) {
    return {
      label: '—',
      tone: 'neutral',
      title: bulletTitle('Team Changes', ['No team-change context is populated yet.']),
    };
  }

  const changed = team?.playCallerChange || team?.ocChange;
  const history = historyLabel(infra?.history);
  const olRank = infra?.offensiveLineRank ?? team?.offensiveLineRank;
  const compact = changed
    ? `${team?.playCallerChange ? 'New caller' : 'New OC'} · ${history}${olRank ? ` · OL #${olRank}` : ''}`
    : infra?.playCaller
      ? `Stable · ${history}${olRank ? ` · OL #${olRank}` : ''}`
      : olRank
        ? `OL #${olRank}`
        : 'Team note';

  let tone = historyTone(infra?.history);
  if (olRank && olRank >= 28) tone = worseTone(tone, 'warn');
  if (team?.contextTrend === 'major_concern') tone = 'bad';
  else if (team?.contextTrend === 'down' && tone !== 'bad') tone = worseTone(tone, 'warn');

  return {
    label: compact,
    tone,
    title: bulletTitle('Team Changes', [
      infra?.offensiveCoordinator ? `Offensive coordinator: ${infra.offensiveCoordinator}` : null,
      infra?.playCaller ? `Actual play caller: ${infra.playCaller}` : null,
      infra?.experience ? `Play-calling experience: ${infra.experience.replace('_', ' ')}` : null,
      infra?.history ? `Play-caller history: ${history}` : 'Play-caller history: not yet graded',
      infra?.newCallerRank ? `2026 new-caller fantasy outlook: #${infra.newCallerRank} of 18 (CBS)` : null,
      team?.playCallerChange != null ? `Play caller changed for 2026: ${team.playCallerChange ? 'Yes' : 'No'}` : null,
      team?.ocChange != null ? `OC title changed for 2026: ${team.ocChange ? 'Yes' : 'No'}` : null,
      olRank ? `Offensive line consensus: #${olRank}` : 'Offensive line: not ranked yet',
      infra?.olPffRank ? `OL source rank — PFF: #${infra.olPffRank}` : null,
      infra?.olSharpRank ? `OL source rank — Sharp: #${infra.olSharpRank}` : null,
      infra?.offensiveLineNote ? `OL note: ${infra.offensiveLineNote}` : null,
      team?.runBlockRank ? `Run blocking: #${team.runBlockRank}` : null,
      team?.passBlockRank ? `Pass protection: #${team.passBlockRank}` : null,
      team?.schemeNote ? `Scheme: ${team.schemeNote}` : null,
      infra?.historyNote ? `Play-caller note: ${infra.historyNote}` : null,
      team?.contextNote ? `2026 transition note: ${team.contextNote}` : null,
      `Coaching context checked: ${INFRASTRUCTURE.checkedDate ?? 'unknown'}`,
      olRank ? `OL context checked: ${INFRASTRUCTURE.olCheckedDate ?? 'unknown'}` : null,
    ]),
  };
}

function playerSpecificScore(context?: PlayerContext): number {
  if (!context) return 0;
  let score = 0;
  if (context.committeeRisk === 'high') score -= 1.5;
  else if (context.committeeRisk === 'medium') score -= 0.75;
  else if (context.committeeRisk === 'low') score += 0.25;
  if (context.schemeFit === 'good') score += 0.5;
  else if (context.schemeFit === 'risk') score -= 0.5;
  if (context.confidence === 'low') score -= 0.25;
  return score;
}

function overallScore(
  player: PoolPlayer,
  team?: TeamContext,
  playerContext?: PlayerContext,
  infra?: TeamInfrastructureContext,
): number {
  let score = 0;

  if (player.pos !== 'DST') {
    const injury = injurySeverity(player.injuryStatus);
    if (injury === 'major') score -= 3;
    else if (injury === 'minor') score -= 1;
  }

  const strengthRank = player.pos === 'DST' ? team?.defenseRank : team?.offenseRank;
  if (strengthRank && strengthRank <= 5) score += 2;
  else if (strengthRank && strengthRank <= 11) score += 1;
  else if (strengthRank && strengthRank >= 28) score -= 2;
  else if (strengthRank && strengthRank >= 22) score -= 1;

  const schedule = team?.scheduleRank;
  if (schedule && schedule <= 6) score += 1.25;
  else if (schedule && schedule <= 12) score += 0.75;
  else if (schedule && schedule >= 27) score -= 1.25;
  else if (schedule && schedule >= 21) score -= 0.75;
  if (team?.scheduleConfidence === 'low') score *= 0.9;

  if (player.pos !== 'DST') {
    if (infra?.history === 'excellent') score += 1.25;
    else if (infra?.history === 'positive') score += 0.75;
    else if (infra?.history === 'concerning') score -= 0.75;
    else if (infra?.history === 'poor') score -= 1.25;
    // first_time / unknown are neutral: uncertainty belongs in the explanation,
    // not an automatic performance penalty.

    const olRank = infra?.offensiveLineRank ?? team?.offensiveLineRank;
    if (olRank && olRank <= 8) score += 0.75;
    else if (olRank && olRank >= 25) score -= 0.75;

    if (team?.contextTrend === 'up') score += 0.5;
    else if (team?.contextTrend === 'down') score -= 0.35;
    else if (team?.contextTrend === 'major_concern') score -= 0.75;
  }

  return score + (player.pos === 'DST' ? 0 : playerSpecificScore(playerContext));
}

function overallLabel(score: number): { label: string; tone: RiskTone } {
  if (score >= 3) return { label: 'Excellent', tone: 'good' };
  if (score >= 1) return { label: 'Positive', tone: 'good' };
  if (score > -1) return { label: 'Neutral', tone: 'neutral' };
  if (score > -3) return { label: 'Caution', tone: 'warn' };
  return { label: 'High Risk', tone: 'bad' };
}

export function overallContextForPlayer(
  player: PoolPlayer,
  playerContexts: Record<string, PlayerContext>,
  teamContexts: Record<string, TeamContext>,
): PlayerContextLabel {
  const resolved = resolvePlayerContext(player, playerContexts);
  const playerContext = resolved?.context;
  const team = teamContexts[player.team];
  const infra = INFRASTRUCTURE.teams[player.team];
  const score = overallScore(player, team, playerContext, infra);
  const result = overallLabel(score);
  const injury = injuryContextForPlayer(player);
  const outlook = seasonOutlookForPlayer(player, teamContexts);
  const changes = teamChangesForPlayer(player, teamContexts);

  return {
    ...result,
    title: bulletTitle(`Overall CTX: ${result.label}`, [
      player.pos === 'DST' ? null : `Injury: ${injury.label}`,
      `Season Outlook: ${outlook.label}`,
      player.pos === 'DST' ? 'Team Changes: offensive infrastructure excluded for D/ST' : `Team Changes: ${changes.label}`,
      player.pos === 'DST' ? null : playerContext?.committeeRisk ? `Committee risk: ${playerContext.committeeRisk}` : null,
      player.pos === 'DST' ? null : playerContext?.campSignal ? `Camp/preseason: ${playerContext.campSignal}` : null,
      player.pos === 'DST' ? null : playerContext?.schemeFit && playerContext.schemeFit !== 'unknown' ? `Player scheme fit: ${playerContext.schemeFit}` : null,
      'This is a compact tiebreaker. Rank, tier, ADP and projections remain primary.',
    ]),
  };
}
