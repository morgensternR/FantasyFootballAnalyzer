import type { RosterSlots } from '@/types';
import type { PoolPlayer } from '@/types/draft';
import { lineupRows, type LineupSlot } from './draftEngine';

export type RiskTone = 'good' | 'neutral' | 'warn' | 'bad';

type RosterEntry = { player: PoolPlayer };

export interface ByeRiskItem {
  player: PoolPlayer;
  slot: LineupSlot;
  slotLabel: string;
  isCore: boolean;
}

export interface ByeRiskGroup {
  week: number;
  items: ByeRiskItem[];
  coreCount: number;
  benchCount: number;
  totalCount: number;
  tone: RiskTone;
  label: string;
}

export interface PlayerContextLabel {
  label: string;
  tone: RiskTone;
  title: string;
}

const CORE_SLOTS = new Set<LineupSlot>(['QB', 'RB', 'WR', 'TE', 'FLEX', 'SUPERFLEX']);
const STREAMED_POSITIONS = new Set<string>(['K', 'DST']);

export const GLOSSARY = {
  adp: 'Average Draft Position. The pick number where players are usually drafted. Lower means more expensive.',
  rank: 'Expert Consensus Rank. The average expert ranking for this scoring format. It is opinion, not market price.',
  tier: 'Players in the same tier are close enough to treat as similar. The drop between tiers matters more than small rank differences inside a tier.',
  adpDelta: 'ADP minus expert rank. Positive means the market usually drafts him later than experts rank him; negative means he usually costs more than his rank.',
  role: 'Simplified role from Sleeper depth-chart order. It is a risk clue, not a snap-share projection.',
  byeFit: 'Whether drafting this player creates a bye-week pile-up on your roster. K/DST are ignored because they are normally streamed.',
  risk: 'Draft-risk tag from injury status, rookie flag, depth-chart order, and expert disagreement.',
  coreStarter: 'A player currently assigned to QB, RB, WR, TE, FLEX, or SUPERFLEX. Bench, K, and DST are not core starters.',
  rankStd: 'Expert disagreement. Higher values mean experts are less aligned, so the player is more uncertain.',
};

export function slotLabel(slot: LineupSlot): string {
  if (slot === 'FLEX') return 'FLX';
  if (slot === 'SUPERFLEX') return 'SFLX';
  if (slot === 'BENCH') return 'BN';
  return slot;
}

function toneForBye(coreCount: number, benchCount: number): RiskTone {
  const total = coreCount + benchCount;
  if (coreCount >= 4) return 'bad';
  if (coreCount >= 3) return 'warn';
  if (total >= 3) return 'neutral';
  return 'good';
}

function labelForBye(coreCount: number, benchCount: number): string {
  const total = coreCount + benchCount;
  if (coreCount >= 4) return 'major risk';
  if (coreCount >= 3) return 'warning';
  if (total >= 3 && coreCount <= 1) return 'bench-heavy';
  if (total >= 3) return 'minor';
  return 'clean';
}

export function byeRiskGroups(entries: RosterEntry[], rosterSlots: RosterSlots): ByeRiskGroup[] {
  const groups = new Map<number, ByeRiskItem[]>();
  const rows = lineupRows(entries, rosterSlots);

  for (const row of rows) {
    const pick = row.pick;
    if (!pick) continue;
    const player = pick.player;
    if (player.bye === null || STREAMED_POSITIONS.has(player.pos)) continue;
    const item: ByeRiskItem = {
      player,
      slot: row.slot,
      slotLabel: slotLabel(row.slot),
      isCore: CORE_SLOTS.has(row.slot),
    };
    const current = groups.get(player.bye) ?? [];
    current.push(item);
    groups.set(player.bye, current);
  }

  return [...groups.entries()]
    .map(([week, items]) => {
      const coreCount = items.filter(item => item.isCore).length;
      const benchCount = items.length - coreCount;
      return {
        week,
        items,
        coreCount,
        benchCount,
        totalCount: items.length,
        tone: toneForBye(coreCount, benchCount),
        label: labelForBye(coreCount, benchCount),
      };
    })
    .sort((a, b) => a.week - b.week);
}

export function byeGroupTitle(group: ByeRiskGroup): string {
  const details = group.items
    .map(item => `${item.slotLabel} ${item.player.pos} ${item.player.name}`)
    .join('\n');
  return `Week ${group.week}: ${group.coreCount} core starter${group.coreCount === 1 ? '' : 's'}, ${group.benchCount} bench\n${details}`;
}

export function candidateByeFit(
  player: PoolPlayer,
  currentEntries: RosterEntry[],
  rosterSlots: RosterSlots,
): PlayerContextLabel {
  if (player.bye === null || STREAMED_POSITIONS.has(player.pos)) {
    return { label: 'Clean', tone: 'good', title: GLOSSARY.byeFit };
  }

  const candidateEntry: RosterEntry = { player };
  const rows = lineupRows([...currentEntries, candidateEntry], rosterSlots);
  const candidateRow = [...rows].reverse().find(row => row.pick?.player.id === player.id);
  const candidateSlot = candidateRow?.slot ?? 'BENCH';
  const group = byeRiskGroups([...currentEntries, candidateEntry], rosterSlots).find(g => g.week === player.bye);

  if (!group) return { label: 'Clean', tone: 'good', title: GLOSSARY.byeFit };

  const slotPart = slotLabel(candidateSlot);
  const title = `${GLOSSARY.byeFit}\n\nIf drafted: ${byeGroupTitle(group)}`;
  if (group.coreCount >= 4) return { label: `W${group.week} major`, tone: 'bad', title };
  if (group.coreCount >= 3) return { label: `W${group.week} ${group.coreCount} core`, tone: 'warn', title };
  if (candidateSlot === 'BENCH' && group.totalCount >= 3) {
    return { label: `W${group.week} bench`, tone: 'neutral', title };
  }
  if (group.totalCount >= 3) return { label: `W${group.week} minor`, tone: 'neutral', title };
  if (group.totalCount === 2) return { label: `W${group.week} +1`, tone: 'good', title };
  return { label: `W${group.week} clean`, tone: 'good', title: GLOSSARY.byeFit };
}

