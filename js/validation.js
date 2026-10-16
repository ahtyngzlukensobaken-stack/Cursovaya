/**
 * Модуль проверки входных данных (валидации).
 * Программа «Учёт выданных и возвращённых товаров».
 * Работает и в браузере (глобальный объект Validation), и в Node.js (module.exports).
 */
(function (root, factory) {
  if (typeof module === 'object' && module.exports) {
    module.exports = factory();
  } else {
    root.Validation = factory();
  }
})(typeof self !== 'undefined' ? self : this, function () {
  'use strict';

  /** Максимально допустимое количество единиц в одной операции и на складе */
  var MAX_QTY = 10000;
  /** Допустимый диапазон лет для дат операций */
  var MIN_YEAR = 2000;
  var MAX_YEAR = 2100;

  function ok(value) { return { ok: true, value: value, error: null }; }
  function fail(error) { return { ok: false, value: null, error: error }; }

  /**
   * Разбор количества. Допустимо целое число от min до MAX_QTY.
   * Принимает число или строку (пробелы по краям отбрасываются).
   */
  function parseQuantity(input, min) {
    if (min === undefined) min = 1;
    if (input === null || input === undefined) return fail('Количество не указано');
    var s = String(input).trim();
    if (s === '') return fail('Количество не указано');
    if (!/^[+-]?\d+$/.test(s)) return fail('Количество должно быть целым числом');
    var n = Number(s);
    if (!Number.isSafeInteger(n)) return fail('Количество слишком велико');
    if (n < min) return fail('Количество должно быть не меньше ' + min);
    if (n > MAX_QTY) return fail('Количество не может превышать ' + MAX_QTY);
    return ok(n);
  }

  /** Проверка даты в формате ГГГГ-ММ-ДД с учётом реального календаря */
  function parseDate(input) {
    if (input === null || input === undefined) return fail('Дата не указана');
    var s = String(input).trim();
    if (s === '') return fail('Дата не указана');
    var m = /^(\d{4})-(\d{2})-(\d{2})$/.exec(s);
    if (!m) return fail('Дата должна быть в формате ГГГГ-ММ-ДД');
    var y = Number(m[1]), mo = Number(m[2]), d = Number(m[3]);
    if (y < MIN_YEAR || y > MAX_YEAR) return fail('Год должен быть в диапазоне ' + MIN_YEAR + '–' + MAX_YEAR);
    if (mo < 1 || mo > 12) return fail('Неверный месяц');
    var daysInMonth = new Date(Date.UTC(y, mo, 0)).getUTCDate();
    if (d < 1 || d > daysInMonth) return fail('Неверный день месяца');
    return ok(s);
  }

  /** Сравнение дат-строк ГГГГ-ММ-ДД: -1, 0, 1 */
  function compareDates(a, b) {
    if (a === b) return 0;
    return a < b ? -1 : 1;
  }

  /** Текстовое поле (наименование, ФИО): обязательное, длина min..max */
  function parseText(input, fieldName, min, max) {
    if (min === undefined) min = 2;
    if (max === undefined) max = 100;
    var s = input === null || input === undefined ? '' : String(input).trim().replace(/\s+/g, ' ');
    if (s.length === 0) return fail('Поле «' + fieldName + '» обязательно для заполнения');
    if (s.length < min) return fail('Поле «' + fieldName + '» должно содержать не менее ' + min + ' символов');
    if (s.length > max) return fail('Поле «' + fieldName + '» должно содержать не более ' + max + ' символов');
    return ok(s);
  }

  /** Необязательное текстовое поле (примечание, отдел) */
  function parseOptionalText(input, fieldName, max) {
    if (max === undefined) max = 200;
    var s = input === null || input === undefined ? '' : String(input).trim().replace(/\s+/g, ' ');
    if (s.length > max) return fail('Поле «' + fieldName + '» должно содержать не более ' + max + ' символов');
    return ok(s);
  }

  /** Артикул (инвентарный код): 2–20 символов, буквы, цифры и дефис */
  function parseCode(input) {
    var s = input === null || input === undefined ? '' : String(input).trim().toUpperCase();
    if (s === '') return fail('Артикул обязателен для заполнения');
    if (!/^[A-ZА-ЯЁ0-9-]{2,20}$/.test(s)) return fail('Артикул: 2–20 символов (буквы, цифры, дефис)');
    return ok(s);
  }

  /** Телефон (необязательный): цифры, пробелы, +, -, скобки; 5–20 символов */
  function parsePhone(input) {
    var s = input === null || input === undefined ? '' : String(input).trim();
    if (s === '') return ok('');
    if (!/^[0-9+\-() ]{5,20}$/.test(s)) return fail('Телефон указан неверно');
    return ok(s);
  }

  return {
    MAX_QTY: MAX_QTY,
    MIN_YEAR: MIN_YEAR,
    MAX_YEAR: MAX_YEAR,
    parseQuantity: parseQuantity,
    parseDate: parseDate,
    compareDates: compareDates,
    parseText: parseText,
    parseOptionalText: parseOptionalText,
    parseCode: parseCode,
    parsePhone: parsePhone
  };
});
