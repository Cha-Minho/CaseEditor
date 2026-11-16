import {test,expect} from '@playwright/test';
test.beforeEach(async({page})=>{
  await page.setViewportSize({width:1440,height:960});
  await page.goto('/tests/explorer.html');
  await page.getByRole('button',{name:'목차 열기',exact:true}).click();
});
test('navigate folders with history and open a case only on double click',async({page})=>{
  await expect(page.locator('.explorer-case')).toHaveCount(0);
  await expect(page.locator('.folder-children')).toHaveCount(0);
  await page.locator('.explorer-folder-open',{hasText:'형사소송법'}).dblclick();
  await expect(page.locator('.explorer-case')).toHaveCount(2);
  await page.locator('.explorer-folder-open',{hasText:'증거재판주의'}).dblclick();
  await expect(page.locator('.explorer-case')).toHaveText('2026도4423');
  await page.getByRole('button',{name:'뒤로',exact:true}).click();
  await expect(page.locator('.explorer-case')).toHaveCount(2);
  await page.getByRole('button',{name:'앞으로',exact:true}).click();
  await expect(page.locator('.explorer-case')).toHaveCount(1);
  await page.getByRole('button',{name:'상위 폴더',exact:true}).click();
  await page.locator('.explorer-case',{hasText:'2024도163'}).click();
  await expect(page.locator('.sidebar')).toBeVisible();
  await page.screenshot({path:'test-results/explorer-desktop.png'});
  await page.locator('.explorer-case',{hasText:'2024도163'}).dblclick();
  await expect(page.locator('.sidebar')).toBeHidden();
  await expect(page.locator('.editor-header')).toContainText('2024도163');
});
test('select a folder group, clear selection, cut cases and paste in another folder',async({page})=>{
  await page.locator('.explorer-folder',{hasText:'형사소송법'}).click({button:'right'});
  await page.getByRole('menuitem',{name:'전체 선택',exact:true}).click();
  await expect(page.locator('.select-bar')).toContainText('3개 선택됨');
  await page.locator('.explorer-folder',{hasText:'형사소송법'}).click({button:'right'});
  await page.getByRole('menuitem',{name:'전체 선택 해제',exact:true}).click();
  await expect(page.locator('.select-bar')).toHaveCount(0);
  await page.locator('.explorer-folder-open',{hasText:'형사소송법'}).dblclick();
  await page.locator('.explorer-case').first().click();
  await page.locator('.explorer-case').last().click({modifiers:['Shift']});
  await expect(page.locator('.select-bar')).toContainText('2개 선택됨');
  await page.getByRole('button',{name:'잘라내기',exact:true}).click();
  await page.getByRole('button',{name:'전체 폴더',exact:true}).click();
  await page.locator('.explorer-folder-open',{hasText:'민법'}).dblclick();
  await page.getByRole('button',{name:'이동하여 붙여넣기',exact:true}).click();
  await expect(page.locator('.explorer-case')).toHaveCount(2);
  await page.getByRole('button',{name:'전체 선택 / 해제',exact:true}).click();
  await expect(page.locator('.select-bar')).toContainText('2개 선택됨');
  await page.getByRole('button',{name:'전체 선택 / 해제',exact:true}).click();
  await expect(page.locator('.select-bar')).toHaveCount(0);
});
test('drag a case into a folder and move a folder without changing its contents',async({page})=>{
  await page.locator('.explorer-folder-open',{hasText:'형사소송법'}).dblclick();
  await page.locator('.explorer-case').first().dragTo(page.locator('.explorer-folder',{hasText:'증거재판주의'}));
  await expect(page.locator('.explorer-case')).toHaveCount(1);
  await page.locator('.explorer-folder-open',{hasText:'증거재판주의'}).click();
  await page.getByRole('button',{name:'잘라내기',exact:true}).click();
  await page.getByRole('button',{name:'전체 폴더',exact:true}).click();
  await page.locator('.explorer-folder-open',{hasText:'민법'}).dblclick();
  await page.getByRole('button',{name:'이동하여 붙여넣기',exact:true}).click();
  await page.locator('.explorer-folder-open',{hasText:'증거재판주의'}).dblclick();
  await expect(page.locator('.explorer-case')).toHaveCount(2);
});
test('marquee and Ctrl click select cases without opening the editor',async({page})=>{
  await page.locator('.explorer-folder-open',{hasText:'형사소송법'}).dblclick();
  const first=(await page.locator('.explorer-case-row').first().boundingBox())!;
  const last=(await page.locator('.explorer-case-row').last().boundingBox())!;
  await page.mouse.move(first.x+first.width-3,last.y+last.height+25);
  await page.mouse.down();
  await page.mouse.move(first.x+20,first.y+3,{steps:12});
  await page.mouse.up();
  await expect(page.locator('.select-bar')).toContainText('2개 선택됨');
  await page.locator('.explorer-case').first().click({modifiers:['Control']});
  await expect(page.locator('.select-bar')).toContainText('1개 선택됨');
  await expect(page.locator('.sidebar')).toBeVisible();
});
test('mobile opens by tapping and has no horizontal overflow',async({browser})=>{
  const context=await browser.newContext({viewport:{width:390,height:844},isMobile:true,hasTouch:true});
  const page=await context.newPage();
  try {
    await page.goto('/tests/explorer.html');
    await page.getByRole('button',{name:'목차 열기',exact:true}).tap();
    await page.locator('.explorer-folder-open',{hasText:'형사소송법'}).tap();
    await expect(page.locator('.explorer-case')).toHaveCount(2);
    expect(await page.evaluate(()=>document.documentElement.scrollWidth)).toBeLessThanOrEqual(390);
    await page.screenshot({path:'test-results/explorer-mobile.png'});
    await page.locator('.explorer-case').first().tap();
    await expect(page.locator('.sidebar')).toBeHidden();
    await expect(page.locator('.editor-header')).toContainText('2023도11371');
  } finally { await context.close(); }
});

