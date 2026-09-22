import { useCallback, useEffect, useRef, useState } from 'react';
import { Alert, Button, Modal } from '@heroui/react';
import type { AccountQrResultV1 } from '../accounts/account-mutation-v1';
import { copyQrImageV1, createQrDownloadsV1 } from '../credentials/qr-browser-v1';
import { validatePrintCardsV1, type QrArtifactV1 } from '../credentials/qr-values-v1';

/** A committed account action hands its QR directly to the local renderer, never to React state. */
export function useAccountQrHandoffV1() {
  const artifact = useRef<QrArtifactV1 | null>(null);
  const downloads = useRef(createQrDownloadsV1());
  const generation = useRef(0);
  const [opened, setOpened] = useState(false);
  const [notice, setNotice] = useState('');
  const clear = useCallback(() => {
    generation.current++;
    artifact.current = null;
    downloads.current.clear();
    setOpened(false);
    setNotice('');
  }, []);
  useEffect(() => clear, [clear]);
  const accept = useCallback(
    async (result: AccountQrResultV1, signal: AbortSignal) => {
      clear();
      const current = generation.current;
      const cards = validatePrintCardsV1(result.cards);
      if (cards.length !== 1) throw new Error('Single account QR required');
      const renderer = await import('../credentials/qr-artifacts-v1');
      signal.throwIfAborted();
      const rendered = await renderer.renderQrPngV1(cards[0]!.qr, signal);
      signal.throwIfAborted();
      if (current !== generation.current) throw new DOMException('Discarded', 'AbortError');
      artifact.current = rendered;
      setOpened(true);
    },
    [clear],
  );
  const dialog = (
    <Modal.Backdrop
      isOpen={opened}
      onOpenChange={(open) => {
        if (!open) clear();
      }}
    >
      <Modal.Container>
        <Modal.Dialog aria-label="Novo QR disponível" className="pa-qr-handoff">
          <Modal.Header>
            <Modal.Heading>Novo QR disponível</Modal.Heading>
          </Modal.Header>
          <Modal.Body>
            <p>A ação foi confirmada. Copie ou baixe a imagem do novo cartão.</p>
            {notice && (
              <Alert>
                <Alert.Content>
                  <Alert.Description>{notice}</Alert.Description>
                </Alert.Content>
              </Alert>
            )}
          </Modal.Body>
          <Modal.Footer>
            <Button variant="secondary" onPress={clear}>
              Fechar
            </Button>
            <Button
              onPress={() => {
                const value = artifact.current,
                  current = generation.current;
                if (value)
                  void copyQrImageV1(value).then((result) => {
                    if (generation.current === current)
                      setNotice(
                        result === 'copied'
                          ? 'Imagem copiada.'
                          : 'Use Baixar imagem neste navegador.',
                      );
                  });
              }}
            >
              Copiar imagem
            </Button>
            <Button
              onPress={() => {
                if (artifact.current) {
                  try {
                    downloads.current.download(artifact.current);
                  } catch {
                    setNotice('Não foi possível baixar. Tente novamente.');
                  }
                }
              }}
            >
              Baixar imagem
            </Button>
          </Modal.Footer>
        </Modal.Dialog>
      </Modal.Container>
    </Modal.Backdrop>
  );
  return { accept, clear, dialog };
}
