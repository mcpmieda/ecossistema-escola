import { useEffect, useMemo, useRef, useState } from 'react';
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
      onAction={(key) => {
        const item = items.find((candidate) => candidate.id === String(key));
        if (!item) return;
        window.location.assign(item.href);
        onSelect();
      }}
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
      <div className="hidden w-full max-w-md md:block">
        <Popover
          isOpen={desktopOpen && Boolean(snapshot)}
          onOpenChange={(open) => setDesktopOpen(open && Boolean(snapshot))}
        >
          <Popover.Trigger>
            <div className="relative">
              <SearchField
                aria-label="Buscar no Centro"
                variant="secondary"
                fullWidth
                value={query}
                onChange={(value) => {
                  setQuery(value);
                  setDesktopOpen(true);
                }}
                onClear={() => setQuery('')}
                isDisabled={!snapshot}
              >
                <SearchField.Group>
                  <SearchField.SearchIcon />
                  <SearchField.Input
                    ref={desktopInputRef}
                    placeholder="Buscar no Centro"
                    onFocus={() => setDesktopOpen(true)}
                  />
                  <SearchField.ClearButton />
                </SearchField.Group>
              </SearchField>
              <Kbd
                variant="light"
                className="pointer-events-none absolute right-10 top-1/2 -translate-y-1/2"
              >
                <Kbd.Abbr keyValue="ctrl" />
                <Kbd.Content>K</Kbd.Content>
              </Kbd>
            </div>
          </Popover.Trigger>
          <Popover.Content
            placement="bottom"
            offset={8}
            className="w-[min(28rem,calc(100vw-2rem))]"
          >
            <Popover.Dialog className="p-1.5">
              <SearchResults items={results} query={query} onSelect={selectResult} />
            </Popover.Dialog>
          </Popover.Content>
        </Popover>
      </div>

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
                  <SearchResults items={results} query={query} onSelect={selectResult} />
                </Surface>
              </Drawer.Body>
            </Drawer.Dialog>
          </Drawer.Content>
        </Drawer.Backdrop>
      </Drawer>
    </>
  );
}
