import { expect, test } from '@playwright/test';

test('submission changes possession without changing the named owner', async ({ page }) => {
  await page.goto('/tests/property-arcs.html');
  const result = JSON.parse(await page.locator('#result').innerText()) as { arcs: { party: string; role: string }[]; final: { party: string; role: string }[] };
  const arcs = result.arcs;
  expect(arcs).toContainEqual(expect.objectContaining({ party: 'accused', role: '소유' }));
  expect(arcs).toContainEqual(expect.objectContaining({ party: 'police', role: '점유' }));
  expect(arcs).not.toContainEqual(expect.objectContaining({ party: 'victim', role: '소유' }));
  expect(arcs.some(arc => (arc as { thing?: string }).thing === 'warrant')).toBe(false);
  expect(result.final).toEqual(expect.arrayContaining([
    expect.objectContaining({ party: 'accused', role: '소유' }),
    expect.objectContaining({ party: 'police', role: '점유' })
  ]));
  expect(result.final).toHaveLength(2);
});
