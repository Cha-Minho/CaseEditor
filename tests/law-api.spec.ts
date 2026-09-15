import { expect, test } from '@playwright/test';

test('retries a title-only case response instead of accepting empty notes', async ({ page }) => {
  let calls = 0;
  await page.route('**/functions/v1/law-case', async route => {
    calls += 1;
    await route.fulfill({
      status: 200,
      contentType: 'application/json',
      body: JSON.stringify(calls === 1
        ? { found: true, case_no: '2020도1538', title: '아동학대', source_html: '' }
        : { found: true, case_no: '2020도1538', title: '아동학대', source_html: '정상 판례 원문' })
    });
  });

  await page.goto('/tests/law-api.html');
  await page.getByRole('button', { name: '판례 불러오기' }).click();
  await expect(page.locator('output')).toHaveText('2020도1538:8');
  expect(calls).toBe(2);
});
