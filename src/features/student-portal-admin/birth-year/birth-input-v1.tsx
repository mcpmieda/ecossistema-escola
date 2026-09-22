import { useId } from 'react';
import { Input, Label, TextField } from '@heroui/react';
import type { BirthEditorV1 } from './birth-editor-v1';
import { birthDirtyV1, validBirthYearV1, type BirthDraftRowV1 } from './birth-values-v1';

export function birthVisualStateV1(row: BirthDraftRowV1) {
  if (row.status === 'saving') return { saved: false, label: 'Salvando…' };
  if (row.status === 'error' || row.status === 'conflict')
    return { saved: false, label: 'Não salvo' };
  if (row.status === 'refresh-error')
    return { saved: false, label: 'Aguardando confirmação do salvamento' };
  if (!row.year) return { saved: false, label: 'Nascimento não cadastrado' };
  if (!validBirthYearV1(row.year)) return { saved: false, label: 'Ano inválido ou incompleto' };
  if (birthDirtyV1(row)) return { saved: false, label: 'Alteração ainda não salva' };
  return row.confirmation === 'confirmed'
    ? { saved: true, label: 'Salvo' }
    : { saved: false, label: 'Confirme o ano' };
}
export function BirthInputV1({
  row,
  editor,
  disabled,
}: {
  row: BirthDraftRowV1;
  editor: BirthEditorV1;
  disabled: boolean;
}) {
  const status = birthVisualStateV1(row),
    statusId = useId();
  const id = row.record.account.accountId,
    name = row.record.account.name || 'Aluno sem nome';
  return (
    <TextField
      value={row.year}
      onChange={(value) => editor.edit(id, value)}
      isDisabled={disabled}
      isInvalid={row.year.length > 0 && !validBirthYearV1(row.year)}
    >
      <Label className="sr-only">Ano de nascimento de {name}</Label>
      <Input
        className={
          'pa-birth-year-input ' +
          (status.saved ? 'pa-birth-input--saved' : 'pa-birth-input--pending')
        }
        aria-describedby={statusId}
        inputMode="numeric"
        maxLength={4}
        placeholder="AAAA"
        onBlur={() => {
          if (birthDirtyV1(row)) void editor.flush(id);
        }}
        onKeyDown={(event) => {
          if (event.key === 'Enter') {
            event.preventDefault();
            void editor.flush(id);
          } else if (event.key === 'Escape') {
            event.preventDefault();
            editor.restore(id);
          }
        }}
      />
      <span id={statusId} className="sr-only" aria-live="polite">
        {status.label}
      </span>
    </TextField>
  );
}
