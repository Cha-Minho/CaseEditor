import { test, expect } from '@playwright/test';

test('create, connect, undo deletion and reopen case diagram', async ({ page }) => {
  const errors: string[] = [];
  page.on('pageerror', error => errors.push(error.message));
  await page.setViewportSize({ width: 1440, height: 960 });
  await page.goto('/tests/diagram.html');
  await page.getByText('관계도 열기').click();
  await page.getByTitle('당사자 추가').click();
  await page.getByRole('textbox').fill('갑');
  await page.getByRole('textbox').press('Enter');
  await page.getByTitle('목적물 추가').click();
  await page.getByRole('textbox').fill('X 토지');
  await page.getByRole('textbox').press('Enter');
  const nodes = page.locator('.react-flow__node');
  await expect(nodes).toHaveCount(2);
  await page.getByTitle('관계 추가').click();
  await page.getByLabel('관계 시작 노드').selectOption({ label: '갑' });
  await page.getByLabel('관계 도착 노드').selectOption({ label: 'X 토지' });
  await page.getByLabel('관계 이름').fill('점유');
  await page.locator('.diagram-link-form').getByRole('button', { name: '추가' }).click();
  await expect(page.locator('.react-flow__edge')).toHaveCount(1);
  await page.locator('.plot-edge-chip', { hasText: '점유' }).click();
  await expect(page.getByLabel('선택 항목 이름')).toHaveValue('점유');
  await page.getByLabel('선택 항목 이름').fill('보관');
  await page.getByLabel('선택 항목 이름').press('Enter');
  await expect(page.locator('.plot-edge-chip', { hasText: '보관' })).toBeVisible();
  await page.getByLabel('선택 삭제', { exact: true }).click();
  await expect(nodes).toHaveCount(2);
  await expect(page.locator('.react-flow__edge')).toHaveCount(0);
  await page.getByLabel('실행 취소', { exact: true }).click();
  await expect(nodes).toHaveCount(2);
  await expect(page.locator('.react-flow__edge')).toHaveCount(1);
  await page.keyboard.press('Escape');
  await expect(page.getByRole('dialog')).toHaveCount(0);
  await page.getByText('관계도 열기').click();
  await expect(nodes).toHaveCount(2);
  await expect(page.locator('.react-flow__edge')).toHaveCount(1);
  await expect(nodes.first()).toBeInViewport();
  await page.screenshot({ path: 'test-results/diagram-desktop.png' });
  await page.setViewportSize({ width: 390, height: 844 });
  await expect(page.getByRole('dialog')).toBeVisible();
  const box = await page.getByRole('dialog').boundingBox();
  expect(box!.width).toBeLessThanOrEqual(390);
  await expect(nodes.first()).toBeInViewport();
  await page.screenshot({ path: 'test-results/diagram-mobile.png' });
  expect(errors).toEqual([]);
});

