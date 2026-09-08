import { test, expect } from '@playwright/test';

test('folder context menu toggles the whole case group', async ({ page }) => {
  await page.goto('/tests/sidebar.html');
  const folder = page.getByText('민법', { exact: true });
  await folder.hover();
  await expect(page.getByRole('menu')).toHaveCount(0);
  await expect(page.locator('.case-item-title')).toHaveText(['2020다1', '2020다2', '2020다3', '2020다4', '2020다5']);

  await folder.click({ button: 'right' });
  await page.getByRole('menuitem', { name: '전체 선택' }).click();
  await expect(page.locator('.case-checkbox[aria-pressed="true"]')).toHaveCount(5);

  await folder.click({ button: 'right' });
  await page.getByRole('menuitem', { name: '전체 선택 해제' }).click();
  await expect(page.locator('.case-checkbox[aria-pressed="true"]')).toHaveCount(0);

  await page.locator('.case-checkbox').first().click();
  await expect(page.locator('.case-checkbox[aria-pressed="true"]')).toHaveCount(1);
  await folder.click({ button: 'right' });
  await page.getByRole('menuitem', { name: '전체 선택' }).click();
  await expect(page.locator('.case-checkbox[aria-pressed="true"]')).toHaveCount(5);
});
