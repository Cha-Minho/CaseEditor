import { expect, test } from '@playwright/test';

test('native special-character insertion keeps the real caret and selection', async ({ page }) => {
  await page.goto('/tests/rich-editable.html');
  const editor = page.locator('[contenteditable="true"]');
  await editor.click();
  await page.keyboard.type('안녕');
  await page.evaluate(() => document.execCommand('insertText', false, '·'));
  await page.keyboard.type('하');
  await expect(editor).toHaveText('안녕·하');

  await page.keyboard.press('ArrowRight');
  await expect(editor).toHaveText('안녕·하');
});
