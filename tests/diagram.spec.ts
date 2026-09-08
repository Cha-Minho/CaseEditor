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
  const source = await nodes.nth(0).locator('.source').boundingBox();
  const target = await nodes.nth(1).locator('.target').boundingBox();
  await page.mouse.move(source!.x + 5, source!.y + 5);
  await page.mouse.down();
  await page.mouse.move(target!.x + 5, target!.y + 5, { steps: 15 });
  await page.mouse.up();
  await expect(page.locator('.react-flow__edge')).toHaveCount(1);
  await page.getByLabel('선택 삭제', { exact: true }).click();
  await expect(nodes).toHaveCount(1);
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
      parties: [{ id: 'p1', name: '갑', role: '원고' }, { id: 'p2', name: '을', role: '피고' }],
      objects: [{ id: 'o1', name: 'X 토지' }],
      relations: [{ id: 'r1', from: 'p1', to: 'p2', label: '매도', kind: 'contract', objectId: 'o1', evidence: '갑은 을에게 X 토지를 매도하였다', status: 'recognized', confidence: 0.94 }],
      events: [{ id: 'ev1', text: '매매계약 체결', evidence: 'X 토지를 매도하고 매매대금을 받았다' }]
    })
  }));
  await page.goto('/tests/diagram.html');
  await page.getByText('관계도 열기').click();
  await page.getByTitle('판례 원문에서 AI 관계도 초안 만들기').click();
  await expect(page.locator('.diagram-draft-review strong', { hasText: 'AI 초안' })).toBeVisible();
  await expect(page.getByText('당사자 2 · 목적물 1 · 관계 1 · 사건 1')).toBeVisible();
  await page.getByText('관계도에 적용').click();
  await expect(page.locator('.react-flow__node')).toHaveCount(3);
  await expect(page.locator('.react-flow__edge')).toHaveCount(1);
  await page.locator('.react-flow__edge-interaction').dispatchEvent('click');
  await expect(page.getByText('인정 사실')).toBeVisible();
  await expect(page.getByText('갑은 을에게 X 토지를 매도하였다')).toBeVisible();
});
