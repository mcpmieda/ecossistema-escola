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

/** What opens over the page: dialogs and confirmations, modal layers, popovers and menus.
 * A list or a menu that is simply part of the page is not one of them. */
const LAYERS_V1 =
  '[role="dialog"], [role="alertdialog"], [aria-modal="true"], [role="menu"], [data-slot$="popover"]';
/** Whether any layer other than the drawer itself is really open. The drawer is told apart
 * element by element, so it never hides another layer that comes after it in the page. */
function otherLayerOpenV1(drawer: HTMLElement | null): boolean {
  return [...document.querySelectorAll<HTMLElement>(LAYERS_V1)].some(
    (layer) =>
      layer !== drawer &&
      !drawer?.contains(layer) &&
      !layer.contains(drawer) &&
      !layer.closest('[inert]') &&
      (typeof layer.checkVisibility !== 'function' || layer.checkVisibility()),
  );
}

/** The page enlarged by a pinch: a sideways drag then moves the enlarged view, not the drawer. */
const viewV1 = () => ({
  zoomed: (window.visualViewport?.scale ?? 1) > 1.01,
  left: window.visualViewport?.offsetLeft ?? 0,
});

/**
 * On phones, a swipe to the right opens the side drawer and a swipe to the left closes it.
 * Vertical scrolling, sideways-sliding content, text fields, any other open layer and a page
 * enlarged by zoom are left alone; the buttons keep working in every case.
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
      zoomed: boolean;
      left: number;
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
            ...viewV1(),
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
      // Zoomed when the finger landed or lifted, or the enlarged view moved in between.
      const view = viewV1();
      if (from.zoomed || view.zoomed || Math.abs(view.left - from.left) > 1) return;
      // Another layer is open over the page (a confirmation, a student's drawer, a menu): the
      // drawer neither opens nor closes under it.
      if (otherLayerOpenV1(drawer.current)) return;
      if (open) {
        if (dx < 0 && !from.slidesLeft) setOpen(false);
        return;
      }
      if (dx > 0 && !from.slidesRight) setOpen(true);
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
