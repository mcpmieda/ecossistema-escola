import { AlertDialog, Button } from '@heroui/react';

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
            <AlertDialog.Heading>Descartar alterações não salvas?</AlertDialog.Heading>
          </AlertDialog.Header>
          <AlertDialog.Body>
            <p>O que já foi salvo não será desfeito.</p>
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
