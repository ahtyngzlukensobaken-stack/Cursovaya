/**
 * Модуль бизнес-логики учёта выданных и возвращённых товаров.
 * Хранит справочники (товары, получатели) и журналы операций (выдачи, возвраты).
 */
(function (root, factory) {
  if (typeof module === 'object' && module.exports) {
    module.exports = factory(require('./validation.js'));
  } else {
    root.Inventory = factory(root.Validation);
  }
})(typeof self !== 'undefined' ? self : this, function (V) {
  'use strict';

  /** Ошибка предметной области с машинно-читаемым кодом */
  function InventoryError(code, message) {
    this.name = 'InventoryError';
    this.code = code;
    this.message = message;
    this.stack = new Error(message).stack;
  }
  InventoryError.prototype = Object.create(Error.prototype);
  InventoryError.prototype.constructor = InventoryError;

  var CONDITIONS = { good: 'Исправен', damaged: 'Повреждён' };
  var STATUSES = { open: 'Выдан', partial: 'Частично возвращён', closed: 'Возвращён' };

  function check(result, code) {
    if (!result.ok) throw new InventoryError(code || 'VALIDATION', result.error);
    return result.value;
  }

  function pad(n, len) { var s = String(n); while (s.length < len) s = '0' + s; return s; }

  function emptyState() {
    return {
      version: 1,
      seq: { item: 0, recipient: 0, issue: 0, ret: 0 },
      items: [],
      recipients: [],
      issues: [],
      returns: []
    };
  }

  /**
   * @param {object} [state] ранее сохранённое состояние
   * @param {function} [onChange] вызывается после каждого изменения данных
   */
  function Inventory(state, onChange) {
    this.state = state ? Inventory.validateState(state) : emptyState();
    this.onChange = typeof onChange === 'function' ? onChange : null;
  }

  Inventory.InventoryError = InventoryError;
  Inventory.CONDITIONS = CONDITIONS;
  Inventory.STATUSES = STATUSES;

  /** Проверка структуры загружаемых данных (импорт, восстановление) */
  Inventory.validateState = function (s) {
    if (!s || typeof s !== 'object') throw new InventoryError('BAD_DATA', 'Файл данных повреждён');
    var arrays = ['items', 'recipients', 'issues', 'returns'];
    for (var i = 0; i < arrays.length; i++) {
      if (!Array.isArray(s[arrays[i]])) throw new InventoryError('BAD_DATA', 'Файл данных повреждён: нет раздела ' + arrays[i]);
    }
    if (!s.seq || typeof s.seq !== 'object') throw new InventoryError('BAD_DATA', 'Файл данных повреждён: нет счётчиков');
    // Исправление дефекта Д-01..Д-03: проверка ссылочной целостности, счётчиков и баланса остатков
    function bad(msg) { throw new InventoryError('BAD_DATA', 'Файл данных повреждён: ' + msg); }
    function maxId(list) { return list.reduce(function (m, x) { return Math.max(m, x.id); }, 0); }
    var pairs = [['item', 'items'], ['recipient', 'recipients'], ['issue', 'issues'], ['ret', 'returns']];
    pairs.forEach(function (p) {
      if (!(Number(s.seq[p[0]]) >= maxId(s[p[1]]))) bad('счётчик «' + p[0] + '» меньше номера существующей записи');
    });
    var items = {}, recs = {}, issues = {}, onHands = {};
    s.items.forEach(function (i) { items[i.id] = i; onHands[i.id] = 0; });
    s.recipients.forEach(function (r) { recs[r.id] = r; });
    s.issues.forEach(function (iss) {
      if (!items[iss.itemId]) bad('выдача ' + iss.number + ' ссылается на несуществующий товар');
      if (!recs[iss.recipientId]) bad('выдача ' + iss.number + ' ссылается на несуществующего получателя');
      if (!(iss.returnedQty >= 0 && iss.returnedQty <= iss.quantity)) bad('неверное количество возврата в выдаче ' + iss.number);
      issues[iss.id] = iss;
      onHands[iss.itemId] += iss.quantity - iss.returnedQty;
    });
    s.returns.forEach(function (r) {
      if (!issues[r.issueId]) bad('возврат ' + r.id + ' ссылается на несуществующую выдачу');
    });
    s.items.forEach(function (i) {
      if (i.available < 0 || i.total !== i.available + onHands[i.id]) bad('нарушен баланс остатков по товару ' + i.code);
    });
    return s;
  };

  Inventory.prototype._changed = function () {
    if (this.onChange) this.onChange(this.state);
  };

  // ---------------------------------------------------------------- Товары

  Inventory.prototype.findItem = function (id) {
    for (var i = 0; i < this.state.items.length; i++) if (this.state.items[i].id === id) return this.state.items[i];
    return null;
  };

  Inventory.prototype._requireItem = function (id) {
    var it = this.findItem(Number(id));
    if (!it) throw new InventoryError('NOT_FOUND', 'Товар не найден');
    return it;
  };

  /** Количество единиц товара, находящихся на руках у получателей */
  Inventory.prototype.getOnHands = function (itemId) {
    var sum = 0;
    this.state.issues.forEach(function (iss) {
      if (iss.itemId === itemId) sum += iss.quantity - iss.returnedQty;
    });
    return sum;
  };

  Inventory.prototype.addItem = function (data) {
    var code = check(V.parseCode(data.code));
    var name = check(V.parseText(data.name, 'Наименование', 2, 100));
    var unit = check(V.parseText(data.unit || 'шт.', 'Единица измерения', 1, 10));
    var category = check(V.parseOptionalText(data.category, 'Категория', 50));
    var qty = check(V.parseQuantity(data.quantity, 0));
    var dup = this.state.items.some(function (it) { return it.code === code; });
    if (dup) throw new InventoryError('DUPLICATE', 'Товар с артикулом ' + code + ' уже существует');
    var item = {
      id: ++this.state.seq.item,
      code: code,
      name: name,
      unit: unit,
      category: category,
      total: qty,
      available: qty,
      writtenOff: 0
    };
    this.state.items.push(item);
    this._changed();
    return item;
  };

  Inventory.prototype.updateItem = function (id, data) {
    var it = this._requireItem(id);
    var name = data.name !== undefined ? check(V.parseText(data.name, 'Наименование', 2, 100)) : it.name;
    var unit = data.unit !== undefined ? check(V.parseText(data.unit, 'Единица измерения', 1, 10)) : it.unit;
    var category = data.category !== undefined ? check(V.parseOptionalText(data.category, 'Категория', 50)) : it.category;
    var total = it.total;
    if (data.quantity !== undefined) {
      total = check(V.parseQuantity(data.quantity, 0));
      var onHands = this.getOnHands(it.id);
      if (total < onHands) {
        throw new InventoryError('QTY_LESS_THAN_ISSUED',
          'Общее количество не может быть меньше выданного на руки (' + onHands + ')');
      }
    }
    it.name = name; it.unit = unit; it.category = category;
    it.total = total;
    it.available = total - this.getOnHands(it.id);
    this._changed();
    return it;
  };

  Inventory.prototype.deleteItem = function (id) {
    var it = this._requireItem(id);
    var used = this.state.issues.some(function (iss) { return iss.itemId === it.id; });
    if (used) throw new InventoryError('IN_USE', 'Нельзя удалить товар, по которому есть операции выдачи');
    this.state.items = this.state.items.filter(function (x) { return x.id !== it.id; });
    this._changed();
    return true;
  };

  // ------------------------------------------------------------ Получатели

  Inventory.prototype.findRecipient = function (id) {
    for (var i = 0; i < this.state.recipients.length; i++) if (this.state.recipients[i].id === id) return this.state.recipients[i];
    return null;
  };

  Inventory.prototype._requireRecipient = function (id) {
    var r = this.findRecipient(Number(id));
    if (!r) throw new InventoryError('NOT_FOUND', 'Получатель не найден');
    return r;
  };

  Inventory.prototype.addRecipient = function (data) {
    var fullName = check(V.parseText(data.fullName, 'ФИО', 3, 100));
    var department = check(V.parseOptionalText(data.department, 'Подразделение', 100));
    var phone = check(V.parsePhone(data.phone));
    var r = { id: ++this.state.seq.recipient, fullName: fullName, department: department, phone: phone };
    this.state.recipients.push(r);
    this._changed();
    return r;
  };

  Inventory.prototype.deleteRecipient = function (id) {
    var r = this._requireRecipient(id);
    var used = this.state.issues.some(function (iss) { return iss.recipientId === r.id; });
    if (used) throw new InventoryError('IN_USE', 'Нельзя удалить получателя, по которому есть операции выдачи');
    this.state.recipients = this.state.recipients.filter(function (x) { return x.id !== r.id; });
    this._changed();
    return true;
  };

  // --------------------------------------------------------------- Выдача

  Inventory.prototype.findIssue = function (id) {
    for (var i = 0; i < this.state.issues.length; i++) if (this.state.issues[i].id === id) return this.state.issues[i];
    return null;
  };

  /**
   * Выдача товара получателю.
   * data: { itemId, recipientId, quantity, issueDate, dueDate?, note? }
   */
  Inventory.prototype.issueItem = function (data) {
    var item = this._requireItem(data.itemId);
    var rec = this._requireRecipient(data.recipientId);
    var qty = check(V.parseQuantity(data.quantity, 1));
    var issueDate = check(V.parseDate(data.issueDate));
    var dueDate = '';
    if (data.dueDate !== undefined && data.dueDate !== null && String(data.dueDate).trim() !== '') {
      dueDate = check(V.parseDate(data.dueDate));
      if (V.compareDates(dueDate, issueDate) < 0) {
        throw new InventoryError('BAD_DATE', 'Срок возврата не может быть раньше даты выдачи');
      }
    }
    var note = check(V.parseOptionalText(data.note, 'Примечание', 200));
    if (qty > item.available) {
      throw new InventoryError('NOT_ENOUGH', 'Недостаточно товара на складе: доступно ' + item.available + ' ' + item.unit);
    }
    var id = ++this.state.seq.issue;
    var issue = {
      id: id,
      number: 'В-' + pad(id, 6),
      itemId: item.id,
      recipientId: rec.id,
      quantity: qty,
      returnedQty: 0,
      issueDate: issueDate,
      dueDate: dueDate,
      note: note,
      status: 'open'
    };
    item.available -= qty;
    this.state.issues.push(issue);
    this._changed();
    return issue;
  };

  /** Остаток по выдаче, ещё не возвращённый */
  Inventory.prototype.getRemaining = function (issueId) {
    var iss = this.findIssue(Number(issueId));
    if (!iss) throw new InventoryError('NOT_FOUND', 'Выдача не найдена');
    return iss.quantity - iss.returnedQty;
  };

  // --------------------------------------------------------------- Возврат

  /**
   * Возврат товара по документу выдачи.
   * data: { issueId, quantity, returnDate, condition: 'good' | 'damaged', note? }
   * Повреждённые единицы списываются и на склад не поступают.
   */
  Inventory.prototype.returnItem = function (data) {
    var iss = this.findIssue(Number(data.issueId));
    if (!iss) throw new InventoryError('NOT_FOUND', 'Выдача не найдена');
    if (iss.status === 'closed') throw new InventoryError('CLOSED', 'Товар по этой выдаче уже полностью возвращён');
    var qty = check(V.parseQuantity(data.quantity, 1));
    var returnDate = check(V.parseDate(data.returnDate));
    if (V.compareDates(returnDate, iss.issueDate) < 0) {
      throw new InventoryError('BAD_DATE', 'Дата возврата не может быть раньше даты выдачи (' + iss.issueDate + ')');
    }
    var condition = data.condition || 'good';
    if (!CONDITIONS.hasOwnProperty(condition)) throw new InventoryError('VALIDATION', 'Неизвестное состояние товара');
    var note = check(V.parseOptionalText(data.note, 'Примечание', 200));
    var remaining = iss.quantity - iss.returnedQty;
    if (qty > remaining) {
      throw new InventoryError('TOO_MANY', 'Возвращается больше, чем выдано: к возврату не более ' + remaining);
    }
    var item = this.findItem(iss.itemId);
    iss.returnedQty += qty;
    iss.status = iss.returnedQty === iss.quantity ? 'closed' : 'partial';
    if (condition === 'good') {
      item.available += qty;
    } else {
      item.total -= qty;
      item.writtenOff += qty;
    }
    var ret = {
      id: ++this.state.seq.ret,
      issueId: iss.id,
      quantity: qty,
      returnDate: returnDate,
      condition: condition,
      note: note
    };
    this.state.returns.push(ret);
    this._changed();
    return ret;
  };

  // --------------------------------------------------------------- Отчёты

  /** Признак просрочки: срок задан, товар не возвращён полностью, срок < сегодня */
  Inventory.prototype.isOverdue = function (issue, today) {
    return issue.status !== 'closed' && issue.dueDate !== '' && V.compareDates(issue.dueDate, today) < 0;
  };

  Inventory.prototype.getOpenIssues = function () {
    return this.state.issues.filter(function (i) { return i.status !== 'closed'; });
  };

  Inventory.prototype.getOverdue = function (today) {
    var self = this;
    check(V.parseDate(today));
    return this.state.issues.filter(function (i) { return self.isOverdue(i, today); });
  };

  /** Поиск и фильтрация журнала выдач */
  Inventory.prototype.searchIssues = function (opts) {
    opts = opts || {};
    var self = this;
    var text = (opts.text || '').trim().toLowerCase();
    return this.state.issues.filter(function (iss) {
      if (opts.status && opts.status !== 'all') {
        if (opts.status === 'overdue') { if (!self.isOverdue(iss, opts.today)) return false; }
        else if (iss.status !== opts.status) return false;
      }
      if (opts.recipientId && iss.recipientId !== Number(opts.recipientId)) return false;
      if (text) {
        var item = self.findItem(iss.itemId) || {};
        var rec = self.findRecipient(iss.recipientId) || {};
        var hay = [iss.number, item.code, item.name, rec.fullName, rec.department].join(' ').toLowerCase();
        if (hay.indexOf(text) === -1) return false;
      }
      return true;
    });
  };

  /**
   * Оборотная ведомость за период [from; to]:
   * по каждому товару — выдано, возвращено исправным, списано, на руках, на складе.
   */
  Inventory.prototype.getTurnoverReport = function (from, to) {
    from = check(V.parseDate(from));
    to = check(V.parseDate(to));
    if (V.compareDates(from, to) > 0) throw new InventoryError('BAD_DATE', 'Начало периода позже его окончания');
    // Исправление дефекта Д-04: агрегирование за один проход по журналам
    // вместо вложенного перебора «товары × операции» (O(n + m) вместо O(n · m)).
    var acc = {};
    this.state.items.forEach(function (item) { acc[item.id] = { issued: 0, returned: 0, damaged: 0, onHands: 0 }; });
    var issueById = {};
    this.state.issues.forEach(function (i) {
      issueById[i.id] = i;
      var a = acc[i.itemId];
      a.onHands += i.quantity - i.returnedQty;
      if (i.issueDate >= from && i.issueDate <= to) a.issued += i.quantity;
    });
    this.state.returns.forEach(function (r) {
      if (r.returnDate < from || r.returnDate > to) return;
      var a = acc[issueById[r.issueId].itemId];
      if (r.condition === 'good') a.returned += r.quantity; else a.damaged += r.quantity;
    });
    return this.state.items.map(function (item) {
      var a = acc[item.id];
      return {
        itemId: item.id,
        code: item.code,
        name: item.name,
        unit: item.unit,
        issued: a.issued,
        returned: a.returned,
        damaged: a.damaged,
        onHands: a.onHands,
        available: item.available
      };
    });
  };

  /** Задолженность получателя: открытые выдачи и количество на руках */
  Inventory.prototype.getRecipientDebts = function (recipientId) {
    var r = this._requireRecipient(recipientId);
    var self = this;
    var list = this.state.issues.filter(function (i) { return i.recipientId === r.id && i.status !== 'closed'; });
    var total = list.reduce(function (s, i) { return s + (i.quantity - i.returnedQty); }, 0);
    return { recipient: r, issues: list, totalOnHands: total, items: list.map(function (i) { return self.findItem(i.itemId); }) };
  };

  /** Сводные показатели для главной панели */
  Inventory.prototype.getSummary = function (today) {
    var self = this;
    var totalUnits = 0, available = 0;
    this.state.items.forEach(function (i) { totalUnits += i.total; available += i.available; });
    return {
      items: this.state.items.length,
      recipients: this.state.recipients.length,
      totalUnits: totalUnits,
      available: available,
      onHands: totalUnits - available,
      openIssues: this.getOpenIssues().length,
      overdue: today ? this.getOverdue(today).length : 0
    };
  };

  /** Экспорт таблицы в CSV (разделитель «;» для Excel с русской локалью) */
  Inventory.toCSV = function (headers, rows) {
    function esc(v) {
      var s = v === null || v === undefined ? '' : String(v);
      if (/[";\n\r]/.test(s)) s = '"' + s.replace(/"/g, '""') + '"';
      return s;
    }
    var lines = [headers.map(esc).join(';')];
    rows.forEach(function (r) { lines.push(r.map(esc).join(';')); });
    return '﻿' + lines.join('\r\n');
  };

  Inventory.prototype.toJSON = function () {
    return JSON.parse(JSON.stringify(this.state));
  };

  return Inventory;
});
