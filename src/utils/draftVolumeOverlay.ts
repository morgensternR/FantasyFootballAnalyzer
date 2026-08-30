import type { PoolPlayer } from '@/types/draft';
import {
  volumeEntryByRenderedPlayerText,
  volumeLabel,
  volumeTooltip,
} from './volumeContext';

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
  delete cell.dataset.draftContextTooltip;
  delete cell.dataset.volumePlayerId;
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
      roleCell.dataset.draftContextTooltip = tooltip;
      // The large context tooltip system reads data-draft-context-tooltip.
      // Remove the native title only after preserving the role explanation.
      roleCell.removeAttribute('title');
    }
  }
}

export function installDraftVolumeOverlay(): () => void {
  if (typeof document === 'undefined' || typeof MutationObserver === 'undefined') return () => {};

  const decorate = () => {
    const table = draftBoardTable();
    if (table) decorateTable(table);
  };

  const observer = new MutationObserver(decorate);
  observer.observe(document.getElementById('root') ?? document.body, {
    childList: true,
    subtree: true,
  });
  queueMicrotask(decorate);

  return () => {
    observer.disconnect();
    const table = draftBoardTable();
    if (!table) return;
    for (const cell of table.querySelectorAll<HTMLTableCellElement>('td.draft-volume-cell')) clearCell(cell);
    for (const header of table.querySelectorAll<HTMLTableCellElement>('thead th')) {
      delete header.dataset.volumeEnabled;
    }
  };
}
