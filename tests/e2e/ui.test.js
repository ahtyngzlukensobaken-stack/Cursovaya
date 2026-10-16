/**
 * Системные (сквозные) тесты пользовательского интерфейса.
 * Браузер Chromium управляется библиотекой Playwright; страница открывается из файла index.html.
 * Запуск: node --test tests/e2e/ui.test.js
 */
const test = require('node:test');
const assert = require('node:assert/strict');
const path = require('node:path');
const fs = require('node:fs');
const { chromium } = require('playwright');

const URL = 'file://' + path.resolve(__dirname, '../../index.html') + '?today=2026-10-16';
const SHOTS = process.env.SHOTS_DIR || '';
let browser, page;

async function shot(name) {
  if (SHOTS) {
    fs.mkdirSync(SHOTS, { recursive: true });
    await page.evaluate(() => { document.getElementById('toast').className = 'toast'; });
    await page.waitForTimeout(300);
    const h = await page.evaluate(() => Math.ceil(document.querySelector('.tab.active').getBoundingClientRect().bottom + 8));
    await page.screenshot({ path: path.join(SHOTS, name + '.png'), fullPage: true, clip: { x: 0, y: 0, width: 1280, height: h } });
  }
}
async function tab(name) { await page.click(`.tabs button[data-tab="${name}"]`); }
async function toast() {
  const t = page.locator('#toast');
  await t.waitFor({ state: 'visible' });
  return { text: await t.textContent(), kind: await t.getAttribute('data-kind') };
}
async function addItem(code, name, qty) {
  await tab('items');
  await page.fill('[data-testid=item-code]', code);
  await page.fill('[data-testid=item-name]', name);
  await page.fill('[data-testid=item-qty]', String(qty));
  await page.click('[data-testid=item-save]');
}
async function addRecipient(name, dept) {
  await tab('recipients');
  await page.fill('[data-testid=rec-name]', name);
  await page.fill('[data-testid=rec-dept]', dept || '');
  await page.click('[data-testid=rec-save]');
}

test.before(async () => {
  browser = await chromium.launch({ args: ['--lang=ru-RU'] });
  const ctx = await browser.newContext({ viewport: { width: 1280, height: 760 }, locale: 'ru-RU' });
  page = await ctx.newPage();
  page.on('pageerror', (e) => { throw e; });
  await page.goto(URL);
  await page.evaluate(() => localStorage.clear());
  await page.reload();
});
test.after(async () => { await browser.close(); });

test('ТС-С01: запуск программы — пустая база, нули в сводке', async () => {
  const cards = await page.locator('#summary .card .v').allTextContents();
  assert.deepEqual(cards, ['0', '0', '0', '0']);
  assert.match(await page.textContent('#overdue-list'), /Просроченных возвратов нет/);
});

test('ТС-С02: добавление товара через форму', async () => {
  await addItem('др-001', 'Дрель аккумуляторная', 5);
  const t = await toast();
  assert.equal(t.kind, 'ok');
  const row = await page.locator('#items-table tbody tr').first().allTextContents();
  assert.match(row[0], /ДР-001.*Дрель аккумуляторная.*5/);
});

test('ТС-С03: ошибка ввода количества — сообщение об ошибке, товар не добавлен', async () => {
  await addItem('ПЕР-002', 'Перфоратор', 'пять');
  const t = await toast();
  assert.equal(t.kind, 'error');
  assert.match(t.text, /целым числом/);
  if (SHOTS) await page.screenshot({ path: path.join(SHOTS, 'err_qty.png') });
  assert.equal(await page.locator('#items-table tbody tr').count(), 1);
});

test('ТС-С04: добавление получателя', async () => {
  await addRecipient('Ахметов Ержан Серикович', 'Монтажный участок');
  assert.equal((await toast()).kind, 'ok');
  assert.match(await page.textContent('#recipients-table'), /Ахметов Ержан Серикович/);
});

test('ТС-С05: выдача товара — остаток уменьшается, запись в журнале', async () => {
  await tab('issue');
  await page.fill('[data-testid=issue-qty]', '3');
  await page.fill('[data-testid=issue-date]', '2026-10-01');
  await page.fill('[data-testid=issue-due]', '2026-10-10');
  await page.click('[data-testid=issue-save]');
  const t = await toast();
  assert.match(t.text, /В-000001/);
  assert.match(await page.textContent('#issue-hint'), /Доступно к выдаче: 2/);
  await tab('journal');
  const text = await page.textContent('#journal-table');
  assert.match(text, /В-000001.*01\.10\.2026.*Дрель аккумуляторная.*Ахметов/);
  assert.match(text, /Просрочен/);
});

