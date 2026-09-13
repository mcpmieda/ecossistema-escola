import { useState } from 'react';
import { AlertDialog, Button } from '@heroui/react';
import { SettingsCheckboxV1 } from '../settings/settings-editors-v1';
import type { BirthReviewV1 } from './birth-editor-v1';
import type { BirthDraftRowV1 } from './birth-values-v1';

export function BirthReviewDialogV1({
  review,
  rows,
  scopeLabel,
  onCancel,
  onConfirm,
}: {
  review: BirthReviewV1;
  rows: BirthDraftRowV1[];
  scopeLabel: string;
  onCancel: () => void;
  onConfirm: () => void;
}) {
  const [acknowledged, setAcknowledged] = useState(false);
  const provenance = review.kind === 'provenance';
  const clearing = review.kind === 'clear' || review.kind === 'batch-clear';
  const items =
    review.kind === 'provenance'
      ? [
          {
            accountId: review.accountId,
            action: 'set' as const,
            year: review.year,
            confirmation: 'confirmed' as const,
          },
        ]
      : review.kind === 'clear'
        ? [review.command.item]
        : review.command.items;
  const names = new Map(rows.map((row) => [row.record.account.accountId, row.record.account.name]));
  const title = provenance
    ? 'Confirmar procedência do ano'
    : clearing
      ? 'Limpar ano de nascimento'
      : 'Salvar anos selecionados';
  return (
    <AlertDialog.Backdrop
      isOpen
      isDismissable={false}
      isKeyboardDismissDisabled={false}
      onOpenChange={(open) => {
        if (!open) onCancel();
      }}
    >
      <AlertDialog.Container>
        <AlertDialog.Dialog className="pa-birth-dialog">
          <AlertDialog.Header>
            <AlertDialog.Heading>{title}</AlertDialog.Heading>
          </AlertDialog.Header>
          <AlertDialog.Body>
            <p>
              {scopeLabel} · 2026 · {items.length} conta(s)
            </p>
            <p>
              {provenance
                ? 'Confirme somente após conferir o ano em uma fonte institucional legítima. Um valor fictício de teste não pode ser declarado verdadeiro.'
                : clearing
                  ? 'Remove somente o ano e desabilita os fluxos que dependem do PIN. A senha cotidiana, as sessões, o QR, a conta e os dados acadêmicos são preservados.'
                  : 'Cada conta recebe o seu próprio ano e a procedência indicada abaixo. O lote avança por resultados confirmados; pode ser pausado e retomado.'}
            </p>
            {!provenance && !clearing && (
              <p>
                Valores não confirmados continuam marcados como teste e não permitem ativação por
                PIN.
              </p>
            )}
            <ul className="pa-birth-review-items">
              {items.map((item) => (
                <li key={item.accountId}>
                  <strong>{names.get(item.accountId) || 'Conta sem nome'}</strong>
                  {' · '}
                  {item.action === 'clear'
                    ? 'Limpar ano'
                    : `${item.year} · ${item.confirmation === 'confirmed' ? 'Conferido' : 'Não confirmado (teste)'}`}
                </li>
              ))}
            </ul>
            <SettingsCheckboxV1
              selected={acknowledged}
              onChange={setAcknowledged}
              label={
                provenance
                  ? 'Conferi este ano em uma fonte institucional legítima.'
                  : 'Conferi as contas, os valores e o efeito desta ação.'
              }
            />
          </AlertDialog.Body>
          <AlertDialog.Footer>
            <Button autoFocus variant="secondary" onPress={onCancel}>
              Cancelar
            </Button>
            <Button
              variant={clearing ? 'danger' : 'primary'}
              isDisabled={!acknowledged}
              onPress={onConfirm}
            >
              {provenance
                ? 'Confirmar procedência'
                : clearing
                  ? `Limpar ${items.length} ano(s)`
                  : `Salvar ${items.length} ano(s)`}
            </Button>
          </AlertDialog.Footer>
        </AlertDialog.Dialog>
      </AlertDialog.Container>
    </AlertDialog.Backdrop>
  );
}

export function BirthDiscardDialogV1({
  onCancel,
  onConfirm,
}: {
  onCancel: () => void;
  onConfirm: () => void;
}) {
  return (
    <AlertDialog.Backdrop
      isOpen
      isDismissable={false}
      isKeyboardDismissDisabled={false}
      onOpenChange={(open) => {
        if (!open) onCancel();
      }}
    >
      <AlertDialog.Container>
        <AlertDialog.Dialog className="pa-birth-dialog">
          <AlertDialog.Header>
            <AlertDialog.Heading>Descartar rascunhos e consultar novamente?</AlertDialog.Heading>
          </AlertDialog.Header>
          <AlertDialog.Body>
            <p>
              Os rascunhos e as retomadas desta tela serão descartados. Isso não desfaz alterações
              já recebidas pelo servidor. A próxima consulta mostrará os valores atuais para
              revisão.
            </p>
          </AlertDialog.Body>
          <AlertDialog.Footer>
            <Button autoFocus variant="secondary" onPress={onCancel}>
              Continuar aqui
            </Button>
            <Button variant="danger" onPress={onConfirm}>
              Descartar e continuar
            </Button>
          </AlertDialog.Footer>
        </AlertDialog.Dialog>
      </AlertDialog.Container>
    </AlertDialog.Backdrop>
  );
}
