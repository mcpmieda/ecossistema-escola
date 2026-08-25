import { useEffect, useMemo, useState } from 'react';
import {
  Button,
  Chip,
  Description,
  Drawer,
  Kbd,
  Label,
  ListBox,
  Popover,
  SearchField,
  Surface,
} from '@heroui/react';
import { Boxes, Search, Settings2 } from 'lucide-react';
import type { PlatformSnapshotContract } from '../../shared/platform-contract';
import { buildSearchItems, filterSearchItems, type PlatformSearchItem } from './search-model';
import { routeIcons } from './routes';

function SearchResults({ items, query }: { items: PlatformSearchItem[]; query: string }) {
  if (!query.trim()) {
    return (
      <Surface variant="transparent" className="px-5 py-8 text-center">
        <Search className="mx-auto size-5 text-muted" />
        <p className="mt-3 text-sm font-medium">Busca transversal</p>
        <p className="mt-1 text-xs leading-5 text-muted">
          Pesquise áreas, sistemas registrados e configurações disponíveis no seu acesso.
        </p>
      </Surface>
    );
  }

  if (items.length === 0) {
    return (
      <Surface variant="transparent" className="px-5 py-8 text-center">
        <p className="text-sm font-medium">Nenhum resultado encontrado</p>
        <p className="mt-1 text-xs text-muted">Tente outro termo de busca.</p>
      </Surface>
    );
  }

  return (
    <ListBox
      aria-label="Resultados da busca"
      selectionMode="none"
      className="platform-search-results"
    >
      {items.map((item) => {
        const Icon =
          item.iconKind === 'system'
            ? Boxes
            : item.iconKind === 'configuration'
              ? Settings2
              : routeIcons[item.route ?? 'visao-geral'];
        return (
          <ListBox.Item
            id={item.id}
            key={item.id}
            href={item.href}
            textValue={item.label}
            className="platform-search-results__item"
          >
            <Surface
              variant="secondary"
              className="grid size-9 shrink-0 place-items-center rounded-xl"
            >
              <Icon className="size-4 text-muted" />
            </Surface>
            <div className="min-w-0 flex-1">
              <div className="flex min-w-0 items-center gap-2">
                <Label className="truncate">{item.label}</Label>
                <Chip variant="soft" size="sm" className="shrink-0">
                  {item.category}
                </Chip>
              </div>
              <Description className="mt-0.5 line-clamp-2">{item.description}</Description>
            </div>
          </ListBox.Item>
        );
      })}
    </ListBox>
  );
}

function DesktopSearch({
  snapshot,
  query,
  setQuery,
  results,
  open,
  setOpen,
}: {
  snapshot: PlatformSnapshotContract | null;
  query: string;
  setQuery: (value: string) => void;
  results: PlatformSearchItem[];
  open: boolean;
  setOpen: (value: boolean) => void;
}) {
  return (
    <div className="hidden w-full max-w-md md:block">
      <Popover
        isOpen={open && Boolean(snapshot)}
        onOpenChange={(value) => setOpen(value && Boolean(snapshot))}
      >
        <Popover.Trigger>
          <Button
            variant="outline"
            size="md"
            fullWidth
            className="platform-search-trigger justify-start"
            isDisabled={!snapshot}
            aria-label="Buscar no Centro"
          >
            <Search className="size-4 shrink-0 text-muted" />
            <span className="min-w-0 flex-1 truncate text-left text-muted">Buscar no Centro</span>
            <Kbd variant="light" className="shrink-0">
              <Kbd.Abbr keyValue="ctrl" />
              <Kbd.Content>K</Kbd.Content>
            </Kbd>
          </Button>
        </Popover.Trigger>
        <Popover.Content placement="bottom" offset={8} className="w-[min(28rem,calc(100vw-2rem))]">
          <Popover.Dialog className="p-2">
            <SearchField
              aria-label="Buscar áreas, sistemas e configurações"
              variant="secondary"
              fullWidth
              value={query}
              onChange={setQuery}
              onClear={() => setQuery('')}
              autoFocus
            >
              <SearchField.Group>
                <SearchField.SearchIcon />
                <SearchField.Input placeholder="Digite para buscar" />
                <SearchField.ClearButton />
              </SearchField.Group>
            </SearchField>
            <div className="mt-2">
              <SearchResults items={results} query={query} />
            </div>
          </Popover.Dialog>
        </Popover.Content>
      </Popover>
    </div>
  );
}

export function PlatformSearch({ snapshot }: { snapshot: PlatformSnapshotContract | null }) {
  const [query, setQuery] = useState('');
  const [desktopOpen, setDesktopOpen] = useState(false);
  const [mobileOpen, setMobileOpen] = useState(false);

  const items = useMemo(() => (snapshot ? buildSearchItems(snapshot) : []), [snapshot]);
  const results = useMemo(() => filterSearchItems(items, query), [items, query]);

  useEffect(() => {
    const closeAfterNavigation = () => {
      setQuery('');
      setDesktopOpen(false);
      setMobileOpen(false);
    };
    window.addEventListener('hashchange', closeAfterNavigation);
    return () => window.removeEventListener('hashchange', closeAfterNavigation);
  }, []);

  useEffect(() => {
    const onKeyDown = (event: KeyboardEvent) => {
      if ((event.metaKey || event.ctrlKey) && event.key.toLowerCase() === 'k') {
        event.preventDefault();
        setDesktopOpen(Boolean(snapshot));
      }
      if (event.key === 'Escape') setDesktopOpen(false);
    };
    window.addEventListener('keydown', onKeyDown);
    return () => window.removeEventListener('keydown', onKeyDown);
  }, [snapshot]);

  return (
    <>
      <DesktopSearch
        snapshot={snapshot}
        query={query}
        setQuery={setQuery}
        results={results}
        open={desktopOpen}
        setOpen={setDesktopOpen}
      />

      <Drawer>
        <Button
          variant="outline"
          size="md"
          isIconOnly
          className="md:hidden"
          aria-label="Buscar no Centro"
          isDisabled={!snapshot}
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
                <Description className="mt-1">
                  Resultados limitados aos dados disponíveis para seu acesso.
                </Description>
              </Drawer.Header>
              <Drawer.Body>
                <SearchField
                  aria-label="Buscar áreas, sistemas e configurações"
                  variant="secondary"
                  fullWidth
                  value={query}
                  onChange={setQuery}
                  onClear={() => setQuery('')}
                  autoFocus
                >
                  <SearchField.Group>
                    <SearchField.SearchIcon />
                    <SearchField.Input placeholder="Digite para buscar" />
                    <SearchField.ClearButton />
                  </SearchField.Group>
                </SearchField>
                <Surface variant="secondary" className="mt-4 overflow-hidden rounded-3xl p-1">
                  <SearchResults items={results} query={query} />
                </Surface>
              </Drawer.Body>
            </Drawer.Dialog>
          </Drawer.Content>
        </Drawer.Backdrop>
      </Drawer>
    </>
  );
}
