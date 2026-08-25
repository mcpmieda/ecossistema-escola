import { Button, Chip, Drawer, Kbd, SearchField, useOverlayState } from '@heroui/react';
import { useEffect, useMemo, useRef, useState } from 'react';
import { Boxes, Search, Settings2, Sparkles } from 'lucide-react';
import type { PlatformSnapshotContract } from '../../shared/platform-contract';
import { AmbientConstellation } from './ambient';
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
      <div className="relative overflow-hidden px-5 py-8 text-center text-xs leading-5 text-muted-foreground">
        <AmbientConstellation intensity="soft" />
        <div className="relative z-10">
          <Sparkles className="mx-auto mb-3 size-4 text-accent" />
          Pesquise áreas, sistemas registrados e configurações disponíveis no seu acesso.
        </div>
      </div>
    );
  }

  if (items.length === 0) {
    return (
      <div className="px-5 py-8 text-center text-sm text-muted-foreground">
        Nenhum resultado encontrado.
      </div>
    );
  }

  return (
    <div className="max-h-80 overflow-y-auto p-2">
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
            className="group flex items-start gap-3 rounded-xl px-3 py-3 text-foreground no-underline transition-all duration-200 hover:bg-accent/7 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-accent/40"
          >
            <div className="hero-glass--quiet mt-0.5 grid size-9 shrink-0 place-items-center rounded-xl">
              <Icon className="size-3.5 text-accent" />
            </div>
            <div className="min-w-0 flex-1">
              <div className="flex flex-wrap items-center gap-2">
                <span className="truncate text-sm font-semibold tracking-[-0.015em]">{item.label}</span>
                <Chip variant="soft" size="sm" className="text-[0.62rem]">
                  {item.category}
                </Chip>
              </div>
              <p className="mt-1 line-clamp-2 text-xs leading-5 text-muted-foreground">
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
  const desktopInputRef = useRef<HTMLInputElement>(null);
  const mobileSearch = useOverlayState();

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
    mobileSearch.close();
  };

  return (
    <>
      <div
        className="relative hidden w-full max-w-lg md:block"
        role="search"
        onBlur={(event) => {
          if (!event.currentTarget.contains(event.relatedTarget as Node | null)) {
            setDesktopOpen(false);
          }
        }}
      >
        <SearchField
          value={query}
          onChange={(value) => {
            setQuery(value);
            setDesktopOpen(true);
          }}
          variant="secondary"
          fullWidth
          isDisabled={!snapshot}
        >
          <SearchField.Group className="h-10 rounded-xl">
            <SearchField.SearchIcon />
            <SearchField.Input
              ref={desktopInputRef}
              onFocus={() => setDesktopOpen(true)}
              aria-label="Buscar no Centro"
              aria-expanded={desktopOpen}
              placeholder="Buscar no Centro"
              className="pr-16"
            />
            <SearchField.ClearButton />
          </SearchField.Group>
        </SearchField>
        <Kbd className="pointer-events-none absolute right-9 top-1/2 -translate-y-1/2 text-[0.62rem]">
          Ctrl K
        </Kbd>
        {desktopOpen && snapshot && (
          <div className="hero-search-panel absolute left-0 right-0 top-[calc(100%+0.55rem)] z-50 overflow-hidden rounded-2xl">
            <SearchResults items={results} query={query} onSelect={selectResult} />
          </div>
        )}
      </div>

      <Drawer state={mobileSearch}>
        <Button
          variant="outline"
          isIconOnly
          className="md:hidden"
          aria-label="Buscar no Centro"
          isDisabled={!snapshot}
        >
          <Search className="size-4" />
        </Button>
        <Drawer.Backdrop variant="blur">
          <Drawer.Content placement="right">
            <Drawer.Dialog className="hero-search-panel h-full w-[min(94vw,430px)] overflow-hidden rounded-l-[1.8rem] border-l border-border p-0">
              <Drawer.CloseTrigger />
              <Drawer.Header className="relative overflow-hidden border-b border-border/70 p-6 pr-14">
                <AmbientConstellation intensity="soft" />
                <div className="relative z-10">
                  <div className="hero-kicker">Command</div>
                  <Drawer.Heading className="mt-2 text-2xl font-semibold tracking-[-0.04em]">
                    Buscar no Centro
                  </Drawer.Heading>
                  <p className="mt-2 text-xs leading-5 text-muted-foreground">
                    Resultados limitados aos dados disponíveis para seu acesso.
                  </p>
                </div>
              </Drawer.Header>
              <Drawer.Body className="p-4">
                <SearchField
                  value={query}
                  onChange={setQuery}
                  variant="secondary"
                  fullWidth
                  autoFocus
                >
                  <SearchField.Group className="h-11 rounded-xl">
                    <SearchField.SearchIcon />
                    <SearchField.Input
                      aria-label="Buscar áreas, sistemas e configurações"
                      placeholder="Digite para buscar"
                    />
                    <SearchField.ClearButton />
                  </SearchField.Group>
                </SearchField>
                <div className="hero-data-island mt-3 overflow-hidden rounded-2xl">
                  <SearchResults items={results} query={query} onSelect={selectResult} />
                </div>
              </Drawer.Body>
            </Drawer.Dialog>
          </Drawer.Content>
        </Drawer.Backdrop>
      </Drawer>
    </>
  );
}