for (const width of [1440,390]) {
  test(`only the folder list scrolls, with fixed path at ${width}px`,async({page})=>{
    await page.setViewportSize({width,height:720});
    await page.goto('/tests/explorer.html?long');
    await page.getByRole('button',{name:'목차 열기',exact:true}).click();
    await page.locator('.explorer-folder-open',{hasText:'민법'}).dblclick();
    const path=page.locator('.explorer-path'),toolbar=page.locator('.explorer-toolbar'),list=page.locator('.explorer-content');
    const pathBox=(await path.boundingBox())!,toolbarBox=(await toolbar.boundingBox())!;
    await expect(page.locator('.explorer-status')).toHaveCount(0);
    expect(await list.evaluate(el=>el.scrollHeight>el.clientHeight)).toBe(true);
    await list.hover();
    await page.mouse.wheel(0,1600);
    await expect.poll(()=>list.evaluate(el=>el.scrollTop)).toBeGreaterThan(0);
    expect((await path.boundingBox())!.y).toBe(pathBox.y);
    expect((await toolbar.boundingBox())!.y).toBe(toolbarBox.y);
    expect(await page.locator('.case-list').evaluate(el=>el.scrollTop)).toBe(0);
    expect(await page.locator('.sidebar').evaluate(el=>el.scrollHeight-el.clientHeight)).toBeLessThanOrEqual(1);
    await page.screenshot({path:`test-results/explorer-scroll-${width}.png`});
    await page.getByRole('button',{name:'전체 폴더',exact:true}).click();
    await page.locator('.explorer-folder-open',{hasText:'형사소송법'}).dblclick();
    expect(await list.evaluate(el=>el.scrollTop)).toBe(0);
    await list.evaluate(el=>{el.scrollTop=el.scrollHeight;});
    const items=page.locator('.explorer-case-row');
    const a=(await items.nth(await items.count()-2).boundingBox())!,b=(await items.last().boundingBox())!;
    await page.mouse.move(b.x+b.width-3,b.y+b.height+20);
    await page.mouse.down();
    await page.mouse.move(a.x+20,a.y+2,{steps:10});
    await page.mouse.up();
    await expect(page.locator('.select-bar')).toContainText('2개 선택됨');
  });
}
