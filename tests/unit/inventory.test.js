/**
 * Модульные тесты бизнес-логики (класс Inventory).
 */
const test = require('node:test');
const assert = require('node:assert/strict');
const Inventory = require('../../js/inventory.js');

/** Подготовка типовых данных: один товар (10 шт.) и один получатель */
function setup(qty = 10) {
  const inv = new Inventory();
  const item = inv.addItem({ code: 'ДР-001', name: 'Дрель аккумуляторная', unit: 'шт.', category: 'Инструмент', quantity: qty });
  const rec = inv.addRecipient({ fullName: 'Ахметов Ержан Серикович', department: 'Монтажный участок', phone: '+7 701 111 22 33' });
  return { inv, item, rec };
}
function issue(inv, item, rec, qty, issueDate = '2026-10-01', dueDate = '2026-10-10') {
  return inv.issueItem({ itemId: item.id, recipientId: rec.id, quantity: qty, issueDate, dueDate });
}
function errCode(code) {
  return (e) => e instanceof Inventory.InventoryError && e.code === code;
}

test.describe('Справочник товаров', () => {
  test('ТС-Т01: добавление товара с корректными данными', () => {
    const { item } = setup();
    assert.equal(item.id, 1);
    assert.equal(item.code, 'ДР-001');
    assert.equal(item.total, 10);
    assert.equal(item.available, 10);
    assert.equal(item.writtenOff, 0);
  });
  test('ТС-Т02: повторный артикул (в другом регистре) отклоняется', () => {
    const { inv } = setup();
    assert.throws(() => inv.addItem({ code: 'др-001', name: 'Другая дрель', quantity: 1 }), errCode('DUPLICATE'));
  });
  test('ТС-Т03: добавление товара с некорректными полями', () => {
    const inv = new Inventory();
    assert.throws(() => inv.addItem({ code: '', name: 'Дрель', quantity: 1 }), errCode('VALIDATION'));
    assert.throws(() => inv.addItem({ code: 'AA', name: 'Д', quantity: 1 }), errCode('VALIDATION'));
    assert.throws(() => inv.addItem({ code: 'AA', name: 'Дрель', quantity: -5 }), errCode('VALIDATION'));
    assert.equal(inv.state.items.length, 0, 'ошибочные записи не должны сохраняться');
  });
  test('ТС-Т04: изменение количества товара пересчитывает остаток на складе', () => {
    const { inv, item, rec } = setup();
    issue(inv, item, rec, 3);
    inv.updateItem(item.id, { quantity: 15 });
    assert.equal(item.total, 15);
    assert.equal(item.available, 12);
  });
  test('ТС-Т05: общее количество нельзя сделать меньше выданного на руки', () => {
    const { inv, item, rec } = setup();
    issue(inv, item, rec, 4);
    assert.throws(() => inv.updateItem(item.id, { quantity: 3 }), errCode('QTY_LESS_THAN_ISSUED'));
    inv.updateItem(item.id, { quantity: 4 }); // граница: равно выданному
    assert.equal(item.available, 0);
  });
  test('ТС-Т06: удаление товара без операций разрешено, с операциями — запрещено', () => {
    const { inv, item, rec } = setup();
    const other = inv.addItem({ code: 'КАС-1', name: 'Каска', quantity: 2 });
    assert.equal(inv.deleteItem(other.id), true);
    issue(inv, item, rec, 1);
    assert.throws(() => inv.deleteItem(item.id), errCode('IN_USE'));
    assert.throws(() => inv.deleteItem(999), errCode('NOT_FOUND'));
  });
});

