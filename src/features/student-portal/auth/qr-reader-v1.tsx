import { useEffect, useRef, useState } from 'react';
import { Button } from '@heroui/react/button';
import {
  createCameraLeaseV1,
  decodeQrFrameV1,
  readQrImageV1,
  type QrFrameDecoderV1,
} from './qr-media-v1';
import { QrInputErrorV1, selectStudentQrV1 } from './qr-input-v1';

const qrMessage = (error: unknown) => {
  if (error instanceof QrInputErrorV1)
    return {
      invalid: 'Este QR não é um acesso válido ao Portal.',
      absent: 'Nenhum QR encontrado. Escolha uma imagem mais nítida.',
      multiple: 'Há mais de um QR. Enquadre ou recorte somente o seu.',
      large: 'A imagem é muito grande. Use até 10 MB e 16 megapixels.',
      unsupported: 'Escolha uma imagem PNG, JPEG ou WebP válida.',
      unavailable: 'Não foi possível ler o QR. Tente outra imagem.',
    }[error.reason];
  if (error instanceof DOMException && error.name === 'NotAllowedError')
    return 'A câmera não foi autorizada. Você pode escolher uma imagem do QR.';
  if (error instanceof DOMException && error.name === 'NotFoundError')
    return 'Nenhuma câmera disponível. Escolha uma imagem do QR.';
  return 'Não foi possível usar a câmera. Tente novamente ou escolha uma imagem.';
};

export function StudentQrReaderV1({
  onQr,
  decode = decodeQrFrameV1,
}: {
  onQr: (qr: string) => void;
  decode?: QrFrameDecoderV1;
}) {
  const video = useRef<HTMLVideoElement>(null),
    input = useRef<HTMLInputElement>(null);
  const lease = useRef<ReturnType<typeof createCameraLeaseV1> | null>(null);
  const operation = useRef<AbortController | null>(null);
  const onRead = useRef(onQr);
  onRead.current = onQr;
  const [state, setState] = useState<'idle' | 'opening' | 'camera' | 'image'>('idle');
  const [facing, setFacing] = useState<'environment' | 'user'>('environment');
  const [message, setMessage] = useState<string>();
  const stop = () => {
    operation.current?.abort();
    operation.current = null;
    lease.current?.stop();
    if (video.current) video.current.srcObject = null;
  };
  useEffect(() => {
    const leave = () => {
      stop();
      setState('idle');
    };
    const hidden = () => {
      if (document.visibilityState === 'hidden') {
        stop();
        setState('idle');
      }
    };
    document.addEventListener('visibilitychange', hidden);
    window.addEventListener('pagehide', leave);
    return () => {
      stop();
      document.removeEventListener('visibilitychange', hidden);
      window.removeEventListener('pagehide', leave);
    };
  }, []);
  const camera = async (direction: 'environment' | 'user') => {
    stop();
    setMessage(undefined);
    setState('opening');
    setFacing(direction);
    const controller = new AbortController();
    operation.current = controller;
    try {
      if (!navigator.mediaDevices?.getUserMedia)
        throw new DOMException('Unavailable', 'NotFoundError');
      lease.current ??= createCameraLeaseV1(navigator.mediaDevices);
      const stream = await lease.current.open(direction);
      if (!stream || controller.signal.aborted) return;
      const player = video.current!;
      player.srcObject = stream;
      await player.play();
      controller.signal.throwIfAborted();
      setState('camera');
      const canvas = document.createElement('canvas');
      const context = canvas.getContext('2d', { willReadFrequently: true });
      if (!context) throw new QrInputErrorV1('unavailable');
      while (!controller.signal.aborted) {
        if (player.videoWidth && player.videoHeight) {
          const scale = Math.min(1, 960 / Math.max(player.videoWidth, player.videoHeight));
          canvas.width = Math.max(1, Math.round(player.videoWidth * scale));
          canvas.height = Math.max(1, Math.round(player.videoHeight * scale));
          context.drawImage(player, 0, 0, canvas.width, canvas.height);
          const codes = await decode(
            context.getImageData(0, 0, canvas.width, canvas.height),
            controller.signal,
          );
          controller.signal.throwIfAborted();
          if (codes.length) {
            try {
              const qr = selectStudentQrV1(codes);
              stop();
              setState('idle');
              onRead.current(qr);
              return;
            } catch (error) {
              setMessage(qrMessage(error));
            }
          }
        }
        await new Promise<void>((resolve) => {
          const done = () => {
            clearTimeout(timer);
            controller.signal.removeEventListener('abort', done);
            resolve();
          };
          const timer = setTimeout(done, 300);
          controller.signal.addEventListener('abort', done, { once: true });
        });
      }
    } catch (error) {
      if (!controller.signal.aborted) {
        stop();
        setState('idle');
        setMessage(qrMessage(error));
      }
    }
  };
  const image = async (file: File) => {
    stop();
    setState('image');
    setMessage(undefined);
    const controller = new AbortController();
    operation.current = controller;
    try {
      const qr = await readQrImageV1(file, controller.signal, decode);
      if (!controller.signal.aborted) {
        stop();
        setState('idle');
        onRead.current(qr);
      }
    } catch (error) {
      if (!controller.signal.aborted) {
        stop();
        setState('idle');
        setMessage(qrMessage(error));
      }
    }
  };
  return (
    <div className="pa-qr-reader">
      <p>Aponte a câmera para o QR de acesso ou escolha uma imagem.</p>
      <video
        ref={video}
        muted
        playsInline
        aria-label="Câmera para ler o QR"
        className="pa-qr-video"
        hidden={state !== 'camera' && state !== 'opening'}
      />
      {message ? <p role="alert">{message}</p> : null}
      {state === 'opening' || state === 'image' ? (
        <p role="status">{state === 'image' ? 'Lendo imagem…' : 'Abrindo câmera…'}</p>
      ) : null}
      <div className="pa-auth-actions">
        {state === 'idle' ? (
          <Button
            onPress={() => {
              void camera('environment');
            }}
          >
            Ler QR com câmera
          </Button>
        ) : null}
        {state === 'camera' ? (
          <Button
            variant="secondary"
            onPress={() => {
              void camera(facing === 'environment' ? 'user' : 'environment');
            }}
          >
            Trocar câmera
          </Button>
        ) : null}
        {state !== 'idle' ? (
          <Button
            variant="tertiary"
            onPress={() => {
              stop();
              setState('idle');
            }}
          >
            Cancelar leitura
          </Button>
        ) : null}
        <Button
          variant="secondary"
          onPress={() => {
            stop();
            setState('idle');
            input.current?.click();
          }}
          isDisabled={state === 'image'}
        >
          Escolher imagem
        </Button>
        <input
          ref={input}
          className="pa-qr-file"
          type="file"
          accept="image/png,image/jpeg,image/webp"
          aria-label="Imagem do QR"
          onChange={(event) => {
            const file = event.target.files?.[0];
            event.target.value = '';
            if (file) void image(file);
          }}
        />
      </div>
    </div>
  );
}
