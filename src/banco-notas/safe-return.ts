export function resolveSafeReturnHref(rawReturn: string, fallbackPath: string): string {
  if (rawReturn.startsWith('/') && !rawReturn.startsWith('//') && !rawReturn.startsWith('/\\')) {
    return rawReturn;
  }

  if (rawReturn.startsWith('//') || rawReturn.startsWith('/\\')) return fallbackPath;
  return `${fallbackPath}${rawReturn ? `?${rawReturn}` : ''}`;
}
