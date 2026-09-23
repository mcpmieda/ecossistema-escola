import { useEffect, useRef, useState } from 'react';
import { Button, Modal } from '@heroui/react';
import { RefreshCw } from 'lucide-react';
import type { PortalAdminReadClientV2 } from '../student-portal-admin/accounts/accounts-client-v2';
import { readPhotoCatalogV1, announcePhotoChangeV1 } from './catalog-client-v1';
import { PhotoAdminClientErrorV1 } from './admin-client-v1';

/** One explicit, cancellable adoption of existing photos; never rewrites SharePoint originals. */
export function PhotoLibrarySyncV1({ reader }: Readonly<{ reader: PortalAdminReadClientV2 }>) {
  const [confirm, setConfirm] = useState(false);
  const [running, setRunning] = useState(false);
  const [message, setMessage] = useState('');
  const active = useRef<AbortController | null>(null);
  useEffect(() => () => active.current?.abort(), []);
  async function synchronize() {
    if (active.current) return;
    const controller = new AbortController(); active.current = controller;
    const signal = controller.signal;
    setConfirm(false); setRunning(true); setMessage('Consultando as fotos cadastradas…');
    let processed = 0, published = 0, missing = 0, pending = 0;
    try {
      let cursor: string | undefined;
      const visited = new Set<string>();
      const accounts = new Set<string>();
      do {
        const page = await reader.query({ contractVersion: 2, operation: 'accounts-read',
          scope: { kind: 'school', academicYear: 2026 }, page: { limit: 100, ...(cursor ? { cursor } : {}) } }, signal);
        signal.throwIfAborted();
        if (page.state !== 'accounts-read') throw new Error('photo-library-page-invalid');
        for (const item of page.items) {
          if (accounts.has(item.accountId)) continue;
          accounts.add(item.accountId);
          const subject = { source: 'portal' as const, academicYear: 2026, accountIds: [item.accountId] };
          try {
            const result = await readPhotoCatalogV1(subject, signal, true);
            signal.throwIfAborted();
            if (result.catalog.pendingRequest) pending++;
            else if (result.catalog.portalReady) published++;
            else if (!result.catalog.hasPortrait) missing++;
            else pending++;
            announcePhotoChangeV1(subject, result.catalog);
          } catch (error) {
            signal.throwIfAborted();
            if (error instanceof PhotoAdminClientErrorV1 && ['unauthenticated', 'forbidden'].includes(error.code)) throw error;
            pending++;
          }
          processed++;
          setMessage(`${processed} alunos conferidos · ${published} fotos disponíveis · ${missing} sem foto · ${pending} pendências`);
        }
        cursor = page.nextCursor ?? undefined;
        if (cursor && visited.has(cursor)) throw new Error('photo-library-cursor-repeated');
        if (cursor) visited.add(cursor);
      } while (cursor);
      setMessage(`Sincronização concluída: ${published} fotos disponíveis; ${missing} alunos sem foto; ${pending} pendências. Os originais do SharePoint foram preservados.`);
    } catch {
      if (!signal.aborted) setMessage(`Sincronização interrompida após ${processed} alunos. As fotos já confirmadas foram preservadas. Verifique a sessão e tente novamente.`);
    } finally {
      if (active.current === controller) active.current = null;
      if (!signal.aborted) setRunning(false);
    }
  }
  function stop() {
    active.current?.abort(); active.current = null; setRunning(false);
    setMessage('Sincronização interrompida. As fotos já confirmadas foram preservadas; uma nova execução pode continuar o trabalho.');
  }
  return <div className="student-photo-library-sync">
    <Button size="sm" variant="secondary" isDisabled={running} onPress={() => setConfirm(true)}>
      <RefreshCw size={15} aria-hidden="true" /> Sincronizar fotos existentes
    </Button>
    {running ? <Button size="sm" variant="tertiary" onPress={stop}>Interromper</Button> : null}
    {message ? <p role="status">{message}</p> : null}
    {confirm ? <Modal.Backdrop isOpen onOpenChange={setConfirm}>
      <Modal.Container size="sm"><Modal.Dialog aria-label="Sincronizar fotos da escola">
        <Modal.Header><Modal.Heading>Sincronizar fotos existentes</Modal.Heading></Modal.Header>
        <Modal.Body><p>Conferir as fotos de toda a escola e disponibilizar a cópia privada no Portal de cada aluno. Os arquivos originais não serão recortados, renomeados ou substituídos.</p></Modal.Body>
        <Modal.Footer><Button variant="secondary" onPress={() => setConfirm(false)}>Cancelar</Button>
          <Button onPress={() => void synchronize()}>Sincronizar</Button></Modal.Footer>
      </Modal.Dialog></Modal.Container>
    </Modal.Backdrop> : null}
  </div>;
}
