/** A stale response is not a fresh confirmation. Only transient read failures use this notice;
 * authorization failures are handled by the owning reader and clear protected content.
 */
export function LiveReadNoticeV1({ failed }: { failed?: boolean }) {
  return failed ? <p role="status" className="text-xs text-muted">Sincronização temporariamente indisponível. Exibindo a última consulta enquanto reconecta.</p> : null;
}
