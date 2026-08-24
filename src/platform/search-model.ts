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
    searchText: `${module.name} ${module.description} ${module.route} ${module.capabilities.join(' ')}`,
    iconKind: 'route' as const,
    route: module.route,
  }));

  const systems = snapshot.registeredModules.map((module) => ({
    id: `system:${module.id}`,
    label: module.name,
    description: `Sistema registrado · ${module.key}${module.version ? ` · v${module.version}` : ''}`,
    category: 'Sistema' as const,
    href: platformHref('sistemas'),
    searchText: `${module.name} ${module.key} ${module.version} ${module.status} ${module.roles.join(' ')}`,
    iconKind: 'system' as const,
  }));

  const configurations = snapshot.configurations.map((configuration) => ({
    id: `config:${configuration.id}`,
    label: configuration.key,
    description: `Configuração ${configuration.scope}${configuration.version ? ` · v${configuration.version}` : ''}`,
    category: 'Configuração' as const,
    href: platformHref('configuracoes'),
    searchText: `${configuration.key} ${configuration.scope} ${configuration.version} ${configuration.active ? 'ativa' : 'inativa'}`,
    iconKind: 'configuration' as const,
  }));

  return [...core, ...systems, ...configurations];
}

export function filterSearchItems(
  items: PlatformSearchItem[],
  query: string,
  limit = 7,
): PlatformSearchItem[] {
  const normalizedQuery = normalizeSearch(query.trim());
  const matches = normalizedQuery
    ? items.filter((item) => normalizeSearch(item.searchText).includes(normalizedQuery))
    : items;
  return matches.slice(0, Math.max(0, limit));
}
