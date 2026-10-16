/**
 * Интеграционные тесты целостности импортируемых данных и масштабируемости отчётов.
 * Добавлены на этапе исследовательского тестирования.
 */
const test = require('node:test');
const assert = require('node:assert/strict');
const Inventory = require('../../js/inventory.js');
const Store = require('../../js/storage.js');

function base() {
  const inv = new Inventory();
  const it = inv.addItem({ code: 'AA-1', name: 'Товар', quantity: 5 });
  const r = inv.addRecipient({ fullName: 'Иванов Иван' });
  inv.issueItem({ itemId: it.id, recipientId: r.id, quantity: 2, issueDate: '2026-10-01' });
  return inv.toJSON();
}

test('ТС-И11: импорт файла, где выдача ссылается на несуществующий товар, отклоняется', () => {
  const s = base();
  s.issues[0].itemId = 99;
  assert.throws(() => Store.importJSON(JSON.stringify(s)), /ссылается на несуществующий товар/);
});

test('ТС-И12: импорт файла с неверным счётчиком документов отклоняется (защита от повторных номеров)', () => {
  const s = base();
  s.seq.issue = 0;
  assert.throws(() => Store.importJSON(JSON.stringify(s)), /счётчик/);
});

test('ТС-И13: импорт файла с нарушенным балансом остатков отклоняется', () => {
  const s = base();
  s.items[0].available = 5; // на руках 2, всего 5 — на складе должно быть 3
  assert.throws(() => Store.importJSON(JSON.stringify(s)), /баланс/);
});

test('ТС-Н03: оборотная ведомость по 5000 товарам и 50000 выдачам — не более 2 с', () => {
  const inv = new Inventory();
  for (let i = 0; i < 5000; i++) inv.addItem({ code: 'P-' + i, name: 'Товар ' + i, quantity: 100 });
  inv.addRecipient({ fullName: 'Получатель' });
  for (let i = 0; i < 50000; i++) {
    inv.issueItem({ itemId: 1 + (i % 5000), recipientId: 1, quantity: 1, issueDate: '2026-10-01' });
  }
  const t0 = performance.now();
  const rep = inv.getTurnoverReport('2026-01-01', '2026-12-31');
  const ms = performance.now() - t0;
  console.log('PERF report5000x50000 ' + ms.toFixed(1) + ' ms');
  assert.equal(rep.length, 5000);
  assert.equal(rep[0].issued, 10);
  assert.ok(ms < 2000, 'ведомость формировалась ' + ms.toFixed(0) + ' мс');
});
