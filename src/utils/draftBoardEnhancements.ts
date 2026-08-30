import teamContextJson from '@/data/teamContext.2026.json';
import infrastructureJson from '@/data/teamInfrastructure.2026.json';
import { POOL } from '@/data/draftPool';
import { SLEEPER_CONTEXT_UPDATED_EVENT } from '@/api/sleeperLiveContext';
import { injuryOutlook } from './injuryOutlook';
import { installDraftPickClock } from './draftPickClock';

const COLUMN_STORAGE_KEY = 'ffa:draft-board-column-widths:v1';
const SLEEPER_CACHE_KEY = 'ffa:sleeper-draft-context:v1';
const TOOLTIP_ID = 'ffa-draft-context-tooltip';
const FRESHNESS_ID = 'ffa-draft-data-freshness';
const RESIZE_EDGE_PX = 10;
const MIN_COLUMN_PX = 32;

interface TeamContextFile {
  contextDate?: string;
}

interface InfrastructureFile {
  checkedDate?: string;
  olCheckedDate?: string;
}

interface SleeperCacheShape {
  fetchedAt?: string;
  contextDate?: string;
}

const TEAM_CONTEXT = teamContextJson as TeamContextFile;
const INFRASTRUCTURE = infrastructureJson as InfrastructureFile;

function isDraftBoardTable(table: HTMLTableElement): boolean {
  const labels = Array.from(table.querySelectorAll('thead th'))
    .map(th => th.textContent?.trim().toUpperCase() ?? '');
  return labels.includes('NFL ROLE') && labels.includes('OVERALL CTX');
}

function draftBoardTable(): HTMLTableElement | null {
  for (const table of document.querySelectorAll<HTMLTableElement>('table')) {
    if (isDraftBoardTable(table)) return table;
  }
  return null;
}

function headerKey(th: HTMLTableCellElement, index: number): string {
  const label = th.textContent?.trim() || th.getAttribute('aria-label') || `column-${index}`;
  return `${index}:${label.replace(/\s+/g, ' ')}`;
}

function readColumnWidths(): Record<string, number> {
  try {
    const raw = localStorage.getItem(COLUMN_STORAGE_KEY);
    if (!raw) return {};
    const parsed = JSON.parse(raw) as Record<string, unknown>;
    return Object.fromEntries(
      Object.entries(parsed).filter(([, value]) => typeof value === 'number' && Number.isFinite(value)),
    ) as Record<string, number>;
  } catch {
    return {};
  }
}

function saveColumnWidths(table: HTMLTableElement): void {
  const widths: Record<string, number> = {};
  const headers = Array.from(table.querySelectorAll<HTMLTableCellElement>('thead th'));
  headers.forEach((th, index) => {
    widths[headerKey(th, index)] = Math.round(th.getBoundingClientRect().width);
  });
  try {
    localStorage.setItem(COLUMN_STORAGE_KEY, JSON.stringify(widths));
  } catch {
    // Drafting must never fail because localStorage is unavailable/full.
  }
}

function freezeTableColumns(table: HTMLTableElement, preferred?: Record<string, number>): void {
  const headers = Array.from(table.querySelectorAll<HTMLTableCellElement>('thead th'));
  let total = 0;
  headers.forEach((th, index) => {
    const saved = preferred?.[headerKey(th, index)];
    const width = Math.max(MIN_COLUMN_PX, saved ?? th.getBoundingClientRect().width);
    th.style.width = `${width}px`;
    th.style.minWidth = `${width}px`;
    th.style.maxWidth = `${width}px`;
    total += width;
  });
  table.style.tableLayout = 'fixed';
  table.style.width = `${Math.max(total, table.parentElement?.clientWidth ?? 0)}px`;
  table.classList.add('draft-resizable-table');
}

function applySavedColumnWidths(table: HTMLTableElement): void {
  if (table.dataset.resizeWidthsApplied === '1') return;
  table.dataset.resizeWidthsApplied = '1';
  table.classList.add('draft-resizable-table');
  const saved = readColumnWidths();
  if (Object.keys(saved).length > 0) freezeTableColumns(table, saved);
}

