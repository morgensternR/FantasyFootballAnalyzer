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
  tone: