import type { PoolPlayer } from '@/types/draft';
import {
  volumeEntryByRenderedPlayerText,
  volumeLabel,
  volumeTooltip,
} from './volumeContext';

const TOOLTIP_ID = 'ffa-draft-volume-tooltip';

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
  cell.classList.remove('draft-volume-cell');
  delete cell.dataset.volumeLabel;
  delete cell.dataset.draftVolumeTooltip;
  delete cell.dataset.volumePlayerId;
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

function decorateTable(table: HTMLTableElement): void {
  const headers = Array.from(table.querySelectorAll<HTMLTableCellElement>('thead th'));
  const labels = headers.map(header => header.textContent?.trim().toUpperCase() ?? '');
  const playerIndex = labels.indexOf('PLAYER');
  const roleIndex = labels.indexOf('NFL ROLE');
  if (playerIndex < 0 || roleIndex < 0) return;

  headers[roleIndex].dataset.volumeEnabled = '1';
  headers[roleIndex].title =
    'NFL depth/role clue plus projected offensive volume. Hover a player role cell for projection sources, confidence, and previous-season actual snap usage.';

  for (const row of table.querySelectorAll<HTMLTableRowElement>('tbody tr')) {
    const cells = Array.from(row.cells) as HTMLTableCellElement[];
    if (cells.length <= Math.max(playerIndex, roleIndex)) continue; // cutoff/empty rows
    const playerCell = cells[playerIndex];
    const roleCell = cells[roleIndex];
    const hit = volumeEntryByRenderedPlayerText(playerCell.textContent ?? '');
    if (!hit) {
      clearCell(roleCell);
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

    if (!label && !tooltip) {
      clearCell(roleCell);
      continue;
    }
    roleCell.dataset.volumePlayerId = hit.id;
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

function volumeCell(start: EventTarget | null): HTMLTableCellElement | null {
  return start instanceof Element
    ? start.closest<HTMLTableCellElement>('td.draft-volume-cell[data-draft-volume-tooltip]')
    : null;
}

export function installDraftVolumeOverlay(): () => void {
  if (typeof document === 'undefined' || typeof MutationObserver === 'undefined') return () => {};

  const tip = ensureTooltip();
  let active: HTMLTableCellElement | null = null;

  const decorate = () => {
    const table = draftBoardTable();
    if (table) decorateTable(table);
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

  const observer = new MutationObserver(decorate);
  observer.observe(document.getElementById('root') ?? document.body, {
    childList: true,
    subtree: true,
  });
  document.addEventListener('pointerover', onPointerOver, true);
  document.addEventListener('pointerout', onPointerOut, true);
  document.addEventListener('focusin', onFocusIn, true);
  document.addEventListener('focusout', onFocusOut, true);
  window.addEventListener('resize', onResize);
  queueMicrotask(decorate);

  return () => {
    observer.disconnect();
    document.removeEventListener('pointerover', onPointerOver, true);
    document.removeEventListener('pointerout', onPointerOut, true);
    document.removeEventListener('focusin', onFocusIn, true);
    document.removeEventListener('focusout', onFocusOut, true);
    window.removeEventListener('resize', onResize);
    tip.remove();
    const table = draftBoardTable();
    if (!table) return;
    for (const cell of table.querySelectorAll<HTMLTableCellElement>('td.draft-volume-cell')) clearCell(cell);
    for (const header of table.querySelectorAll<HTMLTableCellElement>('thead th')) {
      delete header.dataset.volumeEnabled;
    }
  };
}
