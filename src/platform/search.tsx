import { useEffect, useMemo, useRef, useState } from 'react';
import { Boxes, Search, Settings2 } from 'lucide-react';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import {
  Sheet,
  SheetContent,
  SheetDescription,
  SheetHeader,
  SheetTitle,
  SheetTrigger,
} from '@/components/ui/sheet';
import type { PlatformSnapshotContract } from '../../shared/platform-contract';
import { platformHref, routeIcons } from './routes';

type SearchItem = {
  id: string;
  label: string;
  description: string;
  category: 'Área' | 'Sistema' | 'Configuração';
  href: string;
  searchText: string;
  icon: typeof Search;
};

function normalizeSearch(value: string): string {
  return value
    .normalize('NFD')
    .replace(/\p{Diacritic}/gu, '')
    .toLocaleLowerCase('pt-BR');
}

function buildSearchItems(snapshot: PlatformSnapshotContract): SearchItem[] {
  const core = snapshot.coreModules.map((module) => ({
    id: `core:${module.id}`,
    label: module.name,
    description: module.description,
    category: 'Área' as const,
    href: platformHref(module.route),
    searchText: `${module.name} ${module.description} ${module.route} ${module.capabilities.join(' ')}`,
    icon: routeIcons[module.route],
  }));

  const systems = snapshot.registeredModules.map((module) => ({
    id: `system:${module.id}`,
    label: module.name,
    description: `Sistema registrado · ${module.key}${module.version ? ` · v${module.version}` : ''}`,
    category: 'Sistema' as const,
    href: platformHref('sistemas'),
    searchText: `${module.name} ${module.key} ${module.version} ${module.status} ${module.roles.join(' ')}`,
    icon: Boxes,
  }));

  const configurations = snapshot.configurations.map((configuration) => ({
    id: `config:${configuration.id}`,
    label: configuration.key,
    description: `Configuração ${configuration.scope}${configuration.version ? ` · v${configuration.version}` : ''}`,
    category: 'Configuração' as const,
    href: platformHref('configuracoes'),
    searchText: `${configuration.key} ${configuration.scope} ${configuration.version} ${configuration.active ? 'ativa' : 'inativa'}`,
    icon: Settings2,
  }));

  return [...core, ...systems, ...configurations];
}

function SearchResults({
  items,
  query,
  onSelect,
}: {
  items: SearchItem[];
  query: string;
  onSelect: () => void;
}) {
  if (!query.trim()) {
    return (
      <div className="px-4 py-6 text-center text-xs leading-5 text-muted-foreground">
        Pesquise áreas, sistemas registrados e configurações disponíveis no seu acesso.
      </div>
    );
  }

  if (items.length === 0) {
    return (
      <div className="px-4 py-6 text-center text-sm text-muted-foreground">
        Nenhum resultado encontrado.
      </div>
    );
  }

  return (
    <div className="max-h-80 overflow-y-auto p-1.5">
      {items.map((item) => {
        const Icon = item.icon;
        return (
          <a
            key={item.id}
            href={item.href}
            onClick={onSelect}
            className="group flex items-start gap-3 rounded-lg px-3 py-2.5 transition-colors hover:bg-muted focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring/40"
          >
            <div className="mt-0.5 grid size-8 shrink-0 place-items-center rounded-lg border bg-background">
              <Icon className="size-3.5 text-muted-foreground group-hover:text-foreground" />
            </div>
            <div className="min-w-0 flex-1">
              <div className="flex flex-wrap items-center gap-2">
                <span className="truncate text-sm font-medium">{item.label}</span>
                <Badge variant="secondary" className="h-5 px-1.5 text-[0.65rem]">
                  {item.category}
                </Badge>
              </div>
              <p className="mt-0.5 line-clamp-2 text-xs leading-5 text-muted-foreground">
                {item.description}
              </p>
            </div>
          </a>
        );
      })}
    </div>
  );
}

