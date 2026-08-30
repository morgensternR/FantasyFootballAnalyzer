const TOOLTIP_ID = 'ffa-draft-context-tooltip';
const FONT_STORAGE_KEY = 'ffa:draft-context-tooltip-font-size:v1';
const DEFAULT_FONT_PX = 17;
const MIN_FONT_PX = 13;
const MAX_FONT_PX = 26;

function clampFontSize(value: number): number {
  return Math.max(MIN_FONT_PX, Math.min(MAX_FONT_PX, Math.round(value)));
}

function readFontSize(): number {
  try {
    const raw = localStorage.getItem(FONT_STORAGE_KEY);
    const parsed = raw == null ? NaN : Number(raw);
    return Number.isFinite(parsed) ? clampFontSize(parsed) : DEFAULT_FONT_PX;
  } catch {
    return DEFAULT_FONT_PX;
  }
}

function writeFontSize(value: number): void {
  try {
    localStorage.setItem(FONT_STORAGE_KEY, String(value));
  } catch {
    // Drafting must never fail because storage is unavailable/full.
  }
}

function tooltip(): HTMLDivElement | null {
  return document.getElementById(TOOLTIP_ID) as HTMLDivElement | null;
}

function applyFontSize(tip: HTMLDivElement, value: number): void {
  const next = clampFontSize(value);
  tip.style.setProperty('--draft-tooltip-font-size', `${next}px`);
  tip.dataset.fontSize = String(next);
  writeFontSize(next);
}

function makeButton(label: string, title: string, action: () => void): HTMLButtonElement {
  const button = document.createElement('button');
  button.type = 'button';
  button.className = 'draft-context-tooltip__size-button';
  button.textContent = label;
  button.title = title;
  button.setAttribute('aria-label', title);
  button.addEventListener('pointerdown', event => {
    event.preventDefault();
    event.stopPropagation();
  });
  button.addEventListener('click', event => {
    event.preventDefault();
    event.stopPropagation();
    action();
  });
  return button;
}

function ensureToolbar(tip: HTMLDivElement): void {
  if (tip.querySelector('.draft-context-tooltip__toolbar')) return;

  const toolbar = document.createElement('div');
  toolbar.className = 'draft-context-tooltip__toolbar';
  toolbar.setAttribute('aria-label', 'Context text size controls');

  const label = document.createElement('span');
  label.className = 'draft-context-tooltip__size-label';
  label.textContent = 'TEXT';

  const smaller = makeButton('A−', 'Decrease context text size', () => {
    const current = Number(tip.dataset.fontSize || readFontSize());
    applyFontSize(tip, current - 1);
  });
  const larger = makeButton('A+', 'Increase context text size', () => {
    const current = Number(tip.dataset.fontSize || readFontSize());
    applyFontSize(tip, current + 1);
  });
  const reset = makeButton('RESET', 'Reset context text size', () => {
    applyFontSize(tip, DEFAULT_FONT_PX);
  });

  toolbar.append(label, smaller, larger, reset);
  tip.prepend(toolbar);
}

function prepareTooltip(tip: HTMLDivElement): void {
  if (!tip.dataset.fontSize) applyFontSize(tip, readFontSize());
  ensureToolbar(tip);
}

/**
 * The draft context card is created/re-rendered by draftBoardEnhancements.
 * This layer makes it an actual interactive scroll surface and restores the
 * text-size toolbar after each replaceChildren() render.
 *
 * Install this BEFORE installDraftBoardEnhancements() so the capture-phase
 * pointerout guard runs first and prevents the older hover-dismiss handler
 * from closing the card while the pointer moves from a context cell into it.
 */
export function installDraftTooltipAccessibility(): () => void {
  if (typeof window === 'undefined' || typeof document === 'undefined') return () => {};

  let tipObserver: MutationObserver | null = null;
  let observedTip: HTMLDivElement | null = null;
  let toolbarQueued = false;

  const attachTip = () => {
    const tip = tooltip();
    if (!tip) return;
    if (tip !== observedTip) {
      tipObserver?.disconnect();
      observedTip = tip;
      tipObserver = new MutationObserver(() => {
        if (toolbarQueued) return;
        toolbarQueued = true;
        queueMicrotask(() => {
          toolbarQueued = false;
          const current = tooltip();
          if (current) prepareTooltip(current);
        });
      });
      tipObserver.observe(tip, { childList: true });
    }
    prepareTooltip(tip);
  };

  const rootObserver = new MutationObserver(attachTip);
  rootObserver.observe(document.body, { childList: true, subtree: true });
  queueMicrotask(attachTip);

  const onPointerOut = (event: PointerEvent) => {
    const tip = tooltip();
    if (!tip) return;
    const from = event.target instanceof Node ? event.target : null;
    const to = event.relatedTarget instanceof Node ? event.relatedTarget : null;
    if (!to) return;

    // Moving from the originating context cell into the card must not trigger
    // draftBoardEnhancements' document-level hover-dismiss listener.
    const fromContext = from instanceof Element
      ? from.closest(`[aria-describedby="${TOOLTIP_ID}"], [data-draft-context-tooltip]`)
      : null;
    if (fromContext && tip.contains(to)) {
      event.stopImmediatePropagation();
      return;
    }

    // Likewise, moving between buttons/text/scrollbar descendants inside the
    // card must not look like leaving the original hover target.
    if (from && tip.contains(from) && tip.contains(to)) {
      event.stopImmediatePropagation();
    }
  };

  // Registered before the older tooltip handler; capture + stopImmediatePropagation
  // is deliberate so the card can be entered and scrolled.
  document.addEventListener('pointerout', onPointerOut, true);

  return () => {
    rootObserver.disconnect();
    tipObserver?.disconnect();
    document.removeEventListener('pointerout', onPointerOut, true);
  };
}
