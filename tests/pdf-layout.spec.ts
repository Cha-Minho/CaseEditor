import { expect, test } from '@playwright/test';
import { cleanPdfFragment, documentFromPages, pageFromTextItems, type PdfTextItem } from '../src/lib/pdfLayout';

const viewport = { width: 600, height: 840, transform: [1, 0, 0, -1, 0, 840] };
function text(str: string, x: number, y: number, width: number, size = 12): PdfTextItem {
  return { str, transform: [size, 0, 0, size, x, 840 - y], width, height: size, hasEOL: true };
}

test('read a box after its introduction even if it was painted first', () => {
  const page = pageFromTextItems([
    text('인용문 첫 문장입니다.', 75, 250, 300, 11),
    text('- 1 -', 280, 810, 30),
    text('본문의 앞 문장입니다.', 65, 150, 300),
    text('유서의 구체적인 내용은 다음과 같다.', 65, 200, 450),
    text('나) 법원의 판단', 65, 310, 200)
  ], viewport);
  const result = documentFromPages([page]);
  expect(result.text.indexOf('본문의 앞')).toBeLessThan(result.text.indexOf('인용문 첫'));
  expect(result.text.indexOf('다음과 같다.')).toBeLessThan(result.text.indexOf('인용문 첫'));
  expect(result.text.indexOf('인용문 첫')).toBeLessThan(result.text.indexOf('나) 법원'));
  expect(result.sourceHtml).toContain('<div class="pdf-quote">');
  expect(result.text).not.toContain('- 1 -');
});

test('group fragments by baseline without depending on hasEOL or drawing order', () => {
  const page = pageFromTextItems([
    text('학교', 112, 150, 24),
    { ...text('피해자', 60, 150, 36), hasEOL: false },
    text('진술', 60, 180, 24),
    text('1)', 137, 147.5, 8, 9)
  ], viewport);
  expect(page.lines.map(line => line.text)).toEqual(['피해자 학교1)', '진술']);
});

test('join a page-spanning quotation before resuming the body', () => {
  const first = pageFromTextItems([text('본문.', 60, 150, 100), text('인용문의 앞', 70, 720, 460, 11)], viewport);
  const second = pageFromTextItems([text('뒤를 이어쓴다.', 70, 150, 200, 11), text('3) 다음 판단', 65, 210, 250), text('다음 본문.', 60, 240, 300)], viewport);
  const result = documentFromPages([first, second]);
  expect(result.sourceHtml).toContain('인용문의 앞뒤를 이어쓴다.');
  expect(result.sourceHtml.match(/class="pdf-quote"/g)).toHaveLength(1);
});

test('move footer notes out of the sentence continuing on the next page', () => {
  const first = pageFromTextItems([text('본문을 계속', 60, 700, 480), text('4) 별도의 각주입니다.', 60, 755, 300, 9)], viewport);
  const second = pageFromTextItems([text('이어서 쓴다.', 60, 150, 200), text('다른 본문입니다.', 60, 180, 300)], viewport);
  const result = documentFromPages([first, second]);
  expect(result.text).toContain('본문을 계속이어서 쓴다.');
  expect(result.sourceHtml.lastIndexOf('4) 별도의 각주')).toBeGreaterThan(result.sourceHtml.indexOf('다른 본문'));
});

test('retain valid list markers, Hanja, symbols and text entities', () => {
  expect(cleanPdfFragment('㉠ 법률(法律) ㈜ 회사 &#x20; 본문')).toBe('㉠ 법률(法律) ㈜ 회사   본문');
  expect(cleanPdfFragment('앞⮹뒤')).toBe('앞뒤');
  expect(cleanPdfFragment('⸬G䑄ᷤ㉐⏈G䑄ᷤ㉐G㢬䉤≫㜨⣀G㇠㢨䏬㜄㉐G㜨⣀')).toBe('');
});

test('do not split a numbered paragraph or a word at its physical line end', () => {
  const result = documentFromPages([pageFromTextItems([
    text('1) 이 사건 유서의 작성', 68, 150, 470),
    text('자는 사망하였다. 피고인은', 60, 180, 478),
    text('증거사용에 동의하지 않았다.', 60, 210, 300)
  ], viewport)]);
  expect(result.paragraphs).toHaveLength(1);
  expect(result.text).toBe('1) 이 사건 유서의 작성자는 사망하였다. 피고인은 증거사용에 동의하지 않았다.');
});
