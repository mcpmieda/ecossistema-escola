import { useEffect, useMemo, useRef, useState } from 'react';
import { Drawer } from '@heroui/react';
import { Boxes, Search, Settings2 } from 'lucide-react';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import type { PlatformSnapshotContract } from '../../shared/platform-contract';
import { buildSearchItems, filterSearchItems, type PlatformSearchItem } from './search-model';
import { routeIcons } from './routes';

function SearchResults({
  items,
  query,
  onSelect,
}: {
  items: PlatformSearchItem[];
  query: string;
  onSelect: () => void;
}) {
  if (!query.trim()) {
    return (
      <div className="px-4 py-6 text-center text-xs leading-5 text-muted">
        Pesquise áreas, sistemas registrados e configurações disponíveis no seu acesso.
      </div>
    );
  }

  if (items.length === 0) {
    return <div className="px-4 py-6 text-center text-sm text-muted">Nenhum resultado encontrado.</div>;
  }

  return (
    <div className="max-h-80 overflow-y-auto p-1.5">
      {items.map((item) => {
        const Icon =
          item.iconKind === 'system'
            ? Boxes
            : item.iconKind === 'configuration'
              ? Settings2
              : routeIcons[item.route ?? 'visao-geral'];
        return (
          <a
            key={item.id}
            href={item.href}
            onClick={onSelect}
            className="group flex items-start gap-3 rounded-2xl px-3 py-2.5 transition-[background-color,transform] hover:bg-surface-secondary focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-accent/35 active:translate-y-px motion-reduce:transform-none"
          >
            <div className="mt-0.5 grid size-8 shrink-0 place-items-center rounded-xl border border-border bg-surface">
              <Icon className="size-3.5 text-muted transition-colors group-hover:text-foreground" />
            </div>
            <div className="min-w-0 flex-1">
              <div className="flex flex-wrap items-center gap-2">
                <span className="truncate text-sm font-medium">{item.label}</span>
                <Badge variant="secondary" className="h-5 px-1.5 text-[0.65rem]">
                  {item.category}
                </Badge>
              </div>
              <p className="mt-0.5 line-clamp-2 text-xs leading-5 text-muted">{item.description}</p>
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
  const results = useMemo(() => filterSearchItems(items, query), [items, query]);

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
        <Search className="pointer-events-none absolute left-3 top-1/2 z-10 size-4 -translate-y-1/2 text-muted" />
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
          className="pl-9 pr-14"
          disabled={!snapshot}
        />
        <kbd className="pointer-events-none absolute right-2 top-1/2 -translate-y-1/2 rounded-lg border border-border bg-surface px-1.5 py-0.5 font-sans text-[0.65rem] text-muted shadow-sm">
          Ctrl K
        </kbd>
        {desktopOpen && snapshot && (
          <div className="absolute left-0 right-0 top-[calc(100%+0.5rem)] z-50 overflow-hidden rounded-3xl border border-border bg-overlay text-foreground shadow-overlay">
            <SearchResults items={results} query={query} onSelect={selectResult} />
          </div>
        )}
      </div>

      <Drawer>
        <Button
          variant="outline"
          size="icon"
          className="md:hidden"
          aria-label="Buscar no Centro"
          disabled={!snapshot}
          onPress={() => setMobileOpen(true)}
        >
          <Search />
        </Button>
        <Drawer.Backdrop variant="blur" isOpen={mobileOpen} onOpenChange={setMobileOpen}>
          <Drawer.Content placement="right" className="max-w-[440px]">
            <Drawer.Dialog aria-label="Buscar no Centro">
              <Drawer.CloseTrigger />
              <Drawer.Header>
                <Drawer.Heading>Buscar no Centro</Drawer.Heading>
                <p className="mt-1 text-sm leading-6 text-muted">
                  Resultados limitados aos dados já disponíveis para seu acesso.
                </p>
              </Drawer.Header>
              <Drawer.Body>
                <div role="search">
                  <div className="relative">
                    <Search className="pointer-events-none absolute left-3 top-1/2 z-10 size-4 -translate-y-1/2 text-muted" />
                    <Input
                      value={query}
                      onChange={(event) => setQuery(event.target.value)}
                      autoFocus
                      aria-label="Buscar áreas, sistemas e configurações"
                      placeholder="Digite para buscar"
                      className="pl-9"
                    />
                  </div>
                  <div className="mt-3 overflow-hidden rounded-3xl border border-border bg-surface">
                    <SearchResults items={results} query={query} onSelect={selectResult} />
                  </div>
                </div>
              </Drawer.Body>
            </Drawer.Dialog>
          </Drawer.Content>
        </Drawer.Backdrop>
      </Drawer>
    </>
  );
}