test.describe('Справочник получателей', () => {
  test('ТС-Т07: добавление получателя и проверка обязательного ФИО', () => {
    const inv = new Inventory();
    const r = inv.addRecipient({ fullName: '  Ким   Виктория ', department: '', phone: '' });
    assert.equal(r.fullName, 'Ким Виктория');
    assert.throws(() => inv.addRecipient({ fullName: 'Ки' }), errCode('VALIDATION'));
    assert.throws(() => inv.addRecipient({ fullName: 'Ким Виктория', phone: 'abc' }), errCode('VALIDATION'));
  });
  test('ТС-Т08: удаление получателя, у которого были выдачи, запрещено', () => {
    const { inv, item, rec } = setup();
    issue(inv, item, rec, 1);
    assert.throws(() => inv.deleteRecipient(rec.id), errCode('IN_USE'));
    const r2 = inv.addRecipient({ fullName: 'Петров Андрей' });
    assert.equal(inv.deleteRecipient(r2.id), true);
  });
});

test.describe('Выдача товара', () => {
  test('ТС-Т09: выдача уменьшает остаток на складе и создаёт документ', () => {
    const { inv, item, rec } = setup();
    const iss = issue(inv, item, rec, 3);
    assert.equal(iss.number, 'В-000001');
    assert.equal(iss.status, 'open');
    assert.equal(item.available, 7);
    assert.equal(inv.getOnHands(item.id), 3);
  });
  test('ТС-Т10: выдача всего остатка (граничное значение) разрешена', () => {
    const { inv, item, rec } = setup();
    issue(inv, item, rec, 10);
    assert.equal(item.available, 0);
  });
  test('ТС-Т11: выдача больше остатка запрещена, остаток не меняется', () => {
    const { inv, item, rec } = setup();
    assert.throws(() => issue(inv, item, rec, 11), errCode('NOT_ENOUGH'));
    assert.equal(item.available, 10);
    assert.equal(inv.state.issues.length, 0);
  });
  test('ТС-Т12: выдача несуществующего товара или несуществующему получателю', () => {
    const { inv, item, rec } = setup();
    assert.throws(() => inv.issueItem({ itemId: 99, recipientId: rec.id, quantity: 1, issueDate: '2026-10-01' }), errCode('NOT_FOUND'));
    assert.throws(() => inv.issueItem({ itemId: item.id, recipientId: 99, quantity: 1, issueDate: '2026-10-01' }), errCode('NOT_FOUND'));
  });
  test('ТС-Т13: срок возврата раньше даты выдачи — ошибка; равен дате выдачи — допустимо', () => {
    const { inv, item, rec } = setup();
    assert.throws(() => issue(inv, item, rec, 1, '2026-10-05', '2026-10-04'), errCode('BAD_DATE'));
    const iss = issue(inv, item, rec, 1, '2026-10-05', '2026-10-05');
    assert.equal(iss.dueDate, '2026-10-05');
  });
  test('ТС-Т14: срок возврата необязателен', () => {
    const { inv, item, rec } = setup();
    const iss = inv.issueItem({ itemId: item.id, recipientId: rec.id, quantity: 1, issueDate: '2026-10-05', dueDate: '' });
    assert.equal(iss.dueDate, '');
  });
  test('ТС-Т15: идентификаторы из формы (строки) принимаются', () => {
    const { inv, item, rec } = setup();
    const iss = inv.issueItem({ itemId: String(item.id), recipientId: String(rec.id), quantity: '2', issueDate: '2026-10-05' });
    assert.equal(iss.quantity, 2);
  });
});

