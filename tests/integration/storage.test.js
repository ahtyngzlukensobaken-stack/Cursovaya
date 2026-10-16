/**
 * Интеграционные тесты: взаимодействие бизнес-логики (Inventory) с модулем хранения (Store).
 */
const test = require('node:test');
const assert = require('node:assert/strict');
const Inventory = require('../../js/inventory.js');
const Store = require('../../js/storage.js');

function fill(inv) {
  const it = inv.addItem({ code: 'МУЛ-004', name: 'Мультиметр цифровой', quantity: 10 });
  const r = inv.addRecipient({ fullName: 'Ким Виктория Олеговна', department: 'Лаборатория' });
  const iss = inv.issueItem({ itemId: it.id, recipientId: r.id, quantity: 4, issueDate: '2026-10-01', dueDate: '2026-10-08' });
  inv.returnItem({ issueId: iss.id, quantity: 1, returnDate: '2026-10-05' });
  return { it, r, iss };
}

test('ТС-И01: данные автоматически сохраняются и восстанавливаются после перезапуска', () => {
  const adapter = Store.MemoryAdapter();
  const inv1 = new Store(adapter).openInventory();
  fill(inv1);
  const inv2 = new Store(adapter).openInventory();
  assert.deepEqual(inv2.toJSON(), inv1.toJSON());
  assert.equal(inv2.findItem(1).available, 7);
  assert.equal(inv2.findIssue(1).status, 'partial');
});

test('ТС-И02: после перезапуска нумерация документов продолжается без повторов', () => {
  const adapter = Store.MemoryAdapter();
  const inv1 = new Store(adapter).openInventory();
  fill(inv1);
  const inv2 = new Store(adapter).openInventory();
  const iss = inv2.issueItem({ itemId: 1, recipientId: 1, quantity: 1, issueDate: '2026-10-06' });
  assert.equal(iss.number, 'В-000002');
  const third = new Store(adapter).openInventory();
  assert.equal(third.state.issues.length, 2);
});

test('ТС-И03: пустое хранилище — создаётся новая пустая база', () => {
  const inv = new Store(Store.MemoryAdapter()).openInventory();
  assert.equal(inv.state.items.length, 0);
  assert.equal(inv.state.seq.issue, 0);
});

test('ТС-И04: повреждённые данные не приводят к аварии, создаётся резервная копия', () => {
  const adapter = Store.MemoryAdapter();
  adapter.setItem(Store.DEFAULT_KEY, '{"items": [ broken');
  const store = new Store(adapter);
  const inv = store.openInventory();
  assert.equal(inv.state.items.length, 0);
  assert.match(store.lastError, /повреждены/);
  assert.ok(adapter.keys().some((k) => k.startsWith(Store.DEFAULT_KEY + '-corrupted-')));
});

test('ТС-И05: ошибка записи в хранилище (переполнение) обрабатывается', () => {
  const adapter = Store.MemoryAdapter();
  adapter.setItem = () => { throw new Error('QuotaExceededError'); };
  const store = new Store(adapter);
  assert.equal(store.save({ a: 1 }), false);
  assert.match(store.lastError, /Не удалось сохранить/);
});

test('ТС-И06: экспорт и импорт резервной копии JSON сохраняют все данные', () => {
  const inv = new Inventory();
  fill(inv);
  const text = Store.exportJSON(inv);
  const restored = Store.importJSON(text);
  assert.deepEqual(restored.toJSON(), inv.toJSON());
  assert.equal(restored.getOnHands(1), 3);
});

test('ТС-И07: импорт некорректного файла отклоняется с понятным сообщением', () => {
  assert.throws(() => Store.importJSON('это не json'), /не является корректным JSON/);
  assert.throws(() => Store.importJSON('{"items": []}'), /повреждён/);
  assert.throws(() => Store.importJSON('null'), /повреждён/);
});

test('ТС-И08: хранилище без нужных методов не принимается', () => {
  assert.throws(() => new Store({}), /Не задано хранилище/);
  assert.throws(() => new Store(null), /Не задано хранилище/);
});

test('ТС-И09: очистка хранилища удаляет данные', () => {
  const adapter = Store.MemoryAdapter();
  const store = new Store(adapter);
  fill(store.openInventory());
  store.clear();
  assert.equal(store.load(), null);
});

test('ТС-И10: сквозной сценарий «выдача — частичный возврат — списание — отчёт»', () => {
  const adapter = Store.MemoryAdapter();
  const inv = new Store(adapter).openInventory();
  const drill = inv.addItem({ code: 'ДР-001', name: 'Дрель', quantity: 6 });
  const helmet = inv.addItem({ code: 'КАС-005', name: 'Каска', quantity: 25 });
  const r1 = inv.addRecipient({ fullName: 'Ахметов Ержан' });
  const r2 = inv.addRecipient({ fullName: 'Нурланов Данияр' });
  const i1 = inv.issueItem({ itemId: drill.id, recipientId: r1.id, quantity: 2, issueDate: '2026-10-01', dueDate: '2026-10-05' });
  const i2 = inv.issueItem({ itemId: helmet.id, recipientId: r2.id, quantity: 10, issueDate: '2026-10-02', dueDate: '2026-10-20' });
  inv.returnItem({ issueId: i2.id, quantity: 8, returnDate: '2026-10-10' });
  inv.returnItem({ issueId: i2.id, quantity: 2, returnDate: '2026-10-11', condition: 'damaged' });
  const reloaded = new Store(adapter).openInventory();
  const rep = reloaded.getTurnoverReport('2026-10-01', '2026-10-31');
  assert.deepEqual(rep.map((r) => [r.code, r.issued, r.returned, r.damaged, r.onHands, r.available]), [
    ['ДР-001', 2, 0, 0, 2, 4],
    ['КАС-005', 10, 8, 2, 0, 23]
  ]);
  assert.deepEqual(reloaded.getOverdue('2026-10-16').map((i) => i.number), [i1.number]);
});