test('review and apply an AI relationship draft', async ({ page }) => {
  await page.route('**/functions/v1/legal-graph', route => route.fulfill({
    status: 200,
    contentType: 'application/json',
    body: JSON.stringify({
      parties: [{ id: 'p1', name: '갑', role: '원고' }, { id: 'p2', name: '을', role: '피고' }, { id: 'p3', name: '병', role: '피해자' }],
      objects: [{ id: 'o1', name: 'X 토지' }],
      relations: [
        { id: 'r1', from: 'p1', to: 'p2', label: '2013 촬영', kind: 'other', sequence: 1, date: '2013.12', evidence: '갑은 2013. 12. 을을 촬영하였다', status: 'recognized', confidence: 0.94 },
        { id: 'r2', from: 'p1', to: 'p3', label: '2014 촬영', kind: 'other', sequence: 2, date: '2014.12.11', objectId: 'o1', effect: 'sale', evidence: '갑은 2014. 12. 11. 병을 촬영하였다', status: 'recognized', confidence: 0.92 }
      ],
      events: [
        { id: 'ev3', sequence: 3, date: '2014.12.11', text: '휴대전화 임의제출', evidence: '피해 사실을 신고하면서 즉시 제출하였다' },
        { id: 'ev1', sequence: 1, date: '2013.12', text: '2013 동영상 촬영', evidence: '2013. 12.경 촬영하였다' },
        { id: 'ev2', sequence: 2, date: '2014.12.11', text: '2014 동영상 촬영', evidence: '2014. 12. 11. 촬영하였다' }
      ]
    })
  }));
  await page.goto('/tests/diagram.html');
  await page.getByText('관계도 열기').click();
  await page.getByTitle('판례 원문에서 AI 관계도 초안 만들기').click();
  await expect(page.locator('.diagram-draft-review strong', { hasText: 'AI 초안' })).toBeVisible();
  await expect(page.getByText('당사자 3 · 목적물 1 · 관계 2 · 사건 3')).toBeVisible();
  await page.getByText('관계도에 적용').click();
  await expect(page.locator('.react-flow__node')).toHaveCount(4);
  const relationEdges = page.locator('.diagram-edge:not(.property-arc)');
  await expect(relationEdges).toHaveCount(2);
  await expect(page.locator('.diagram-event-list button')).toHaveText([/2013 동영상 촬영/, /2014 동영상 촬영/, /휴대전화 임의제출/]);
  const timelineBox = await page.locator('.diagram-timeline').boundingBox();
  const canvasBox = await page.locator('.diagram-canvas').boundingBox();
  expect(timelineBox!.x).toBeLessThan(canvasBox!.x);
  expect(await page.locator('.diagram-event-list span').first().evaluate(element => getComputedStyle(element).whiteSpace)).toBe('normal');
  const labelBoxes = await page.locator('.plot-edge-chip').evaluateAll(elements => elements.map(element => element.getBoundingClientRect()).filter(rect => rect.width > 0 && rect.height > 0).map(rect => ({ left: rect.left, right: rect.right, top: rect.top, bottom: rect.bottom })));
  for (let left = 0; left < labelBoxes.length; left += 1) for (let right = left + 1; right < labelBoxes.length; right += 1) {
    const a = labelBoxes[left];
    const b = labelBoxes[right];
    expect(a.right <= b.left + 1 || b.right <= a.left + 1 || a.bottom <= b.top + 1 || b.bottom <= a.top + 1).toBe(true);
  }
  const nodeText = page.locator('.plot-party-node > span').first();
  const textHeightBeforeZoom = (await nodeText.boundingBox())!.height;
  await page.locator('.react-flow__controls-zoomin').click();
  await page.waitForTimeout(150);
  const textHeightAfterZoom = (await nodeText.boundingBox())!.height;
  expect(Math.abs(textHeightAfterZoom - textHeightBeforeZoom)).toBeLessThan(1.5);
  await page.screenshot({ path: 'test-results/diagram-ai.png' });
  await page.getByLabel('사건 흐름 시점').fill('0');
  expect(await relationEdges.nth(0).locator('.react-flow__edge-path').evaluate(element => getComputedStyle(element).opacity)).toBe('1');
  expect(Number(await relationEdges.nth(1).locator('.react-flow__edge-path').evaluate(element => getComputedStyle(element).opacity))).toBeLessThan(0.2);
  await expect(page.locator('.plot-edge-chip.future')).toHaveCount(1);
  await expect(page.locator('.plot-party-node.future')).toHaveCount(1);
  await expect(page.locator('.plot-object-node.future')).toHaveCount(1);
  await page.locator('.plot-edge-chip', { hasText: '2013 촬영' }).click();
  await expect(page.getByText('인정 사실')).toBeVisible();
  await expect(page.getByText('갑은 2013. 12. 을을 촬영하였다')).toBeVisible();
  const resizedCanvasBox = await page.locator('.diagram-canvas').boundingBox();
  const evidenceBox = await page.locator('.diagram-stage .diagram-evidence').boundingBox();
  expect(evidenceBox!.x).toBeGreaterThanOrEqual(resizedCanvasBox!.x);
  expect(evidenceBox!.y).toBeGreaterThanOrEqual(resizedCanvasBox!.y + resizedCanvasBox!.height - 1);
  await page.screenshot({ path: 'test-results/diagram-evidence.png' });
});