function resetColumnWidths(table: HTMLTableElement): void {
  try {
    localStorage.removeItem(COLUMN_STORAGE_KEY);
  } catch {
    // Ignore storage failures.
  }
  for (const th of table.querySelectorAll<HTMLTableCellElement>('thead th')) {
    th.style.removeProperty('width');
    th.style.removeProperty('min-width');
    th.style.removeProperty('max-width');
  }
  table.style.removeProperty('table-layout');
  table.style.removeProperty('width');
}

function startsContextTooltip(text: string): boolean {
  return (
    text.startsWith('Injury / availability') ||
    text.startsWith('Season Outlook') ||
    text.startsWith('Team Changes') ||
    text.startsWith('Overall CTX:') ||
    text.startsWith('Current player availability.') ||
    text.startsWith('Season Outlook is the broad fantasy environment.') ||
    text.startsWith('Team Changes isolates') ||
    text.startsWith('Overall CTX compresses')
  );
}

function bulletValue(text: string, prefix: string): string | undefined {
  const line = text.split('\n').find(item => item.trim().startsWith(`• ${prefix}`));
  return line?.trim().slice(`• ${prefix}`.length).trim() || undefined;
}

function enrichInjuryTooltip(text: string): string {
  if (!text.startsWith('Injury / availability')) return text;
  if (text.includes('D/ST represents an entire defensive unit')) return text;
  if (text.includes('Status: Healthy')) return text;
  if (text.includes('Typical recovery:')) return text;

  const bodyPart = bulletValue(text, 'Body part:');
  const notes = bulletValue(text, 'Sleeper note:');
  const status = bulletValue(text, 'Status:');
  const profile = injuryOutlook(bodyPart, notes, status);
  if (!profile) return text;

  return [
    text,
    '',
    `• Typical injury pattern: ${profile.name}`,
    `• Typical recovery: ${profile.typicalRecovery}`,
    `• Recurrence concern: ${profile.recurrence}`,
    `• Fantasy concern: ${profile.concern}`,
    '• Important: this is general sports-medicine context, not a diagnosis or a player-specific return date.',
    profile.sourceUrls.length > 0 ? `• Medical context sources: ${profile.sourceUrls.join(' · ')}` : null,
  ].filter(Boolean).join('\n');
}

function ensureTooltip(): HTMLDivElement {
  let tip = document.getElementById(TOOLTIP_ID) as HTMLDivElement | null;
  if (tip) return tip;
  tip = document.createElement('div');
  tip.id = TOOLTIP_ID;
  tip.className = 'draft-context-tooltip';
  tip.hidden = true;
  tip.setAttribute('role', 'tooltip');
  document.body.appendChild(tip);
  return tip;
}

function renderTooltipText(tip: HTMLDivElement, text: string): void {
  tip.replaceChildren();
  const lines = text.split('\n');
  const title = lines.find(line => line.trim() && !line.trim().startsWith('•')) ?? '';
  const heading = document.createElement('div');
  heading.className = 'draft-context-tooltip__title';
  heading.textContent = title;
  tip.appendChild(heading);

  const body = document.createElement('div');
  body.className = 'draft-context-tooltip__body';
  for (const line of lines) {
    const trimmed = line.trim();
    if (!trimmed || trimmed === title) continue;
    const item = document.createElement('div');
    item.className = trimmed.startsWith('•') ? 'draft-context-tooltip__bullet' : 'draft-context-tooltip__line';
    item.textContent = trimmed.startsWith('•') ? trimmed.slice(1).trim() : trimmed;
    body.appendChild(item);
  }
  tip.appendChild(body);
}

function positionTooltip(tip: HTMLDivElement, anchor: HTMLElement): void {
  const margin = 16;
  const gap = 10;
  const rect = anchor.getBoundingClientRect();
  const tipRect = tip.getBoundingClientRect();
  let left = rect.left;
  left = Math.max(margin, Math.min(left, window.innerWidth - tipRect.width - margin));
  let top = rect.bottom + gap;
  if (top + tipRect.height > window.innerHeight - margin) {
    top = Math.max(margin, rect.top - tipRect.height - gap);
  }
  tip.style.left = `${Math.round(left)}px`;
  tip.style.top = `${Math.round(top)}px`;
}

function contextTooltipTarget(start: EventTarget | null): HTMLElement | null {
  const el = start instanceof Element ? start.closest<HTMLElement>('[title], [data-draft-context-tooltip]') : null;
  if (!el) return null;
  const raw = el.dataset.draftContextTooltip || el.getAttribute('title') || '';
  return startsContextTooltip(raw) ? el : null;
}

