import { expect, test } from '@playwright/test';

test('format API markers and paragraphs while retaining the judgment words', async ({ page }) => {
  await page.goto('/tests/pdf-case.html');
  const formatted = await page.evaluate(async () => {
    const path = '/src/lib/judgmentFormat.ts';
    const { formatReferenceHtml } = await import(path);
    return formatReferenceHtml('【주 문】<br>원심판결을 파기한다.<br><br>【이 유】<br>  1. 관련 법리<br>진술을 인정할 수 없다.<br>  가. 구체적 판단<br>내용을 심리한다.');
  });
  await page.locator('body').evaluate((body, html) => { body.innerHTML = html; }, formatted);
  await expect(page.locator('.judgment-heading')).toHaveText(['【주 문】', '【이 유】', '1. 관련 법리', '가. 구체적 판단']);
  await expect(page.locator('.judgment-heading b')).toHaveCount(4);
  expect(await page.locator('body').textContent()).toBe('【주 문】원심판결을 파기한다.【이 유】1. 관련 법리진술을 인정할 수 없다.가. 구체적 판단내용을 심리한다.');
});

test('keep quotation blocks, notes and existing inline highlights', async ({ page }) => {
  await page.goto('/tests/pdf-case.html');
  const formatted = await page.evaluate(async () => {
    const path = '/src/lib/judgmentFormat.ts';
    const { formatReferenceHtml } = await import(path);
    return formatReferenceHtml('<p>2) 유서의 내용</p><div class="pdf-quote"><p>진술 <mark class="case-highlight">중요한 내용</mark>이다.</p></div><p>법원의 판단이다.</p><div class="pdf-footnotes"><p><b>각주</b></p><p>1) 원문 설명.</p></div>');
  });
  await page.locator('body').evaluate((body, html) => { body.innerHTML = html; }, formatted);
  await expect(page.locator('.pdf-quote mark.case-highlight')).toHaveText('중요한 내용');
  await expect(page.locator('.pdf-footnotes')).toContainText('1) 원문 설명.');
  await expect(page.locator('body > p').first().locator('b')).toHaveText('2) 유서의 내용');
});

test('do not bold an entire long numbered allegation or merge separate lists', async ({ page }) => {
  await page.goto('/tests/pdf-case.html');
  const result = await page.evaluate(async () => {
    const path = '/src/lib/judgmentFormat.ts';
    const { formatReferenceHtml } = await import(path);
    const html = formatReferenceHtml('<p>1) 피고인이 제출한 문서에는 사건 당시의 정황과 진술이 기재되어 있으나 신빙성이 인정되지 않는다고 판단하였다.</p><ul><li>첫 증거</li><li>둘째 증거</li></ul>');
    const element = document.createElement('div'); element.innerHTML = html;
    return { bold: element.querySelector('b')?.textContent, heading: element.querySelectorAll('.judgment-heading').length, list: element.querySelectorAll('ul > li').length };
  });
  expect(result).toEqual({ bold: '1) ', heading: 0, list: 2 });
});
