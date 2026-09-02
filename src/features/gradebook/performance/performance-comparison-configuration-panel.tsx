import { Alert } from '@heroui/react';
import type { PerformanceComparisonConfigurationV1 } from '../../../../shared/gradebook-contracts/performance/performance-comparison-contract-v2';

export function PerformanceComparisonConfigurationPanel({
  configuration,
}: {
  readonly configuration: PerformanceComparisonConfigurationV1;
}) {
  const managed = configuration.source === 'platform-configuration';
  return (
    <Alert status={configuration.enabled ? 'default' : 'warning'}>
      <Alert.Indicator />
      <Alert.Content>
        <Alert.Title>
          Comparação proporcional {configuration.enabled ? 'habilitada' : 'desativada'}
        </Alert.Title>
        <Alert.Description>
          {configuration.enabled
            ? 'A configuração institucional permite comparar os percentuais oficiais dos períodos selecionados.'
            : 'A instituição desativou a comparação. Resultados e histórico acadêmicos não foram alterados.'}{' '}
          {managed
            ? `Estado recebido do servidor · versão ${configuration.version}.`
            : 'Default institucional habilitado, fornecido pelo servidor.'}{' '}
          A edição ficará disponível quando o controle administrativo estiver autorizado em
          Configurações.
        </Alert.Description>
      </Alert.Content>
    </Alert>
  );
}
