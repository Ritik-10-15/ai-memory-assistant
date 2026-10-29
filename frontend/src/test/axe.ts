import axe from "axe-core";

/**
 * Run axe-core on a rendered container. Color contrast can't be computed in
 * jsdom (no layout), so it is checked in Playwright and by the palette audit.
 */
export async function axeViolations(container: Element) {
  const results = await axe.run(container, {
    rules: { "color-contrast": { enabled: false }, region: { enabled: false } },
  });
  return results.violations.map((v) => `${v.id}: ${v.help} (${v.nodes.length})`);
}