export function byeFitPenalty(fit: PlayerContextLabel): number {
  if (fit.label.includes('major')) return 6;
  if (fit.label.includes('core')) return 3;
  if (fit.label.includes('minor')) return 1;
  return 0;
}

export function playerRole(player: PoolPlayer): PlayerContextLabel {
  const order = player.depthChartOrder;
  if (player.pos === 'K' || player.pos === 'DST') {
    return { label: player.pos, tone: 'neutral', title: 'Kickers and defenses are normally late-round or streamed positions.' };
  }
  if (!order) {
    return { label: 'Unclear', tone: 'neutral', title: `${GLOSSARY.role}\n\nNo Sleeper depth-chart order is available for this player.` };
  }

  if (player.pos === 'QB') {
    return order === 1
      ? { label: 'QB1', tone: 'good', title: `${GLOSSARY.role}\n\nListed as the starting quarterback.` }
      : { label: 'Backup QB', tone: 'bad', title: `${GLOSSARY.role}\n\nDepth-chart order ${order}: not listed as the starting quarterback.` };
  }
  if (player.pos === 'RB') {
    if (order === 1) return { label: 'RB1', tone: 'good', title: `${GLOSSARY.role}\n\nDepth-chart order 1: likely lead back or listed starter.` };
    if (order === 2) return { label: 'RB2/committee', tone: 'warn', title: `${GLOSSARY.role}\n\nDepth-chart order 2: likely committee, pass-catching, or injury-away profile.` };
    return { label: 'Depth RB', tone: 'bad', title: `${GLOSSARY.role}\n\nDepth-chart order ${order}: role is likely fragile unless camp usage says otherwise.` };
  }
  if (player.pos === 'WR') {
    if (order <= 2) return { label: `WR${order}`, tone: 'good', title: `${GLOSSARY.role}\n\nTop-two listed WR on his NFL team.` };
    if (order === 3) return { label: 'WR3', tone: 'warn', title: `${GLOSSARY.role}\n\nThird listed WR: usable, but target volume can be volatile.` };
    return { label: 'Depth WR', tone: 'bad', title: `${GLOSSARY.role}\n\nDepth-chart order ${order}: role likely needs injury, rotation, or camp signal help.` };
  }
  if (player.pos === 'TE') {
    return order === 1
      ? { label: 'TE1', tone: 'good', title: `${GLOSSARY.role}\n\nListed as the top tight end on his NFL team.` }
      : { label: `TE${order}`, tone: 'warn', title: `${GLOSSARY.role}\n\nDepth-chart order ${order}: target route volume may be uncertain.` };
  }
  return { label: `${player.pos}${order}`, tone: 'neutral', title: GLOSSARY.role };
}

export function playerRisk(player: PoolPlayer): PlayerContextLabel {
  const reasons: string[] = [];
  if (player.injuryStatus) reasons.push(`injury: ${player.injuryStatus}${player.injuryBodyPart ? ` (${player.injuryBodyPart})` : ''}`);
  if (player.rookie) reasons.push('rookie role/learning-curve uncertainty');
  if (player.depthChartOrder && player.depthChartOrder > 2 && player.pos !== 'WR') reasons.push(`depth order ${player.depthChartOrder}`);
  if (player.depthChartOrder && player.depthChartOrder > 3 && player.pos === 'WR') reasons.push(`depth order ${player.depthChartOrder}`);
  if ((player.rankStd ?? 0) >= 20) reasons.push(`high expert disagreement (${Math.round(player.rankStd!)})`);
  else if ((player.rankStd ?? 0) >= 12) reasons.push(`moderate expert disagreement (${Math.round(player.rankStd!)})`);

  if (reasons.length === 0) {
    return { label: 'Low', tone: 'good', title: `${GLOSSARY.risk}\n\nNo injury, rookie, depth-chart, or high expert-disagreement flag found.` };
  }

  const lowered = String(player.injuryStatus ?? '').toLowerCase();
  const severeInjury = lowered.includes('out') || lowered.includes('ir') || lowered.includes('pup') || lowered.includes('sus');
  const tone: RiskTone = severeInjury || reasons.length >= 3 ? 'bad' : 'warn';
  const label = severeInjury || reasons.length >= 3 ? 'High' : player.rookie && reasons.length === 1 ? 'Volatile' : 'Medium';
  return { label, tone, title: `${GLOSSARY.risk}\n\n${reasons.join('\n')}` };
}

export function toneClass(tone: RiskTone, styles: Record<string, string>): string {
  if (tone === 'good') return styles.deltaGood ?? '';
  if (tone === 'warn') return styles.byeWarn ?? '';
  if (tone === 'bad') return styles.deltaBad ?? '';
  return styles.dim ?? '';
}
