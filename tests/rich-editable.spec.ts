import { expect, test } from '@playwright/test';

test('native special-character insertion keeps the real caret and selection', async ({ page }) => {
  await page.goto('/tests/rich-editable.html');
  const editor = page.locator('[contenteditable="true"]').first();
  await editor.click();
  await page.keyboard.type('안녕');
  await page.evaluate(() => document.execCommand('insertText', false, '·'));
  await page.keyboard.type('하');
  await expect(editor).toHaveText('안녕·하');

  await page.keyboard.press('ArrowRight');
  await expect(editor).toHaveText('안녕·하');
});

test('restores the caret when field blur happens before window blur', async ({ page }) => {
  await page.goto('/tests/rich-editable.html');
  const editor = page.locator('[contenteditable="true"]').first();
  await editor.click();
  await page.keyboard.type('가나다라마바사');
  await editor.evaluate((element) => {
    const text = element.firstChild!;
    const range = document.createRange();
    range.setStart(text, 3);
    range.collapse(true);
    const selection = window.getSelection()!;
    selection.removeAllRanges();
    selection.addRange(range);
    document.dispatchEvent(new Event('selectionchange'));
    (element as HTMLElement).blur();
    window.dispatchEvent(new Event('blur'));
    window.dispatchEvent(new Event('focus'));
  });
  await expect.poll(() => editor.evaluate(element => document.activeElement === element)).toBe(true);
  await page.keyboard.type('X');
  await expect(editor).toHaveText('가나다X라마바사');
});

test('only restores the field that was active before window blur', async ({ page }) => {
  await page.goto('/tests/rich-editable.html');
  const editors = page.locator('[contenteditable="true"]');
  const first = editors.first();
  const second = editors.nth(1);
  await first.click();
  await page.keyboard.type('첫상자');
  await second.click();
  await page.keyboard.type('둘째상자');
  await page.keyboard.press('Home');
  await page.keyboard.press('ArrowRight');
  await second.evaluate((element) => {
    document.dispatchEvent(new Event('selectionchange'));
    (element as HTMLElement).blur();
    window.dispatchEvent(new Event('blur'));
    window.dispatchEvent(new Event('focus'));
  });
  await expect.poll(() => second.evaluate(element => document.activeElement === element)).toBe(true);
  await page.keyboard.type('X');
  await expect(first).toHaveText('첫상자');
  await expect(second).toHaveText('둘X째상자');
});
