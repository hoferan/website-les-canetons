import axe from "axe-core";
import { expect } from "vitest";

/**
 * Fails when axe finds a structural accessibility problem in `container`:
 * names, roles, label associations, ARIA validity (ADR 0047).
 *
 * jsdom has no layout and no painted colours, so the contrast rule is off here.
 * Contrast is checked against a real browser: the Playwright axe sweep
 * (web/e2e/a11y.spec.ts) and the Storybook a11y panel.
 */
export async function expectNoA11yViolations(container: Element) {
  const result = await axe.run(container, {
    rules: { "color-contrast": { enabled: false } },
  });
  const report = result.violations.map(
    (violation) => `${violation.id}: ${violation.help} (${violation.nodes.length})`,
  );
  expect(report).toEqual([]);
}