test('ТС-С06: выдача сверх остатка отклоняется', async () => {
  await tab('issue');
  await page.fill('[data-testid=issue-qty]', '3');
  await page.click('[data-testid=issue-save]');
  const t = await toast();
  assert.equal(t.kind, 'error');
  assert.match(t.text, /Недостаточно товара на складе: доступно 2/);
});

test('ТС-С07: возврат больше выданного отклоняется', async () => {
  await tab('return');
  await page.fill('[data-testid=return-qty]', '4');
  await page.click('[data-testid=return-save]');
  const t = await toast();
  assert.equal(t.kind, 'error');
  assert.match(t.text, /не более 3/);
});

test('ТС-С08: частичный и полный возврат', async () => {
  await tab('return');
  await page.fill('[data-testid=return-qty]', '1');
  await page.fill('[data-testid=return-date]', '2026-10-12');
  await page.click('[data-testid=return-save]');
  assert.equal((await toast()).kind, 'ok');
  assert.match(await page.textContent('#return-hint'), /Ожидается к возврату: 2/);
  await page.fill('[data-testid=return-qty]', '2');
  await page.click('[data-testid=return-save]');
  assert.equal((await toast()).kind, 'ok');
  assert.match(await page.textContent('#return-issue'), /Нет невозвращённых выдач/);
  await tab('journal');
  assert.match(await page.textContent('#journal-table'), /Возвращён/);
});

test('ТС-С09: данные сохраняются после перезагрузки страницы', async () => {
  await page.reload();
  await tab('items');
  const row = await page.locator('#items-table tbody tr').first().textContent();
  assert.match(row, /ДР-001/);
  assert.equal(await page.locator('#journal-table tbody tr').count(), 1);
});

test('ТС-С10: защита от внедрения HTML-кода в поля ввода', async () => {
  await addItem('XSS-1', '<img src=x onerror="window.__xss=1">', 1);
  await toast();
  const injected = await page.evaluate(() => window.__xss === 1);
  assert.equal(injected, false);
  assert.match(await page.textContent('#items-table'), /<img src=x/);
});

test('ТС-С11: демонстрационные данные, фильтр «Просрочен» и поиск в журнале', async () => {
  await tab('data');
  await page.click('[data-testid=demo-load]');
  await toast();
  await tab('home');
  await shot('home');
  const cards = await page.locator('#summary .card .v').allTextContents();
  assert.deepEqual(cards, ['7', '72', '15', '2']);
  await tab('journal');
  await page.selectOption('[data-testid=journal-status]', 'overdue');
  assert.equal(await page.locator('#journal-table tbody tr').count(), 2);
  await page.selectOption('[data-testid=journal-status]', 'all');
  await page.fill('[data-testid=journal-search]', 'ким');
  assert.equal(await page.locator('#journal-table tbody tr').count(), 2);
  await page.fill('[data-testid=journal-search]', '');
  await shot('journal');
});

test('ТС-С12: оборотная ведомость и задолженности', async () => {
  await tab('reports');
  await page.fill('[data-testid=rep-from]', '2026-09-01');
  await page.fill('[data-testid=rep-to]', '2026-10-16');
  await page.click('[data-testid=rep-build]');
  const rows = await page.locator('#report-table tbody tr').count();
  assert.equal(rows, 7);
  assert.match(await page.locator('#report-table tbody tr').nth(5).textContent(), /ПЕР-006.*10.*6.*1.*3/);
  await shot('reports');
  await page.fill('[data-testid=rep-from]', '2026-10-20');
  await page.click('[data-testid=rep-build]');
  const t = await toast();
  assert.match(t.text, /Начало периода позже/);
});

test('ТС-С13: снимки экранов остальных разделов', async () => {
  await page.fill('[data-testid=rep-from]', '2026-09-01');
  await page.click('[data-testid=rep-build]');
  await tab('items'); await shot('items');
  await tab('recipients'); await shot('recipients');
  await tab('issue'); await shot('issue');
  await tab('return'); await shot('return');
  await tab('data'); await shot('data');
  assert.ok(true);
});