function prepareTooltipTarget(target: HTMLElement): string {
  let text = target.dataset.draftContextTooltip || target.getAttribute('title') || '';
  text = enrichInjuryTooltip(text);
  target.dataset.draftContextTooltip = text;
  target.removeAttribute('title'); // suppress the tiny browser/OS tooltip
  target.setAttribute('aria-describedby', TOOLTIP_ID);
  return text;
}

function formatDateTime(value?: string): string {
  if (!value) return 'unknown';
  const date = new Date(value);
  if (Number.isNaN(date.getTime())) return value;
  return date.toLocaleString(undefined, {
    month: 'short', day: 'numeric', hour: 'numeric', minute: '2-digit',
  });
}

function formatDate(value?: string): string {
  if (!value) return 'unknown';
  const date = new Date(`${value}T12:00:00`);
  if (Number.isNaN(date.getTime())) return value;
  return date.toLocaleDateString(undefined, { month: 'short', day: 'numeric' });
}

function sleeperCache(): SleeperCacheShape | null {
  try {
    const raw = localStorage.getItem(SLEEPER_CACHE_KEY);
    return raw ? JSON.parse(raw) as SleeperCacheShape : null;
  } catch {
    return null;
  }
}

function ensureFreshnessBadge(): HTMLDivElement {
  let badge = document.getElementById(FRESHNESS_ID) as HTMLDivElement | null;
  if (badge) return badge;
  badge = document.createElement('div');
  badge.id = FRESHNESS_ID;
  badge.className = 'draft-data-freshness';
  document.body.appendChild(badge);
  return badge;
}

function updateFreshnessBadge(): void {
  const badge = ensureFreshnessBadge();
  const table = draftBoardTable();
  badge.hidden = !table;
  if (!table) return;

  const cache = sleeperCache();
  const sleeper = cache?.fetchedAt ? formatDateTime(cache.fetchedAt) : 'bundled / no live fetch';
  const rankings = formatDateTime(POOL.generatedAt);
  const teamOutlook = formatDate(TEAM_CONTEXT.contextDate);
  const coaching = formatDate(INFRASTRUCTURE.checkedDate);
  const ol = formatDate(INFRASTRUCTURE.olCheckedDate);

  badge.textContent = `DATA  Sleeper: ${sleeper}  ·  Rankings: ${rankings}  ·  OFF/DEF/SOS checked: ${teamOutlook}  ·  Coaching: ${coaching}  ·  OL: ${ol}`;
  badge.title = 'Sleeper is the live daily player-status/depth fetch. Rankings are the bundled pool build time. OFF/DEF/SOS, coaching and OL keep their real source-check dates instead of being falsely stamped current when the app opens. Drag a column divider to resize; double-click a divider to reset column widths.';
}

