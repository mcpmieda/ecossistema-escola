import type { PlatformRoute, PlatformSnapshotContract } from '../../shared/platform-contract';
import { platformHref } from './routes';

export type SearchCategory = 'Área' | 'Sistema' | 'Configuração';
export type SearchIconKind = 'route' | 'system' | 'configuration';

export type PlatformSearchItem = {
  id: string;
  label: string;
  description: string;
  category: SearchCategory;
  href: string;
  searchText: string;
  iconKind: SearchIconKind;
  route?: PlatformRoute;
};

export function normalizeSearch(value: string): string {
  return value
    .normalize('NFD')
    .replace(/\p{Diacritic}/gu, '')
    .toLocaleLowerCase('pt-BR');
}

export function buildSearchItems(snapshot: PlatformSnapshotContract): PlatformSearchItem[] {
  const core = snapshot.coreModules.map((module) => ({
    id: `core:${module.id}`,
    label: module.name,
    description: module.description,
    category: 'Área' as const,
    href: platformHref(module.route),
    searchText: normalizeSearch(
      `${module.name} ${module.description} ${module.route} ${module.capabilities.join(' ')}`,
    ),
    iconKind: 'route' as const,
    route: module.route,
  }));

  const systems = snapshot.registeredModules.map((module) => ({
    id: `system:${module.id}`,
    label: module.name,
    description: `${module.integrationState === 'ready' ? 'Sistema integrado' : 'Sistema registrado'} · ${module.key}${module.version ? ` · v${module.version}` : ''}`,
    category: 'Sistema' as const,
    href: platformHref('sistemas'),
    searchText: normalizeSearch(
      `${module.name} ${module.key} ${module.version} ${module.status} ${module.integrationState} ${module.requiredCapabilities.join(' ')}`,
    ),
    iconKind: 'system' as const,
    route: 'sistemas' as const,
  }));

  const configurations = snapshot.configurations.map((configuration) => ({
    id: `config:${configuration.id}`,
    label: configuration.key,
    description: `Configuração ${configuration.scope}${configuration.version ? ` · v${configuration.version}` : ''}`,
    category: 'Configuração' as const,
    href: platformHref('configuracoes'),
    searchText: normalizeSearch(
      `${configuration.key} ${configuration.scope} ${configuration.version} ${configuration.active ? 'ativa' : 'inativa'}`,
    ),
    iconKind: 'configuration' as const,
    route: 'configuracoes' as const,
  }));

  return [...core, ...systems, ...configurations];
}

export function filterSearchItems(
  items: PlatformSearchItem[],
  query: string,
  limit = 7,
): PlatformSearchItem[] {
  const normalizedQuery = normalizeSearch(query.trim());
  const queryTerms = normalizedQuery.split(/\s+/u).filter(Boolean);
  const matches = queryTerms.length
    ? items.filter((item) => queryTerms.every((term) => item.searchText.includes(term)))
    : items;
  return matches.slice(0, Math.max(0, limit));
}