test.describe('Возврат товара', () => {
  test('ТС-Т16: частичный возврат меняет статус на «частично возвращён»', () => {
    const { inv, item, rec } = setup();
    const iss = issue(inv, item, rec, 5);
    inv.returnItem({ issueId: iss.id, quantity: 2, returnDate: '2026-10-03', condition: 'good' });
    assert.equal(iss.status, 'partial');
    assert.equal(inv.getRemaining(iss.id), 3);
    assert.equal(item.available, 7);
  });
  test('ТС-Т17: полный возврат закрывает выдачу', () => {
    const { inv, item, rec } = setup();
    const iss = issue(inv, item, rec, 5);
    inv.returnItem({ issueId: iss.id, quantity: 2, returnDate: '2026-10-03' });
    inv.returnItem({ issueId: iss.id, quantity: 3, returnDate: '2026-10-04' });
    assert.equal(iss.status, 'closed');
    assert.equal(item.available, 10);
  });
  test('ТС-Т18: возврат больше, чем на руках, запрещён', () => {
    const { inv, item, rec } = setup();
    const iss = issue(inv, item, rec, 5);
    assert.throws(() => inv.returnItem({ issueId: iss.id, quantity: 6, returnDate: '2026-10-03' }), errCode('TOO_MANY'));
    assert.equal(item.available, 5);
  });
  test('ТС-Т19: повторный возврат по закрытой выдаче запрещён', () => {
    const { inv, item, rec } = setup();
    const iss = issue(inv, item, rec, 1);
    inv.returnItem({ issueId: iss.id, quantity: 1, returnDate: '2026-10-03' });
    assert.throws(() => inv.returnItem({ issueId: iss.id, quantity: 1, returnDate: '2026-10-03' }), errCode('CLOSED'));
  });
  test('ТС-Т20: дата возврата раньше даты выдачи запрещена; в тот же день — допустимо', () => {
    const { inv, item, rec } = setup();
    const iss = issue(inv, item, rec, 2, '2026-10-05');
    assert.throws(() => inv.returnItem({ issueId: iss.id, quantity: 1, returnDate: '2026-10-04' }), errCode('BAD_DATE'));
    inv.returnItem({ issueId: iss.id, quantity: 1, returnDate: '2026-10-05' });
    assert.equal(iss.returnedQty, 1);
  });
  test('ТС-Т21: повреждённый товар списывается и не возвращается на склад', () => {
    const { inv, item, rec } = setup();
    const iss = issue(inv, item, rec, 4);
    inv.returnItem({ issueId: iss.id, quantity: 1, returnDate: '2026-10-03', condition: 'damaged' });
    assert.equal(item.available, 6);
    assert.equal(item.total, 9);
    assert.equal(item.writtenOff, 1);
    assert.equal(inv.getOnHands(item.id), 3);
  });
  test('ТС-Т22: неизвестное состояние товара и несуществующая выдача', () => {
    const { inv, item, rec } = setup();
    const iss = issue(inv, item, rec, 1);
    assert.throws(() => inv.returnItem({ issueId: iss.id, quantity: 1, returnDate: '2026-10-03', condition: 'lost' }), errCode('VALIDATION'));
    assert.throws(() => inv.returnItem({ issueId: 42, quantity: 1, returnDate: '2026-10-03' }), errCode('NOT_FOUND'));
  });
  test('ТС-Т23: после списания можно изменить общее количество без ошибок учёта', () => {
    const { inv, item, rec } = setup();
    const iss = issue(inv, item, rec, 4);
    inv.returnItem({ issueId: iss.id, quantity: 2, returnDate: '2026-10-03', condition: 'damaged' });
    inv.updateItem(item.id, { name: 'Дрель аккумуляторная 18В' });
    assert.equal(item.total, 8);
    assert.equal(item.available, 6);
  });
});

