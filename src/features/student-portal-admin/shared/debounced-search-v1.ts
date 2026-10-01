import { useEffect, useState } from 'react';

/** Keep typing immediate while issuing a read only after the search settles. */
export function useDebouncedSearchV1(value: string, delayMs = 250): string {
  const normalized = value.trim();
  const [search, setSearch] = useState(normalized);
  useEffect(() => {
    if (search === normalized) return;
    const timer = setTimeout(() => setSearch(normalized), delayMs);
    return () => clearTimeout(timer);
  }, [normalized, search, delayMs]);
  return search;
}
