import { expect, test } from '@playwright/test';

test('submission changes possession without changing the named owner', async ({ page }) => {
  await page.goto('/tests/property-arcs.html');
  const arcs = JSON.parse(await page.locator('#result').innerText()) as { party: string; role: string }[];
  expect(arcs).toContainEqual(expect.objectContaining({ party: 'accused', role: '소유' }));
  expect(arcs).toContainEqual(expect.objectContaining({ party: 'police', role: '점유' }));
  expect(arcs).not.toContainEqual(expect.objectContaining({ party: 'victim', role: '소유' }));
});
