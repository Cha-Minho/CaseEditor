import { test, expect } from '@playwright/test';

test('desktop navigation toggles to 500px without losing search or editor state', async ({ page }) => {
  await page.setViewportSize({ width: 1440, height: 960 });
  await page.goto('/tests/sidebar-layout.html');
  const editor = page.locator('.editor-pane');
  const closedWidth = (await editor.boundingBox())!.width;
  expect(closedWidth).toBe(1440);
  expect((await editor.boundingBox())!.x).toBe(0);
  await expect(page.locator('.sidebar-rail')).toHaveCount(0);
  const toggleBox = (await page.locator('.sidebar-toggle').boundingBox())!;
  expect(toggleBox.x).toBe(16);
  expect(toggleBox.y + toggleBox.height).toBe(944);
  await expect(page.locator('.sidebar')).toBeHidden();
  await page.getByRole('button', { name: '목차 열기', exact: true }).click();
  await expect(page.locator('.sidebar-slot')).toHaveCSS('width', '500px');
  expect((await editor.boundingBox())!.width).toBe(closedWidth);
  await page.getByRole('textbox', { name: '검색' }).fill('2023');
  await page.screenshot({ path: 'test-results/sidebar-desktop-open.png' });
  await page.keyboard.press('Escape');
  await expect(page.locator('.sidebar')).toBeHidden();
  await page.getByRole('button', { name: '목차 열기', exact: true }).click();
  await expect(page.getByRole('textbox', { name: '검색' })).toHaveValue('2023');
  await expect(page.locator('.field-box')).toHaveText('기존 판례 메모');
  await page.locator('.sidebar-backdrop').click({ position: { x: 900, y: 350 } });
  await expect(page.locator('.sidebar')).toBeHidden();
  expect((await editor.boundingBox())!.width).toBe(closedWidth);
  await page.screenshot({ path: 'test-results/sidebar-desktop-closed.png' });
});

test('mobile navigation fits screen and closes when a case is selected', async ({ page }) => {
  await page.setViewportSize({ width: 390, height: 844 });
  await page.goto('/tests/sidebar-layout.html');
  await expect(page.locator('.editor-pane')).toBeVisible();
  await page.getByRole('button', { name: '목차 열기', exact: true }).click();
  await expect(page.locator('.sidebar')).toBeVisible();
  await expect(page.locator('.sidebar-toggle')).toBeVisible();
  const box = (await page.locator('.sidebar-slot').boundingBox())!;
  expect(box.x + box.width).toBeLessThanOrEqual(390);
  await page.screenshot({ path: 'test-results/sidebar-mobile-open.png' });
  await page.locator('.case-item').click();
  await expect(page.locator('.sidebar')).toBeHidden();
  await expect(page.locator('.editor-header')).toContainText('2021고합504');
  expect((await page.locator('.editor-pane').boundingBox())!.width).toBe(390);
  await page.screenshot({ path: 'test-results/sidebar-mobile-closed.png' });
  expect(await page.evaluate(() => document.documentElement.scrollWidth)).toBeLessThanOrEqual(390);
});
