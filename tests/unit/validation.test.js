/**
 * Модульные тесты модуля валидации.
 * Методы проектирования: классы эквивалентности и анализ граничных значений.
 */
const test = require('node:test');
const assert = require('node:assert/strict');
const V = require('../../js/validation.js');

test.describe('Количество (parseQuantity)', () => {
  test('ТС-В01: допустимое значение из середины диапазона', () => {
    assert.deepEqual(V.parseQuantity('5000'), { ok: true, value: 5000, error: null });
  });
  test('ТС-В02: нижняя граница — 1 (допустимо)', () => {
    assert.equal(V.parseQuantity(1).value, 1);
  });
  test('ТС-В03: ниже нижней границы — 0 (недопустимо)', () => {
    const r = V.parseQuantity(0);
    assert.equal(r.ok, false);
    assert.match(r.error, /не меньше 1/);
  });
  test('ТС-В04: верхняя граница — 10000 (допустимо)', () => {
    assert.equal(V.parseQuantity('10000').value, 10000);
  });
  test('ТС-В05: выше верхней границы — 10001 (недопустимо)', () => {
    assert.match(V.parseQuantity('10001').error, /не может превышать 10000/);
  });
  test('ТС-В06: отрицательное число', () => {
    assert.equal(V.parseQuantity('-1').ok, false);
  });
  test('ТС-В07: дробное число', () => {
    assert.match(V.parseQuantity('1.5').error, /целым/);
  });
  test('ТС-В08: нечисловая строка и экспоненциальная запись', () => {
    assert.equal(V.parseQuantity('abc').ok, false);
    assert.equal(V.parseQuantity('1e3').ok, false);
  });
  test('ТС-В09: пустое значение, null, undefined', () => {
    for (const v of ['', '   ', null, undefined]) assert.match(V.parseQuantity(v).error, /не указано/);
  });
  test('ТС-В10: пробелы по краям отбрасываются', () => {
    assert.equal(V.parseQuantity('  7 ').value, 7);
  });
  test('ТС-В11: очень большое число (переполнение)', () => {
    assert.equal(V.parseQuantity('99999999999999999999').ok, false);
  });
  test('ТС-В12: при min = 0 значение 0 допустимо (начальный остаток)', () => {
    assert.equal(V.parseQuantity('0', 0).value, 0);
    assert.equal(V.parseQuantity('-1', 0).ok, false);
  });
});

test.describe('Дата (parseDate)', () => {
  test('ТС-В13: корректная дата', () => {
    assert.equal(V.parseDate('2026-10-16').value, '2026-10-16');
  });
  test('ТС-В14: 29 февраля високосного года — допустимо', () => {
    assert.equal(V.parseDate('2024-02-29').ok, true);
  });
  test('ТС-В15: 29 февраля невисокосного года — недопустимо', () => {
    assert.match(V.parseDate('2023-02-29').error, /день/);
  });
  test('ТС-В16: 31-е число в 30-дневном месяце', () => {
    assert.equal(V.parseDate('2026-04-31').ok, false);
  });
  test('ТС-В17: месяц 00 и 13', () => {
    assert.match(V.parseDate('2026-00-10').error, /месяц/);
    assert.match(V.parseDate('2026-13-01').error, /месяц/);
  });
  test('ТС-В18: границы диапазона лет 2000 и 2100 — допустимо', () => {
    assert.equal(V.parseDate('2000-01-01').ok, true);
    assert.equal(V.parseDate('2100-12-31').ok, true);
  });
  test('ТС-В19: за пределами диапазона лет 1999 и 2101', () => {
    assert.equal(V.parseDate('1999-12-31').ok, false);
    assert.equal(V.parseDate('2101-01-01').ok, false);
  });
  test('ТС-В20: неверный формат (ДД.ММ.ГГГГ, без ведущих нулей, пусто)', () => {
    assert.match(V.parseDate('16.10.2026').error, /формате/);
    assert.equal(V.parseDate('2026-1-5').ok, false);
    assert.match(V.parseDate('').error, /не указана/);
  });
  test('ТС-В21: сравнение дат', () => {
    assert.equal(V.compareDates('2026-01-01', '2026-01-02'), -1);
    assert.equal(V.compareDates('2026-01-02', '2026-01-02'), 0);
    assert.equal(V.compareDates('2026-12-01', '2026-01-31'), 1);
  });
});

test.describe('Текстовые поля, артикул, телефон', () => {
  test('ТС-В22: длина наименования на границах 2 и 100 — допустимо', () => {
    assert.equal(V.parseText('Аб', 'Наименование').ok, true);
    assert.equal(V.parseText('а'.repeat(100), 'Наименование').ok, true);
  });
  test('ТС-В23: длина 1 и 101 — недопустимо', () => {
    assert.match(V.parseText('А', 'Наименование').error, /не менее 2/);
    assert.match(V.parseText('а'.repeat(101), 'Наименование').error, /не более 100/);
  });
  test('ТС-В24: пустое и пробельное значение', () => {
    assert.match(V.parseText('   ', 'ФИО').error, /обязательно/);
  });
  test('ТС-В25: лишние пробелы внутри строки сжимаются', () => {
    assert.equal(V.parseText('  Дрель    ударная ', 'Наименование').value, 'Дрель ударная');
  });
  test('ТС-В26: артикул приводится к верхнему регистру, кириллица допустима', () => {
    assert.equal(V.parseCode('др-001').value, 'ДР-001');
  });
  test('ТС-В27: артикул — границы длины 2/20 и недопустимые символы', () => {
    assert.equal(V.parseCode('A').ok, false);
    assert.equal(V.parseCode('AB').ok, true);
    assert.equal(V.parseCode('A'.repeat(20)).ok, true);
    assert.equal(V.parseCode('A'.repeat(21)).ok, false);
    assert.equal(V.parseCode('AB CD').ok, false);
    assert.equal(V.parseCode('AB_1').ok, false);
  });
  test('ТС-В28: телефон — пустой допустим, буквы недопустимы', () => {
    assert.equal(V.parsePhone('').ok, true);
    assert.equal(V.parsePhone('+7 (701) 123-45-67').ok, true);
    assert.equal(V.parsePhone('телефон').ok, false);
    assert.equal(V.parsePhone('1234').ok, false);
  });
  test('ТС-В29: необязательное поле — превышение длины', () => {
    assert.equal(V.parseOptionalText('', 'Примечание').ok, true);
    assert.equal(V.parseOptionalText('x'.repeat(201), 'Примечание').ok, false);
  });
});
