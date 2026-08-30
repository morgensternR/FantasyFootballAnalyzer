import type { PoolPlayer } from '@/types/draft';
import {
  volumeEntryByRenderedPlayerText,
  volumeLabel,
  volumeTooltip,
  type VolumePlayerContext,
} from './volumeContext';

const TOOLTIP_ID = 'ffa-draft-volume-tooltip';
type VolumeSortDirection = 'desc' | 'asc' | null;

function isDraftBoardTable(table: HTMLTableElement): boolean {
  const labels = Array.from(table.querySelectorAll('thead th')).map(
    th => th.textContent?.trim().toUpperCase() ?? '',
  );
  return labels.includes('PLAYER') && labels.includes('NFL ROLE') && labels.includes('OVERALL CTX');
}

function draftBoardTable(): HTMLTableElement | null {
  for (const table of document.querySelectorAll<HTMLTableElement>('table')) {
    if (isDraftBoardTable(table)) return table;
  }
  return null;
}

function clearCell(cell: HTMLTableCellElement): void {
  const originalTitle = cell.dataset.volumeRoleTitle;
  cell.classList.remove('draft-volume-cell');
  delete cell.dataset.volumeLabel;
  delete cell.dataset.draftVolumeTooltip;
  delete cell.dataset.volumePlayerId;
  delete cell.dataset.volumeSortValue;
  delete cell.dataset.volumeRoleTitle;
  cell.removeAttribute('aria-describedby');
  if (originalTitle) cell.setAttribute('title', originalTitle);
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

function renderTooltip(tip: HTMLDivElement, text: string): void {
  tip.replaceChildren();
  const lines = text.split('\n');
  const title = lines.find(line => line.trim() && !line.trim().startsWith('•')) ?? 'NFL Role / Volume';
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
  const left = Math.max(margin, Math.min(rect.left, window.innerWidth - tipRect.width - margin));
  let top = rect.bottom + gap;
  if (top + tipRect.height > window.innerHeight - margin) {
    top = Math.max(margin, rect.top - tipRect.height - gap);
  }
  tip.style.left = `${Math.round(left)}px`;
  tip.style.top = `${Math.round(top)}px`;
}

function projectedVolumeSortValue(context: VolumePlayerContext): number | null {
  const projection = context.projection;
  if (!projection) return null;

  if (context.pos === 'QB') {
    return projection.passAttempts ?? projection.rushAttempts ?? null;
  }
  if (context.pos === 'RB') {
    if (projection.opportunities != null) return projection.opportunities;
    if (projection.rushAttempts != null) {
      return projection.rushAttempts + (projection.targets ?? projection.receptions ?? 0);
    }
    return projection.targets ?? projection.receptions ?? null;
  }
  if (context.pos === 'WR' || context.pos === 'TE') {
    return projection.targets ?? projection.receptions ?? null;
  }
  return null;
}

function decorateTable(table: HTMLTableElement): void {
  const headers = Array.from(table.querySelectorAll<HTMLTableCellElement>('thead th'));
  const labels = headers.map(header => header.textContent?.trim().toUpperCase() ?? '');
  const playerIndex = labels.indexOf('PLAYER');
  const roleIndex = labels.indexOf('NFL ROLE');
  if (playerIndex < 0 || roleIndex < 0) return;

  headers[roleIndex].dataset.volumeEnabled = '1';
  headers[roleIndex].title =
    'NFL depth/role clue plus projected offensive volume. Click to sort highest or lowest projected workload; hover a player role cell for projection sources, confidence, and previous-season actual snap usage.';

  for (const row of table.querySelectorAll<HTMLTableRowElement>('tbody tr')) {
    const cells = Array.from(row.cells) as HTMLTableCellElement[];
    if (cells.length <= Math.max(playerIndex, roleIndex)) continue; // cutoff/empty rows
    const playerCell = cells[playerIndex];
    const roleCell = cells[roleIndex];
    const hit = volumeEntryByRenderedPlayerText(playerCell.textContent ?? '');
    if (!hit) {
      if (roleCell.classList.contains('draft-volume-cell')) clearCell(roleCell);
      continue;
    }

    const player = {
      id: hit.id,
      name: hit.context.name,
      team: hit.context.team,
      pos: hit.context.pos,
    } as PoolPlayer;
    const label = volumeLabel(player, hit.context);
    const roleTitle = roleCell.dataset.volumeRoleTitle ?? roleCell.getAttribute('title') ?? '';
    if (roleTitle) roleCell.dataset.volumeRoleTitle = roleTitle;
    const tooltip = volumeTooltip(player, roleTitle, hit.context);
    const sortValue = projectedVolumeSortValue(hit.context);

    if (!label && !tooltip) {
      if (roleCell.classList.contains('draft-volume-cell')) clearCell(roleCell);
      continue;
    }
    roleCell.dataset.volumePlayerId = hit.id;
    if (sortValue != null && Number.isFinite(sortValue)) {
      roleCell.dataset.volumeSortValue = String(sortValue);
    } else {
      delete roleCell.dataset.volumeSortValue;
    }
    if (label) {
      roleCell.dataset.volumeLabel = label;
      roleCell.classList.add('draft-volume-cell');
    }
    if (tooltip) {
      roleCell.dataset.draftVolumeTooltip = tooltip;
      roleCell.removeAttribute('title'); // suppress small native tooltip
      roleCell.setAttribute('aria-describedby', TOOLTIP_ID);
    }
  }
}

function headerIndexes(table: HTMLTableElement): { roleIndex: number } | null {
  const headers = Array.from(table.querySelectorAll<HTMLTableCellElement>('thead th'));
  const roleIndex = headers.findIndex(header => header.textContent?.trim().toUpperCase() === 'NFL ROLE');
  return roleIndex >= 0 ? { roleIndex } : null;
}

function roleHeader(table: HTMLTableElement): HTMLTableCellElement | null {
  const indexes = headerIndexes(table);
  return indexes ? table.querySelectorAll<HTMLTableCellElement>('thead th')[indexes.roleIndex] ?? null : null;
}

function setHeaderSortState(table: HTMLTableElement, direction: VolumeSortDirection): void {
  const header = roleHeader(table);
  if (!header) return;
  header.dataset.volumeEnabled = '1';
  header.dataset.volumeSortDirection = direction ?? 'none';
  header.setAttribute('role', 'button');
  header.tabIndex = 0;
  header.setAttribute('aria-sort', direction === 'desc' ? 'descending' : direction === 'asc' ? 'ascending' : 'none');
  header.title = direction === 'desc'
    ? 'Projected workload: highest to lowest. Click again for lowest to highest.'
    : direction === 'asc'
      ? 'Projected workload: lowest to highest. Click again for highest to lowest.'
      : 'NFL depth/role clue plus projected offensive volume. Click to sort highest or lowest projected workload; hover a player role cell for sources and actual snap usage.';
}

interface SortableRow {
  row: HTMLTableRowElement;
  playerId: string;
  value: number | null;
}

function sortableRows(table: HTMLTableElement, roleIndex: number): SortableRow[] {
  const body = table.tBodies[0];
  if (!body) return [];
  const out: SortableRow[] = [];
  for (const row of Array.from(body.rows)) {
    const roleCell = row.cells[roleIndex] as HTMLTableCellElement | undefined;
    const playerId = roleCell?.dataset.volumePlayerId;
    if (!playerId) continue;
    const raw = roleCell.dataset.volumeSortValue;
    const value = raw == null ? null : Number(raw);
    out.push({
      row,
      playerId,
      value: value != null && Number.isFinite(value) ? value : null,
    });
  }
  return out;
}

function setCutoffVisible(table: HTMLTableElement, visible: boolean): void {
  const body = table.tBodies[0];
  if (!body) return;
  for (const row of Array.from(body.rows)) {
    if (!row.textContent?.includes('Likely gone')) continue;
    if (visible) {
      if (row.dataset.volumeSortHidden === '1') row.style.removeProperty('display');
      delete row.dataset.volumeSortHidden;
    } else {
      row.dataset.volumeSortHidden = '1';
      row.style.display = 'none';
    }
  }
}

function reorderRows(table: HTMLTableElement, ordered: SortableRow[]): void {
  const body = table.tBodies[0];
  if (!body || ordered.length < 2) return;
  const current = sortableRows(table, headerIndexes(table)?.roleIndex ?? -1).map(entry => entry.playerId);
  const desired = ordered.map(entry => entry.playerId);
  if (current.length === desired.length && current.every((id, index) => id === desired[index])) return;
  for (const entry of ordered) body.appendChild(entry.row);
}

function applyVolumeSort(table: HTMLTableElement, direction: Exclude<VolumeSortDirection, null>): void {
  const indexes = headerIndexes(table);
  if (!indexes) return;
  const entries = sortableRows(table, indexes.roleIndex);
  const ordered = [...entries].sort((a, b) => {
    if (a.value == null && b.value == null) return 0;
    if (a.value == null) return 1;
    if (b.value == null) return -1;
    return direction === 'desc' ? b.value - a.value : a.value - b.value;
  });
  setCutoffVisible(table, false);
  reorderRows(table, ordered);
  setHeaderSortState(table, direction);
}

function restoreBaseOrder(table: HTMLTableElement, baseOrder: string[]): void {
  const indexes = headerIndexes(table);
  if (!indexes) return;
  const entries = sortableRows(table, indexes.roleIndex);
  const order = new Map(baseOrder.map((id, index) => [id, index]));
  const ordered = [...entries].sort((a, b) => {
    const ai = order.get(a.playerId);
    const bi = order.get(b.playerId);
    if (ai == null && bi == null) return 0;
    if (ai == null) return 1;
    if (bi == null) return -1;
    return ai - bi;
  });
  reorderRows(table, ordered);
  setCutoffVisible(table, true);
  setHeaderSortState(table, null);
}

function volumeCell(start: EventTarget | null): HTMLTableCellElement | null {
  return start instanceof Element
    ? start.closest<HTMLTableCellElement>('td.draft-volume-cell[data-draft-volume-tooltip]')
    : null;
}

export function installDraftVolumeOverlay(): () => void {
  if (typeof document === 'undefined' || typeof MutationObserver === 'undefined') return () => {};

  const tip = ensureTooltip();
  let active: HTMLTableCellElement | null = null;
  let sortDirection: VolumeSortDirection = null;
  let baseOrder: string[] = [];

  const decorate = () => {
    const table = draftBoardTable();
    if (!table) return;
    decorateTable(table);
    setHeaderSortState(table, sortDirection);
    if (sortDirection) applyVolumeSort(table, sortDirection);
  };
  const show = (cell: HTMLTableCellElement) => {
    const text = cell.dataset.draftVolumeTooltip;
    if (!text) return;
    active = cell;
    renderTooltip(tip, text);
    tip.hidden = false;
    positionTooltip(tip, cell);
  };
  const hide = () => {
    active = null;
    tip.hidden = true;
  };
  const onPointerOver = (event: PointerEvent) => {
    const cell = volumeCell(event.target);
    if (cell) show(cell);
  };
  const onPointerOut = (event: PointerEvent) => {
    if (!active) return;
    const related = event.relatedTarget as Node | null;
    if (related && active.contains(related)) return;
    hide();
  };
  const onFocusIn = (event: FocusEvent) => {
    const cell = volumeCell(event.target);
    if (cell) show(cell);
  };
  const onFocusOut = () => hide();
  const onResize = () => {
    if (!tip.hidden && active) positionTooltip(tip, active);
  };
  const toggleVolumeSort = (table: HTMLTableElement) => {
    decorateTable(table);
    const indexes = headerIndexes(table);
    if (!indexes) return;
    if (sortDirection == null) {
      baseOrder = sortableRows(table, indexes.roleIndex).map(entry => entry.playerId);
      sortDirection = 'desc';
    } else {
      sortDirection = sortDirection === 'desc' ? 'asc' : 'desc';
    }
    applyVolumeSort(table, sortDirection);
    playSortAnnouncement(sortDirection);
  };
  const clearVolumeSort = (table: HTMLTableElement) => {
    if (!sortDirection) return;
    sortDirection = null;
    restoreBaseOrder(table, baseOrder);
    baseOrder = [];
  };
  const onClick = (event: MouseEvent) => {
    if (!(event.target instanceof Element)) return;
    const header = event.target.closest<HTMLTableCellElement>('thead th');
    const table = header?.closest<HTMLTableElement>('table');
    if (!header || !table || !isDraftBoardTable(table)) return;
    const volumeHeader = roleHeader(table);
    if (header === volumeHeader) {
      event.preventDefault();
      toggleVolumeSort(table);
      return;
    }
    if (sortDirection && header.getAttribute('role') === 'button') clearVolumeSort(table);
  };
  const onKeyDown = (event: KeyboardEvent) => {
    if (event.key !== 'Enter' && event.key !== ' ') return;
    if (!(event.target instanceof Element)) return;
    const header = event.target.closest<HTMLTableCellElement>('thead th');
    const table = header?.closest<HTMLTableElement>('table');
    if (!header || !table || !isDraftBoardTable(table)) return;
    const volumeHeader = roleHeader(table);
    if (header === volumeHeader) {
      event.preventDefault();
      toggleVolumeSort(table);
      return;
    }
    if (sortDirection && header.getAttribute('role') === 'button') clearVolumeSort(table);
  };

  const observer = new MutationObserver(decorate);
  observer.observe(document.getElementById('root') ?? document.body, {
    childList: true,
    subtree: true,
  });
  document.addEventListener('pointerover', onPointerOver, true);
  document.addEventListener('pointerout', onPointerOut, true);
  document.addEventListener('focusin', onFocusIn, true);
  document.addEventListener('focusout', onFocusOut, true);
  document.addEventListener('click', onClick);
  document.addEventListener('keydown', onKeyDown);
  window.addEventListener('resize', onResize);
  queueMicrotask(decorate);

  return () => {
    observer.disconnect();
    document.removeEventListener('pointerover', onPointerOver, true);
    document.removeEventListener('pointerout', onPointerOut, true);
    document.removeEventListener('focusin', onFocusIn, true);
    document.removeEventListener('focusout', onFocusOut, true);
    document.removeEventListener('click', onClick);
    document.removeEventListener('keydown', onKeyDown);
    window.removeEventListener('resize', onResize);
    tip.remove();
    const table = draftBoardTable();
    if (!table) return;
    if (sortDirection) restoreBaseOrder(table, baseOrder);
    for (const cell of table.querySelectorAll<HTMLTableCellElement>('td.draft-volume-cell')) clearCell(cell);
    for (const header of table.querySelectorAll<HTMLTableCellElement>('thead th')) {
      delete header.dataset.volumeEnabled;
      delete header.dataset.volumeSortDirection;
      if (header.textContent?.trim().toUpperCase() === 'NFL ROLE') {
        header.removeAttribute('aria-sort');
        header.removeAttribute('role');
        header.removeAttribute('tabindex');
      }
    }
  };
}

function playSortAnnouncement(direction: Exclude<VolumeSortDirection, null>): void {
  const root = document.getElementById('root');
  if (!root) return;
  root.dataset.volumeSort = direction;
}
