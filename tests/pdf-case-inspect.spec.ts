import { expect, test } from '@playwright/test';
import { readFile, writeFile, mkdir } from 'node:fs/promises';
import path from 'node:path';

test('inspect local court PDFs when explicitly supplied', async ({ page }) => {
  test.skip(!process.env.CASE_PDF_INSPECT, 'Local PDFs are supplied only for manual regression verification.');
  test.setTimeout(120000);
  await page.goto('/tests/pdf-case.html');
  const output = path.resolve('../outputs/pdf-repair-20261020');
  await mkdir(output, { recursive: true });
  for (const [number, file] of [['2021고합504', '[12강] 서울남부지방법원_2021고합504.pdf'], ['2022노1982', '[12강] 서울고등법원_2022노1982.pdf']]) {
    const data = Array.from(await readFile(path.join(process.env.USERPROFILE!, 'Downloads', file)));
    const result = await page.evaluate(async ({ data, file }) => {
      const w = window as unknown as { inspectPdf: (data: number[]) => Promise<unknown>; readCasePdf: (file: File) => Promise<unknown> };
      return { raw: await w.inspectPdf(data), parsed: await w.readCasePdf(new File([new Uint8Array(data)], file, { type: 'application/pdf' })) };
    }, { data, file });
    await writeFile(path.join(output, `${number}-after.json`), JSON.stringify(result, null, 2));
    const parsed = result.parsed as { caseNo: string; courtName: string; sourceHtml: string };
    expect(parsed.caseNo).toBe(number);
    expect(parsed.courtName).toBe(number === '2021고합504' ? '서울남부지방법원' : '서울고등법원');
    const normalized = parsed.sourceHtml.replace(/<[^>]+>/g, '').replace(/\s/g, '');
    expect(normalized).not.toMatch(/⮹|䑄|⸬|&#x20;/);
    expect(normalized.indexOf('이로써피고인들은')).toBeLessThan(normalized.indexOf('정확한시점은기억이나질않지만'));
    expect(normalized.indexOf('라한다)의구체적인내용은다음과같다.')).toBeLessThan(normalized.indexOf('정확한시점은기억이나질않지만'));
    expect(parsed.sourceHtml).toContain('class="pdf-quote"');
    expect(parsed.sourceHtml).not.toContain('방문</p><p>에');
    expect(parsed.sourceHtml).not.toContain('학교</p><p>를');
    expect(parsed.sourceHtml).not.toContain('(특</p>');
    const conservation = await page.evaluate(async ({ raw, html }) => {
      const modulePath = '/src/lib/pdfLayout.ts';
      const { cleanPdfFragment } = await import(modulePath);
      const template = document.createElement('template');
      template.innerHTML = html;
      template.content.querySelector('.pdf-footnotes > p')?.remove();
      const expected = (raw as { items: { str?: string }[] }[]).flatMap(p => p.items)
        .filter(i => typeof i.str === 'string' && !/^-\s*\d+\s*-$/.test(i.str))
        .map(i => cleanPdfFragment(i.str!)).join('');
      const counts = (value: string) => {
        const map: Record<string, number> = {};
        for (const char of value.replace(/\s/g, '')) map[char] = (map[char] || 0) + 1;
        return map;
      };
      const before = counts(expected), after = counts(template.content.textContent || '');
      return [...new Set([...Object.keys(before), ...Object.keys(after)])].filter(c => before[c] !== after[c]).map(c => ({ char: c, before: before[c], after: after[c] }));
    }, { raw: result.raw, html: parsed.sourceHtml });
    expect(conservation).toEqual([]);
    if (number === '2022노1982') {
      expect(parsed.sourceHtml).toContain('class="pdf-footnotes"');
      expect(normalized).toContain('학교폭력');
      expect(normalized.indexOf('피해자도같이술을마셨다.그날외에')).toBeGreaterThan(0);
      expect(normalized.lastIndexOf('4)질내에면봉')).toBeGreaterThan(normalized.indexOf('관할기관에신상정보를제출할의무가있다.'));
    }
    await writeFile(path.join(output, `${number}-after.html`), `<meta charset="utf-8">${parsed.sourceHtml}`);
    await page.evaluate(html => { document.body.innerHTML = `<main style="max-width:900px;margin:20px auto"><div class="field-box" contenteditable="true">${html}</div></main>`; }, parsed.sourceHtml);
    await page.screenshot({ path: path.join(output, `${number}-preview.png`), fullPage: false });
    await page.goto('/tests/pdf-case.html');
  }
});
