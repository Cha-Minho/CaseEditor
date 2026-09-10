import { expect, test } from '@playwright/test';

test('submission and seizure keep ownership while distinguishing custody', async ({ page }) => {
  await page.goto('/tests/property-arcs.html');
  const result = JSON.parse(await page.locator('#result').innerText()) as { arcs: { party: string; role: string }[]; before: { party: string; role: string }[]; step3: { party: string; role: string }[]; step4: { party: string; role: string }[]; cartridgeStep1: { party: string; role: string }[]; cartridgeStep2: { party: string; role: string }[]; final: { party: string; role: string }[] };
  const arcs = result.arcs;
  expect(arcs).toContainEqual(expect.objectContaining({ party: 'accused', role: '소유' }));
  expect(arcs).toContainEqual(expect.objectContaining({ party: 'police', role: '압수' }));
  expect(arcs).not.toContainEqual(expect.objectContaining({ party: 'victim', role: '소유' }));
  expect(arcs.some(arc => (arc as { thing?: string }).thing === 'warrant')).toBe(false);
  expect(result.before).toHaveLength(0);
  expect(result.step3.filter(arc => (arc as { thing?: string }).thing === 'phone' && arc.role === '점유')).toEqual([expect.objectContaining({ party: 'police' })]);
  expect(result.step4.filter(arc => (arc as { thing?: string }).thing === 'phone' && arc.role === '압수')).toEqual([expect.objectContaining({ party: 'police' })]);
  expect(result.cartridgeStep1).toEqual([expect.objectContaining({ party: 'accused', role: '점유' })]);
  expect(result.cartridgeStep2).toEqual([expect.objectContaining({ party: 'victim', role: '점유' })]);
  expect(result.final).toEqual(expect.arrayContaining([
    expect.objectContaining({ party: 'accused', role: '소유' }),
    expect.objectContaining({ party: 'police', role: '압수' }),
    expect.objectContaining({ party: 'victim', role: '점유' })
  ]));
  expect(result.final).toHaveLength(3);
});