export function PlatformSearch({ snapshot }: { snapshot: PlatformSnapshotContract | null }) {
  const [query, setQuery] = useState('');
  const [desktopOpen, setDesktopOpen] = useState(false);
  const [mobileOpen, setMobileOpen] = useState(false);
  const desktopInputRef = useRef<HTMLInputElement>(null);

  const items = useMemo(() => (snapshot ? buildSearchItems(snapshot) : []), [snapshot]);
  const results = useMemo(() => {
    const normalizedQuery = normalizeSearch(query.trim());
    if (!normalizedQuery) return items.slice(0, 7);
    return items
      .filter((item) => normalizeSearch(item.searchText).includes(normalizedQuery))
      .slice(0, 7);
  }, [items, query]);

  useEffect(() => {
    const onKeyDown = (event: KeyboardEvent) => {
      if ((event.metaKey || event.ctrlKey) && event.key.toLocaleLowerCase('pt-BR') === 'k') {
        event.preventDefault();
        desktopInputRef.current?.focus();
        setDesktopOpen(true);
      }
      if (event.key === 'Escape') setDesktopOpen(false);
    };
    window.addEventListener('keydown', onKeyDown);
    return () => window.removeEventListener('keydown', onKeyDown);
  }, []);

  const selectResult = () => {
    setQuery('');
    setDesktopOpen(false);
    setMobileOpen(false);
  };

  return (
    <>
      <div
        className="relative hidden w-full max-w-md md:block"
        role="search"
        onBlur={(event) => {
          if (!event.currentTarget.contains(event.relatedTarget as Node | null)) {
            setDesktopOpen(false);
          }
        }}
      >
        <Search className="pointer-events-none absolute left-3 top-1/2 z-10 size-4 -translate-y-1/2 text-muted-foreground" />
        <Input
          ref={desktopInputRef}
          value={query}
          onChange={(event) => {
            setQuery(event.target.value);
            setDesktopOpen(true);
          }}
          onFocus={() => setDesktopOpen(true)}
          aria-label="Buscar no Centro"
          aria-expanded={desktopOpen}
          placeholder="Buscar no Centro"
          className="bg-muted/35 pl-9 pr-14"
          disabled={!snapshot}
        />
        <kbd className="pointer-events-none absolute right-2 top-1/2 -translate-y-1/2 rounded border bg-background px-1.5 py-0.5 font-sans text-[0.65rem] text-muted-foreground shadow-xs">
          Ctrl K
        </kbd>
        {desktopOpen && snapshot && (
          <div className="absolute left-0 right-0 top-[calc(100%+0.5rem)] z-50 overflow-hidden rounded-xl border bg-popover text-popover-foreground shadow-xl">
            <SearchResults items={results} query={query} onSelect={selectResult} />
          </div>
        )}
      </div>

      <Sheet open={mobileOpen} onOpenChange={setMobileOpen}>
        <SheetTrigger asChild>
          <Button
            variant="outline"
            size="icon"
            className="md:hidden"
            aria-label="Buscar no Centro"
            disabled={!snapshot}
          >
            <Search />
          </Button>
        </SheetTrigger>
        <SheetContent side="right" className="w-[min(92vw,420px)] p-0 sm:max-w-[420px]">
          <SheetHeader className="border-b p-5 pr-14">
            <SheetTitle>Buscar no Centro</SheetTitle>
            <SheetDescription>
              Resultados limitados aos dados já disponíveis para seu acesso.
            </SheetDescription>
          </SheetHeader>
          <div className="p-4" role="search">
            <div className="relative">
              <Search className="pointer-events-none absolute left-3 top-1/2 size-4 -translate-y-1/2 text-muted-foreground" />
              <Input
                value={query}
                onChange={(event) => setQuery(event.target.value)}
                autoFocus
                aria-label="Buscar áreas, sistemas e configurações"
                placeholder="Digite para buscar"
                className="pl-9"
              />
            </div>
            <div className="mt-3 overflow-hidden rounded-xl border">
              <SearchResults items={results} query={query} onSelect={selectResult} />
            </div>
          </div>
        </SheetContent>
      </Sheet>
    </>
  );
}
