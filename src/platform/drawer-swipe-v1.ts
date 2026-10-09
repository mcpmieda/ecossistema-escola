import { useEffect } from 'react';

/** The drawer only exists up to this width (styles.css). */
const PHONE_V1 = '(max-width: 900px)';
const MIN_DISTANCE_V1 = 56;
const MAX_DURATION_V1 = 700;

/** An ancestor that is being, or can still be, slid sideways in the direction of the swipe:
 * a table, a row of tabs, a carousel. The swipe belongs to it, not to the drawer. */
function slidesSidewaysV1(target: EventTarget | null, toTheRight: boolean): boolean {
  for (
    let node = target instanceof Element ? target : null;
    node && node !== document.body;
    node = node.parentElement
  ) {
    if (node.scrollWidth <= node.clientWidth + 1) continue;
    const overflow = getComputedStyle(node).overflowX;
    if (overflow !== 'auto' && overflow !== 'scroll') continue;
    // A finger moving right pulls the content back toward its start.
    if (toTheRight ? node.scrollLeft > 0 : node.scrollLeft + node.clientWidth < node.scrollWidth - 1)
      return true;
  }
  return false;
}

/** Controls that use a sideways drag themselves, and other layers open over the page. */
const ownsTheDragV1 = (target: EventTarget | null) =>
  target instanceof Element &&
  target.closest('input, textarea, select, [contenteditable="true"], [role="slider"]') !== null;

/**
 * On phones, a swipe to the right opens the side drawer and a swipe to the left closes it.
 * Vertical scrolling, sideways-sliding content, text fields and other open dialogs are left alone.
 */
export function useDrawerSwipeV1(
  open: boolean,
  setOpen: (open: boolean) => void,
  drawer: { readonly current: HTMLElement | null },
) {
  useEffect(() => {
    // Whether the content under the finger could slide is read when the finger lands: by the
    // time it lifts, a table pulled back to its start would look like it could not.
    let start: {
      x: number;
      y: number;
      at: number;
      target: EventTarget | null;
      slidesRight: boolean;
      slidesLeft: boolean;
    } | null = null;
    const onStart = (event: TouchEvent) => {
      const touch = event.touches.length === 1 ? event.touches[0] : undefined;
      start = touch
        ? {
            x: touch.clientX,
            y: touch.clientY,
            at: Date.now(),
            target: event.target,
            slidesRight: slidesSidewaysV1(event.target, true),
            slidesLeft: slidesSidewaysV1(event.target, false),
          }
        : null;
    };
    const onEnd = (event: TouchEvent) => {
      const from = start;
      start = null;
      const touch = event.changedTouches[0];
      if (!from || !touch) return;
      if (typeof window.matchMedia !== 'function' || !window.matchMedia(PHONE_V1).matches) return;
      const dx = touch.clientX - from.x;
      const dy = touch.clientY - from.y;
      if (Date.now() - from.at > MAX_DURATION_V1) return;
      // Clearly sideways: long enough and at least twice as wide as it is tall.
      if (Math.abs(dx) < MIN_DISTANCE_V1 || Math.abs(dx) < Math.abs(dy) * 2) return;
      if (ownsTheDragV1(from.target)) return;
      if (open) {
        if (dx < 0 && !from.slidesLeft) setOpen(false);
        return;
      }
      if (dx <= 0) return;
      // Another layer is open over the page (a student's drawer, a menu): it keeps its gestures.
      const layer = document.querySelector('[role="dialog"], [role="menu"], [role="listbox"]');
      if (layer && layer !== drawer.current) return;
      if (from.slidesRight) return;
      setOpen(true);
    };
    const onCancel = () => {
      start = null;
    };
    window.addEventListener('touchstart', onStart, { passive: true });
    window.addEventListener('touchend', onEnd, { passive: true });
    window.addEventListener('touchcancel', onCancel, { passive: true });
    return () => {
      window.removeEventListener('touchstart', onStart);
      window.removeEventListener('touchend', onEnd);
      window.removeEventListener('touchcancel', onCancel);
    };
  }, [open, setOpen, drawer]);
}
