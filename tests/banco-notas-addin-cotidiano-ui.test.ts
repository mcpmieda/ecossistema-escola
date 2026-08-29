import { readFileSync } from 'node:fs';
import { join } from 'node:path';
import { createElement } from 'react';
import { renderToStaticMarkup } from 'react-dom/server';
import { describe, expect, it, vi } from 'vitest';
import { TaskpaneView, type TaskpaneScreen } from '../addin/banco-notas/taskpane-view';

const root = process.cwd();

function authenticated(): TaskpaneScreen {
  return {
    phase: 'authenticated',
    analyzedAt: '29/08/2026, 00:10',
    context: {
      schemaVersion: 1,
      teacher: { label: 'Professor Sintético' },
      schoolYear: { label: 'Ano 2026' },
      assignment: { classGroupLabel: '2º Ano A', componentLabel: 'Matemática' },
      model: { version: 3, mappingVersion: 2, state: 'connected' },
      syncEnabled: false,
      lastActivityAt: null,
      preflight: {
        status: 'warning',
        checks: {
          structureValid: true,
          modelRecognized: true,
          teacherAuthorized: true,
          workbookCompatible: true,
        },
        reasons: ['sync_disabled_by_administration'],
      },
      pending: [
        {
          severity: 'info',
          code: 'sync_disabled_by_administration',
          message:
            'Sincronização indisponível pela administração enquanto o piloto não está ativo.',
        },
      ],
      mappings: [],
    },
    changes: {
      changedFields: 1,
      affectedStudents: 1,
      unknownBaselineFields: 0,
      changes: [
        {
          studentLabel: 'Estudante Sintético 01',
          field: 'NotaT1',
          before: 7,
          beforeAbsent: false,
          after: 8.5,
          afterAbsent: false,
        },
      ],
    },
  };
}

describe('Banco de Notas cotidiano add-in taskpane UI', () => {
  it('renders authenticated context, preflight, changes and sync-off without a write action', () => {
    const html = renderToStaticMarkup(
      createElement(TaskpaneView, {
        screen: authenticated(),
        onConnect: vi.fn(),
        onAnalyze: vi.fn(),
      }),
    );
    expect(html).toContain('Professor Sintético');
    expect(html).toContain('2º Ano A');
    expect(html).toContain('Matemática');
    expect(html).toContain('Estrutura válida');
    expect(html).toContain('Professor autorizado');
    expect(html).toContain('Estudante Sintético 01');
    expect(html).toContain('7');
    expect(html).toContain('8,5');
    expect(html).toContain('Sincronização desligada pela administração');
    expect(html).toContain('Analisar novamente');
    expect(html).not.toContain('Sincronizar agora');
  });

  it('renders loading, auth, ownership, workbook, missing-model, offline and generic failure states', () => {
    const screens: TaskpaneScreen[] = [
      { phase: 'loading', message: 'Inicializando' },
      {
        phase: 'auth',
        officeLabel: 'Excel / OfficeOnline',
        accountDetected: true,
        naaSupported: true,
        message: 'Conecte sua conta',
      },
      { phase: 'failure', kind: 'ownership-denied', message: 'Ownership negado' },
      { phase: 'failure', kind: 'workbook-invalid', message: 'Workbook inválido' },
      { phase: 'failure', kind: 'model-missing', message: 'Modelo ausente' },
      { phase: 'failure', kind: 'offline', message: 'Sem rede' },
      { phase: 'failure', kind: 'error', message: 'Falha de API' },
    ];
    const html = screens
      .map((screen) =>
        renderToStaticMarkup(
          createElement(TaskpaneView, { screen, onConnect: vi.fn(), onAnalyze: vi.fn() }),
        ),
      )
      .join('\n');
    for (const expected of [
      'Inicializando',
      'Conectar ao Banco',
      'Acesso ao modelo negado',
      'Workbook incompatível',
      'Modelo não reconhecido',
      'Sem conexão',
      'Não foi possível carregar',
    ]) {
      expect(html).toContain(expected);
    }
  });

  it('uses HeroUI composition and keeps token, claims, OID and tenant IDs out of rendered diagnostics', () => {
    const view = readFileSync(join(root, 'addin/banco-notas/taskpane-view.tsx'), 'utf8');
    const runtime = readFileSync(join(root, 'addin/banco-notas/taskpane.tsx'), 'utf8');
    expect(view).toContain("from '@heroui/react'");
    expect(view).toContain('<Card>');
    expect(view).toContain('<Alert');
    expect(view).toContain('<Chip');
    expect(runtime).toContain('claimsIncluded: false');
    expect(runtime).toContain('tenantIdIncluded: false');
    expect(runtime).toContain('oidIncluded: false');
    expect(view).not.toContain('diagnostic');
    expect(view).not.toContain('accessToken');
  });
});