export function installDraftBoardEnhancements(): () => void {
  if (typeof window === 'undefined' || typeof document === 'undefined') return () => {};

  const tip = ensureTooltip();
  const removePickClock = installDraftPickClock();
  let activeTooltipTarget: HTMLElement | null = null;
  let resize: {
    table: HTMLTableElement;
    th: HTMLTableCellElement;
    startX: number;
    startWidth: number;
    startTableWidth: number;
  } | null = null;

  const enhanceTables = () => {
    const table = draftBoardTable();
    if (table) applySavedColumnWidths(table);
    updateFreshnessBadge();
  };

  const onPointerOver = (event: PointerEvent) => {
    const target = contextTooltipTarget(event.target);
    if (!target) return;
    activeTooltipTarget = target;
    const text = prepareTooltipTarget(target);
    renderTooltipText(tip, text);
    tip.hidden = false;
    positionTooltip(tip, target);
  };

  const onPointerOut = (event: PointerEvent) => {
    if (!activeTooltipTarget) return;
    const related = event.relatedTarget as Node | null;
    if (related && activeTooltipTarget.contains(related)) return;
    activeTooltipTarget = null;
    tip.hidden = true;
  };

  const onFocusIn = (event: FocusEvent) => {
    const target = contextTooltipTarget(event.target);
    if (!target) return;
    activeTooltipTarget = target;
    const text = prepareTooltipTarget(target);
    renderTooltipText(tip, text);
    tip.hidden = false;
    positionTooltip(tip, target);
  };

  const onFocusOut = () => {
    activeTooltipTarget = null;
    tip.hidden = true;
  };

  const onPointerDown = (event: PointerEvent) => {
    const th = event.target instanceof Element
      ? event.target.closest<HTMLTableCellElement>('th')
      : null;
    const table = th?.closest<HTMLTableElement>('table');
    if (!th || !table || !isDraftBoardTable(table)) return;
    const rect = th.getBoundingClientRect();
    if (rect.right - event.clientX > RESIZE_EDGE_PX) return;

    event.preventDefault();
    event.stopPropagation();
    const headers = Array.from(table.querySelectorAll<HTMLTableCellElement>('thead th'));
    const startTableWidth = headers.reduce((sum, header) => sum + header.getBoundingClientRect().width, 0);
    freezeTableColumns(table);
    resize = {
      table,
      th,
      startX: event.clientX,
      startWidth: rect.width,
      startTableWidth,
    };
    document.body.classList.add('draft-column-resizing');
  };

  const onPointerMove = (event: PointerEvent) => {
    if (!resize) return;
    const delta = event.clientX - resize.startX;
    const width = Math.max(MIN_COLUMN_PX, resize.startWidth + delta);
    const appliedDelta = width - resize.startWidth;
    resize.th.style.width = `${width}px`;
    resize.th.style.minWidth = `${width}px`;
    resize.th.style.maxWidth = `${width}px`;
    resize.table.style.width = `${Math.max(resize.startTableWidth + appliedDelta, resize.table.parentElement?.clientWidth ?? 0)}px`;
  };

  const endResize = () => {
    if (!resize) return;
    saveColumnWidths(resize.table);
    resize = null;
    document.body.classList.remove('draft-column-resizing');
  };

  const onDoubleClick = (event: MouseEvent) => {
    const th = event.target instanceof Element
      ? event.target.closest<HTMLTableCellElement>('th')
      : null;
    const table = th?.closest<HTMLTableElement>('table');
    if (!th || !table || !isDraftBoardTable(table)) return;
    const rect = th.getBoundingClientRect();
    if (rect.right - event.clientX > RESIZE_EDGE_PX) return;
    event.preventDefault();
    event.stopPropagation();
    resetColumnWidths(table);
  };

  const onWindowResize = () => {
    if (!tip.hidden && activeTooltipTarget) positionTooltip(tip, activeTooltipTarget);
  };

  const observer = new MutationObserver(enhanceTables);
  observer.observe(document.getElementById('root') ?? document.body, { childList: true, subtree: true });

  document.addEventListener('pointerover', onPointerOver, true);
  document.addEventListener('pointerout', onPointerOut, true);
  document.addEventListener('focusin', onFocusIn, true);
  document.addEventListener('focusout', onFocusOut, true);
  document.addEventListener('pointerdown', onPointerDown, true);
  document.addEventListener('pointermove', onPointerMove, true);
  document.addEventListener('pointerup', endResize, true);
  document.addEventListener('pointercancel', endResize, true);
  document.addEventListener('dblclick', onDoubleClick, true);
  window.addEventListener(SLEEPER_CONTEXT_UPDATED_EVENT, updateFreshnessBadge);
  window.addEventListener('resize', onWindowResize);

  queueMicrotask(enhanceTables);

  return () => {
    removePickClock();
    observer.disconnect();
    document.removeEventListener('pointerover', onPointerOver, true);
    document.removeEventListener('pointerout', onPointerOut, true);
    document.removeEventListener('focusin', onFocusIn, true);
    document.removeEventListener('focusout', onFocusOut, true);
    document.removeEventListener('pointerdown', onPointerDown, true);
    document.removeEventListener('pointermove', onPointerMove, true);
    document.removeEventListener('pointerup', endResize, true);
    document.removeEventListener('pointercancel', endResize, true);
    document.removeEventListener('dblclick', onDoubleClick, true);
    window.removeEventListener(SLEEPER_CONTEXT_UPDATED_EVENT, updateFreshnessBadge);
    window.removeEventListener('resize', onWindowResize);
    tip.remove();
    document.getElementById(FRESHNESS_ID)?.remove();
  };
}