test.describe('Отчёты и поиск', () => {
  function sample() {
    const { inv, item, rec } = setup();
    const rec2 = inv.addRecipient({ fullName: 'Ким Виктория Олеговна', department: 'Лаборатория' });
    const a = issue(inv, item, rec, 2, '2026-10-01', '2026-10-10'); // просрочена на 16.10
    const b = issue(inv, item, rec2, 1, '2026-10-02', '2026-10-16'); // срок сегодня — не просрочена
    const c = issue(inv, item, rec2, 1, '2026-10-03', '');           // без срока
    const d = issue(inv, item, rec, 1, '2026-09-20', '2026-09-25');  // возвращена
    inv.returnItem({ issueId: d.id, quantity: 1, returnDate: '2026-09-30' });
    return { inv, item, rec, rec2, a, b, c, d };
  }
  test('ТС-Т24: просроченные выдачи — срок раньше сегодняшней даты', () => {
    const { inv, a } = sample();
    const od = inv.getOverdue('2026-10-16');
    assert.deepEqual(od.map((i) => i.id), [a.id]);
  });
  test('ТС-Т25: выдача со сроком «сегодня» становится просроченной только завтра', () => {
    const { inv, b } = sample();
    assert.equal(inv.isOverdue(b, '2026-10-16'), false);
    assert.equal(inv.isOverdue(b, '2026-10-17'), true);
  });
  test('ТС-Т26: оборотная ведомость — границы периода включаются', () => {
    const { inv, item } = sample();
    const rep = inv.getTurnoverReport('2026-10-01', '2026-10-03').find((r) => r.itemId === item.id);
    assert.equal(rep.issued, 4);
    assert.equal(rep.returned, 0);
    assert.equal(rep.onHands, 4);
    const sep = inv.getTurnoverReport('2026-09-01', '2026-09-30').find((r) => r.itemId === item.id);
    assert.equal(sep.issued, 1);
    assert.equal(sep.returned, 1);
  });
  test('ТС-Т27: ведомость — начало периода позже конца', () => {
    const { inv } = sample();
    assert.throws(() => inv.getTurnoverReport('2026-10-10', '2026-10-01'), errCode('BAD_DATE'));
  });
  test('ТС-Т28: поиск по тексту и фильтр по статусу', () => {
    const { inv, a } = sample();
    assert.equal(inv.searchIssues({ text: 'ким' }).length, 2);
    assert.equal(inv.searchIssues({ text: 'лаборатория' }).length, 2);
    assert.equal(inv.searchIssues({ text: 'В-000004' }).length, 1);
    assert.equal(inv.searchIssues({ status: 'closed' }).length, 1);
    assert.deepEqual(inv.searchIssues({ status: 'overdue', today: '2026-10-16' }).map((i) => i.id), [a.id]);
    assert.equal(inv.searchIssues({ status: 'all' }).length, 4);
  });
  test('ТС-Т29: задолженность получателя', () => {
    const { inv, rec, rec2 } = sample();
    assert.equal(inv.getRecipientDebts(rec.id).totalOnHands, 2);
    assert.equal(inv.getRecipientDebts(rec2.id).totalOnHands, 2);
  });
  test('ТС-Т30: сводные показатели', () => {
    const { inv } = sample();
    const s = inv.getSummary('2026-10-16');
    assert.deepEqual(s, { items: 1, recipients: 2, totalUnits: 10, available: 6, onHands: 4, openIssues: 3, overdue: 1 });
  });
  test('ТС-Т31: экспорт в CSV экранирует разделители и кавычки', () => {
    const csv = Inventory.toCSV(['A', 'B'], [['x;y', 'Дрель "Bosch"'], [1, null]]);
    assert.equal(csv, '﻿A;B\r\n"x;y";"Дрель ""Bosch"""\r\n1;');
  });
  test('ТС-Т32: после каждого изменения вызывается обработчик сохранения', () => {
    let calls = 0;
    const inv = new Inventory(null, () => calls++);
    const it = inv.addItem({ code: 'AA', name: 'Товар', quantity: 1 });
    const r = inv.addRecipient({ fullName: 'Иванов Иван' });
    inv.issueItem({ itemId: it.id, recipientId: r.id, quantity: 1, issueDate: '2026-10-01' });
    assert.equal(calls, 3);
    assert.throws(() => inv.addItem({ code: 'AA', name: 'Дубль', quantity: 1 }));
    assert.equal(calls, 3, 'при ошибке сохранение не вызывается');
  });
  test('ТС-Т33: загрузка повреждённой структуры данных отклоняется', () => {
    assert.throws(() => new Inventory({ items: [] }), errCode('BAD_DATA'));
    assert.throws(() => new Inventory({ items: [], recipients: [], issues: [], returns: [] }), errCode('BAD_DATA'));
  });
});
