// @vitest-environment node
import { readFileSync } from 'node:fs';
import { expect, it } from 'vitest';
const css = (path: string) => readFileSync(path, 'utf8');
it('prevents Card.Content defaults from turning horizontal filter widths into hundreds of pixels of row height', () => {
  const accounts = css('src/features/student-portal-admin/accounts/student-accounts-v1.css');
  expect(accounts).toMatch(
    /\.pa-account-filters\.card__content\s*\{[^}]*display:\s*grid;[^}]*grid-template-columns:/s,
  );
  expect(accounts).toMatch(/\.pa-account-filters\.card__content\s*>\s*\*\s*\{[^}]*flex:\s*none/s);
  const operations = css('src/features/student-portal-admin/overview/student-operations-v1.css');
  expect(operations).toMatch(/\.pa-operations-filters\s*\{[^}]*flex-direction:\s*row/s);
});
it('sizes desktop navigation and dashboard from the real content area rather than the full viewport', () => {
  const admin = css('src/features/student-portal-admin/shared/admin-page-v1.css');
  const operations = css('src/features/student-portal-admin/overview/student-operations-v1.css');
  expect(admin).toContain('container-type: inline-size');
  expect(admin).toMatch(/\.pa-admin-page\s*>\s*\.tabs\s*>\s*\.tabs__list-container[^{]*\{[^}]*width:\s*fit-content/s);
  expect(admin).toMatch(/\.school-class-tabs\s*>\s*\.tabs__list-container[^{]*\{[^}]*width:\s*fit-content/s);
  expect(admin).toMatch(/\.tabs__tab[^{]*\{[^}]*flex:\s*0\s+0\s+auto/s);
  expect(operations).toContain('@container (min-width: 1280px)');
  expect(operations).not.toContain('@media (min-width: 1500px)');
});
it('keeps animation budgets short and honors reduced motion without removing native components', () => {
  const styles = css('src/styles.css');
  expect(styles).toContain('--drawer-enter-duration: 120ms');
  expect(styles).toContain('--drawer-exit-duration: 100ms');
  expect(styles).toMatch(/@media\s*\(prefers-reduced-motion:\s*reduce\)/);
  expect(styles).toContain('--drawer-enter-duration: 0ms');
});
