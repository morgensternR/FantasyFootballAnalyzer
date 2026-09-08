const FRESHNESS_ID = 'ffa-draft-data-freshness';

function isDraftBoardTable(table: HTMLTableElement): boolean {
  const labels = Array.from(table.querySelectorAll('thead th'))
    .map(th => th.textContent?.trim().toUpperCase() ?? '');
  return labels.includes('NFL ROLE') && labels.includes('OVERALL CTX');
}

function findDraftBoardTable(): HTMLTableElement | null {
  for (const table of document.querySelectorAll<HTMLTableElement>('table')) {
    if (isDraftBoardTable(table)) return table;
  }
  return null;
}

function placeFreshnessStatus(): void {
  const badge = document.getElementById(FRESHNESS_ID);
  const table = findDraftBoardTable();
  const wrapper = table?.parentElement;
  const board = wrapper?.parentElement;
  if (!badge || !wrapper || !board) return;

  // The enhancer creates the status at <body> level because it is independent
  // of React. Re-parent it into the board's normal layout so it never floats
  // over Pick Log, draft controls, or player rows.
  if (badge.parentElement !== board || badge.nextElementSibling !== wrapper) {
    board.insertBefore(badge, wrapper);
  }
}

export function installDraftFreshnessPlacement(): () => void {
  if (typeof document === 'undefined') return () => {};

  const observer = new MutationObserver(placeFreshnessStatus);
  observer.observe(document.getElementById('root') ?? document.body, {
    childList: true,
    subtree: true,
  });
  queueMicrotask(placeFreshnessStatus);

  return () => observer.disconnect();
}
