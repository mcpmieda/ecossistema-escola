export type RouteLoadFailureV1 = 'module-load' | 'render';

/** Classify known browser module errors without copying messages, URLs or student data into logs. */
export function routeLoadFailureV1(error: unknown): RouteLoadFailureV1 {
  if (!(error instanceof Error)) return 'render';
  return /Failed to fetch dynamically imported module|Importing a module script failed|error loading dynamically imported module|Failed to load module script|Unable to preload CSS/iu.test(error.message)
    ? 'module-load'
    : 'render';
}
