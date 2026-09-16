import { useEffect } from 'react';
const EVENT = 'ecossistema-before-navigation';
/** A pending edit must not be destroyed by the surrounding tabs or links. */
export function allowDraftNavigationV1(): boolean {
  return window.dispatchEvent(new Event(EVENT, { cancelable: true }));
}
export function useDraftNavigationGuardV1(blocked: boolean): void {
  useEffect(() => {
    if (!blocked) return;
    const prevent = (event: Event) => event.preventDefault();
    const unload = (event: BeforeUnloadEvent) => {
      event.preventDefault();
      event.returnValue = '';
    };
    const link = (event: MouseEvent) => {
      const anchor =
        event.target instanceof Element ? event.target.closest<HTMLAnchorElement>('a[href]') : null;
      if (
        anchor &&
        anchor.href !== window.location.href &&
        !event.ctrlKey &&
        !event.metaKey &&
        anchor.target !== '_blank'
      ) {
        event.preventDefault();
      }
    };
    window.addEventListener(EVENT, prevent);
    window.addEventListener('beforeunload', unload);
    document.addEventListener('click', link, true);
    return () => {
      window.removeEventListener(EVENT, prevent);
      window.removeEventListener('beforeunload', unload);
      document.removeEventListener('click', link, true);
    };
  }, [blocked]);
}
