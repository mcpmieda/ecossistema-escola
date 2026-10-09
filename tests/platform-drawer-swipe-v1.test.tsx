import { cleanup, renderHook } from '@testing-library/react';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { useDrawerSwipeV1 } from '../src/platform/drawer-swipe-v1';

const touch = (type: string, target: Element, x: number, y: number) => {
  const event = new Event(type, { bubbles: true });
  const point = { clientX: x, clientY: y };
  Object.assign(event, { touches: type === 'touchend' ? [] : [point], changedTouches: [point] });
  target.dispatchEvent(event);
};
const swipe = (target: Element, from: [number, number], to: [number, number]) => {
  touch('touchstart', target, ...from);
  touch('touchend', target, ...to);
};
let phone = true;
const setOpen = vi.fn();
const mount = (open: boolean, drawer: HTMLElement | null = null) =>
  renderHook(() => useDrawerSwipeV1(open, setOpen, { current: drawer }));

beforeEach(() => {
  phone = true;
  setOpen.mockClear();
  vi.stubGlobal('matchMedia', (query: string) => ({ matches: phone, media: query }));
  document.body.innerHTML = '<main><p id="text">texto</p><input id="field" /></main>';
});
afterEach(() => { cleanup(); vi.unstubAllGlobals(); document.body.innerHTML = ''; });

describe('phone drawer swipe', () => {
  it('opens on a swipe to the right and closes on a swipe to the left', () => {
    const text = document.getElementById('text')!;
    mount(false);
    swipe(text, [20, 300], [140, 310]);
    expect(setOpen).toHaveBeenLastCalledWith(true);
    cleanup();
    setOpen.mockClear();
    mount(true);
    swipe(text, [200, 300], [80, 305]);
    expect(setOpen).toHaveBeenLastCalledWith(false);
  });

  it('ignores short, slanted, vertical and slow movements, and swipes the wrong way', () => {
    const text = document.getElementById('text')!;
    mount(false);
    swipe(text, [20, 300], [60, 300]); // short
    swipe(text, [20, 300], [120, 380]); // slanted
    swipe(text, [20, 100], [30, 400]); // vertical scroll
    swipe(text, [200, 300], [60, 300]); // to the left while closed
    expect(setOpen).not.toHaveBeenCalled();
    vi.useFakeTimers();
    touch('touchstart', text, 20, 300);
    vi.advanceTimersByTime(900);
    touch('touchend', text, 160, 300);
    vi.useRealTimers();
    expect(setOpen).not.toHaveBeenCalled();
  });

  it('leaves the swipe to content that can still slide that way, read when the finger lands', () => {
    const scroller = document.createElement('div');
    scroller.style.overflowX = 'auto';
    scroller.innerHTML = '<span id="cell">nota</span>';
    document.body.appendChild(scroller);
    Object.defineProperties(scroller, {
      scrollWidth: { value: 900, configurable: true },
      clientWidth: { value: 300, configurable: true },
    });
    const cell = document.getElementById('cell')!;
    mount(false);
    // Slid to the right: a finger moving right pulls the table back, so the drawer stays shut,
    // even though the table is at its start by the time the finger lifts.
    scroller.scrollLeft = 200;
    touch('touchstart', cell, 20, 300);
    scroller.scrollLeft = 0;
    touch('touchend', cell, 160, 300);
    expect(setOpen).not.toHaveBeenCalled();
    // At its start there is nothing to pull back: the swipe opens the drawer.
    swipe(cell, [20, 300], [160, 300]);
    expect(setOpen).toHaveBeenLastCalledWith(true);
  });

  it('does nothing on a text field, under another open layer, or on a computer', () => {
    mount(false);
    swipe(document.getElementById('field')!, [20, 300], [160, 300]);
    expect(setOpen).not.toHaveBeenCalled();
    const layer = document.createElement('div');
    layer.setAttribute('role', 'dialog');
    document.body.appendChild(layer);
    swipe(document.getElementById('text')!, [20, 300], [160, 300]);
    expect(setOpen).not.toHaveBeenCalled();
    layer.remove();
    phone = false;
    swipe(document.getElementById('text')!, [20, 300], [160, 300]);
    expect(setOpen).not.toHaveBeenCalled();
  });

  it('does not treat the drawer itself as another layer', () => {
    const drawer = document.createElement('aside');
    drawer.setAttribute('role', 'dialog');
    document.body.appendChild(drawer);
    mount(true, drawer);
    swipe(drawer, [200, 300], [60, 300]);
    expect(setOpen).toHaveBeenLastCalledWith(false);
  });
});
