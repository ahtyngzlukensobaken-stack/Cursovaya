/**
 * Нагрузочные тесты и тест инвариантов на случайных последовательностях операций.
 * Инвариант учёта: для каждого товара  всего = на складе + на руках,  на складе >= 0.
 */
const test = require('node:test');
const assert = require('node:assert/strict');
const Inventory = require('../../js/inventory.js');

/** Детерминированный генератор псевдослучайных чисел (для воспроизводимости) */
function rng(seed) {
  let s = seed >>> 0;
  return () => { s = (s * 1664525 + 1013904223) >>> 0; return s / 4294967296; };
}
function date(dayOffset) {
  const d = new Date(Date.UTC(2026, 0, 1 + dayOffset));
  return d.toISOString().slice(0, 10);
}
function checkInvariant(inv) {
  for (const it of inv.state.items) {
    const onHands = inv.getOnHands(it.id);
    assert.equal(it.total, it.available + onHands, 'нарушен баланс по товару ' + it.code);
    assert.ok(it.available >= 0, 'отрицательный остаток по товару ' + it.code);
  }
}

const results = {};

test('ТС-Н01: 1000 товаров, 200 получателей, 10000 выдач, возвраты — время выполнения', () => {
  const rand = rng(2026);
  const inv = new Inventory();
  let t0 = performance.now();
  for (let i = 0; i < 1000; i++) inv.addItem({ code: 'T-' + i, name: 'Товар № ' + i, quantity: 1000 });
  for (let i = 0; i < 200; i++) inv.addRecipient({ fullName: 'Получатель ' + i });
  results.dictionaries = performance.now() - t0;

  t0 = performance.now();
  for (let i = 0; i < 10000; i++) {
    inv.issueItem({ itemId: 1 + Math.floor(rand() * 1000), recipientId: 1 + Math.floor(rand() * 200),
      quantity: 1 + Math.floor(rand() * 5), issueDate: date(Math.floor(i / 50)), dueDate: date(Math.floor(i / 50) + 14) });
  }
  results.issues = performance.now() - t0;

  t0 = performance.now();
  let returns = 0;
  for (const iss of inv.state.issues.slice(0, 5000)) {
    inv.returnItem({ issueId: iss.id, quantity: iss.quantity, returnDate: iss.dueDate, condition: rand() < 0.05 ? 'damaged' : 'good' });
    returns++;
  }
  results.returns = performance.now() - t0;

  t0 = performance.now();
  const rep = inv.getTurnoverReport('2026-01-01', '2026-12-31');
  results.report = performance.now() - t0;

  t0 = performance.now();
  const found = inv.searchIssues({ text: 'Получатель 15', status: 'all' });
  results.search = performance.now() - t0;

  t0 = performance.now();
  const od = inv.getOverdue('2026-06-01');
  results.overdue = performance.now() - t0;

  assert.equal(inv.state.issues.length, 10000);
  assert.equal(returns, 5000);
  assert.equal(rep.length, 1000);
  assert.ok(found.length > 0);
  assert.ok(od.length > 0);
  checkInvariant(inv);
  // Требование ТЗ: отклик на типовые операции — не более 2 секунд
  for (const [k, v] of Object.entries(results)) assert.ok(v < 2000, k + ' выполнялось ' + v.toFixed(0) + ' мс');
});

test('ТС-Н02: 3000 случайных операций (вкл. ошибочные) не нарушают баланс учёта', () => {
  const rand = rng(17);
  const inv = new Inventory();
  for (let i = 0; i < 20; i++) inv.addItem({ code: 'R-' + i, name: 'Товар ' + i, quantity: Math.floor(rand() * 30) });
  for (let i = 0; i < 10; i++) inv.addRecipient({ fullName: 'Сотрудник ' + i });
  let ok = 0, rejected = 0;
  for (let step = 0; step < 3000; step++) {
    const op = rand();
    try {
      if (op < 0.45) {
        inv.issueItem({ itemId: 1 + Math.floor(rand() * 20), recipientId: 1 + Math.floor(rand() * 10),
          quantity: Math.floor(rand() * 8), issueDate: date(step % 300) });
      } else if (op < 0.85 && inv.state.issues.length) {
        const iss = inv.state.issues[Math.floor(rand() * inv.state.issues.length)];
        inv.returnItem({ issueId: iss.id, quantity: 1 + Math.floor(rand() * 4), returnDate: date(300),
          condition: rand() < 0.1 ? 'damaged' : 'good' });
      } else {
        const it = inv.state.items[Math.floor(rand() * inv.state.items.length)];
        inv.updateItem(it.id, { quantity: Math.floor(rand() * 40) });
      }
      ok++;
    } catch (e) {
      assert.ok(e instanceof Inventory.InventoryError, 'непредусмотренная ошибка: ' + e.message);
      rejected++;
    }
    checkInvariant(inv);
  }
  results.randomOk = ok;
  results.randomRejected = rejected;
  assert.ok(ok > 500 && rejected > 100);
});

test.after(() => {
  // Вывод замеров для протокола испытаний
  console.log('PERF ' + JSON.stringify(Object.fromEntries(
    Object.entries(results).map(([k, v]) => [k, typeof v === 'number' && !Number.isInteger(v) ? Number(v.toFixed(1)) : v]))));
});
