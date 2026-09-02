import { readFileSync } from 'node:fs';
import { join } from 'node:path';
import { describe, expect, it } from 'vitest';

function source(path: string): string {
  return readFileSync(join(process.cwd(), path), 'utf8');
}

describe('Performance official charts V1', () => {
  const page = source('src/features/gradebook/performance/performance-page.tsx');
  const charts = source('src/features/gradebook/performance/performance-official-charts.tsx');
  const physicalSource = source(
    'server/gradebook/persistence/d1/performance/d1-class-performance-source-v1.ts',
  );

  it('integra poucos gráficos no read model existente sem novo bridge ou cálculo acadêmico', () => {
    expect(page).toContain("import { PerformanceOfficialCharts } from './performance-official-charts';");
    expect(page).toContain('<PerformanceOfficialCharts matrix={matrix} />');
    expect(charts).toContain('cell.projection.percentage.imported');
    expect(charts).toContain("firstCell?.lens === 'result'");
    expect(charts).toContain("firstCell.projection.source === 'term-result'");
    expect(charts).not.toContain('requestPerformanceV1');
    expect(charts).not.toContain('fetch(');
    expect(charts).not.toContain('localStorage');
    expect(charts).not.toContain('sessionStorage');
  });

  it('não cria média, ranking, taxa, agregação ou comparador acadêmico', () => {
    expect(charts).not.toContain('.reduce(');
    expect(charts).not.toContain('.sort(');
    expect(charts).not.toContain('Math.');
    expect(charts).not.toContain('toFixed(');
    expect(charts).not.toContain('.calculated');
    expect(charts).not.toContain('comparison.basis');
    expect(charts).not.toContain('tolerance');
    expect(charts).toContain('Sem média, ranking, taxa derivada ou agregação.');
  });

  it('preserva ausência, zeros, não aplicável e dados insuficientes como estados distintos', () => {
    for (const state of [
      'official-zero',
      'legacy-zero',
      'not-applicable',
      'insufficient-data',
      'absent',
    ]) {
      expect(charts).toContain(`case '${state}'`);
    }
    expect(charts).toContain('data-official-state={value.state}');
    expect(charts).toContain('Sem barra para estado oficial não numérico.');
  });

  it('é interativo e acessível sem transformar o gráfico em fonte única de informação', () => {
    expect(charts).toContain('aria-label="Gráficos oficiais"');
    expect(charts).toContain('aria-label="Visão do gráfico"');
    expect(charts).toContain('aria-pressed={mode ===');
    expect(charts).toContain('Aluno do gráfico');
    expect(charts).toContain('Componente do gráfico');
    expect(charts).toContain('aria-label={`${label}: ${valueLabel}`}');
    expect(charts).toContain('aria-hidden="true"');
    expect(charts).toContain('{valueLabel}');
  });

  it('não fabrica gráfico quando o contexto não fornece percentual oficial trimestral', () => {
    expect(charts).toContain('chartSourceIsOfficialPercentage');
    expect(charts).toContain('Este contexto não fornece percentual oficial trimestral.');
    expect(charts).toContain('Nenhum gráfico é derivado de nota,');
    expect(charts).toContain('total anual, recuperação, qualitativo ou avaliações.');
  });

  it('mantém comparação proporcional no resolvedor canônico sem criar gráfico novo', () => {
    expect(physicalSource).toContain('resolvePerformanceComparisonProjectionV2');
    expect(physicalSource).toContain("basis: 'percentage'");
    expect(physicalSource).not.toContain('tolerance');
  });
});
