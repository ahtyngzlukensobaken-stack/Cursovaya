/**
 * Модуль пользовательского интерфейса.
 * Связывает формы и таблицы страницы с объектом учёта Inventory.
 */
(function () {
  'use strict';

  function localDate(d) {
    d = d || new Date();
    var m = String(d.getMonth() + 1), day = String(d.getDate());
    return d.getFullYear() + '-' + (m.length < 2 ? '0' + m : m) + '-' + (day.length < 2 ? '0' + day : day);
  }
  function addDays(dateStr, n) {
    var p = dateStr.split('-').map(Number);
    return localDate(new Date(p[0], p[1] - 1, p[2] + n));
  }
  function fmt(dateStr) {
    if (!dateStr) return '—';
    var p = dateStr.split('-');
    return p[2] + '.' + p[1] + '.' + p[0];
  }
  function esc(s) {
    return String(s === null || s === undefined ? '' : s)
      .replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;').replace(/"/g, '&quot;');
  }
  function $(id) { return document.getElementById(id); }

  var params = new URLSearchParams(location.search);
  var TODAY = params.get('today') || localDate();

  var store = new Store(window.localStorage);
  var inv = store.openInventory();

  // ---------------------------------------------------------------- Сообщения
  var toastTimer = null;
  function toast(msg, kind) {
    var t = $('toast');
    t.textContent = msg;
    t.className = 'toast show ' + (kind || '');
    t.setAttribute('data-kind', kind || '');
    clearTimeout(toastTimer);
    toastTimer = setTimeout(function () { t.className = 'toast'; }, 3500);
  }
  function guard(fn) {
    try { fn(); return true; } catch (e) {
      if (e && e.name === 'InventoryError') { toast(e.message, 'error'); return false; }
      throw e;
    }
  }

  // ---------------------------------------------------------------- Вкладки
  function showTab(name) {
    document.querySelectorAll('.tabs button').forEach(function (b) { b.classList.toggle('active', b.dataset.tab === name); });
    document.querySelectorAll('.tab').forEach(function (s) { s.classList.toggle('active', s.id === 'tab-' + name); });
    render();
  }
  $('tabs').addEventListener('click', function (e) {
    var b = e.target.closest('button');
    if (b) showTab(b.dataset.tab);
  });

  // ---------------------------------------------------------------- Отрисовка
  function table(headers, rows, emptyText, rowClass) {
    if (!rows.length) return '<div class="empty">' + esc(emptyText || 'Нет данных') + '</div>';
    var h = '<table><thead><tr>' + headers.map(function (x) {
      return '<th' + (x.num ? ' class="num"' : '') + '>' + esc(x.t || x) + '</th>';
    }).join('') + '</tr></thead><tbody>';
    rows.forEach(function (r, idx) {
      h += '<tr' + (rowClass ? ' class="' + rowClass(idx) + '"' : '') + '>' + r.map(function (c, i) {
        var label = headers[i].t || headers[i];
        var cls = (headers[i].num ? 'num' : '') + (label ? '' : ' cell-actions');
        return '<td data-label="' + esc(label) + '"' + (cls.trim() ? ' class="' + cls.trim() + '"' : '') + '>' + c + '</td>';
      }).join('') + '</tr>';
    });
    return h + '</tbody></table>';
  }

  function statusBadge(iss) {
    if (inv.isOverdue(iss, TODAY)) return '<span class="badge overdue">Просрочен</span>';
    return '<span class="badge ' + iss.status + '">' + Inventory.STATUSES[iss.status] + '</span>';
  }

  function renderSummary() {
    var s = inv.getSummary(TODAY);
    var cards = [
      ['Наименований товаров', s.items], ['Единиц на складе', s.available],
      ['Единиц на руках', s.onHands], ['Просрочено выдач', s.overdue, s.overdue > 0 ? 'bad' : '']
    ];
    $('summary').innerHTML = cards.map(function (c) {
      return '<div class="card ' + (c[2] || '') + '"><div class="v">' + c[1] + '</div><div class="l">' + c[0] + '</div></div>';
    }).join('');
    var od = inv.getOverdue(TODAY);
    $('overdue-list').innerHTML = table(
      ['№', 'Товар', 'Получатель', { t: 'На руках', num: true }, 'Срок', 'Дней просрочки'],
      od.map(function (i) {
        var it = inv.findItem(i.itemId), r = inv.findRecipient(i.recipientId);
        var days = Math.round((Date.parse(TODAY) - Date.parse(i.dueDate)) / 86400000);
        return [esc(i.number), esc(it.name), esc(r.fullName), String(i.quantity - i.returnedQty), fmt(i.dueDate), String(days)];
      }), 'Просроченных возвратов нет');
  }

  function renderItems() {
    var q = ($('item-search').value || '').trim().toLowerCase();
    var list = inv.state.items.filter(function (it) {
      return !q || (it.code + ' ' + it.name + ' ' + it.category).toLowerCase().indexOf(q) !== -1;
    });
    $('items-table').innerHTML = table(
      ['Артикул', 'Наименование', 'Категория', 'Ед.', { t: 'Всего', num: true }, { t: 'На складе', num: true },
        { t: 'На руках', num: true }, { t: 'Списано', num: true }, ''],
      list.map(function (it) {
        return [esc(it.code), esc(it.name), esc(it.category), esc(it.unit), String(it.total), String(it.available),
          String(inv.getOnHands(it.id)), String(it.writtenOff),
          '<button class="link" data-edit-item="' + it.id + '">Изменить</button>' +
          '<button class="link bad" data-del-item="' + it.id + '">Удалить</button>'];
      }), 'Товары ещё не добавлены');
  }

  function renderRecipients() {
    $('recipients-table').innerHTML = table(
      ['ФИО', 'Подразделение', 'Телефон', { t: 'На руках, ед.', num: true }, ''],
      inv.state.recipients.map(function (r) {
        var d = inv.getRecipientDebts(r.id);
        return [esc(r.fullName), esc(r.department), esc(r.phone), String(d.totalOnHands),
          '<button class="link bad" data-del-rec="' + r.id + '">Удалить</button>'];
      }), 'Получатели ещё не добавлены');
  }

  function fillSelect(sel, options, emptyText) {
    var prev = sel.value;
    sel.innerHTML = options.length ? options.map(function (o) {
      return '<option value="' + o.v + '">' + esc(o.t) + '</option>';
    }).join('') : '<option value="">' + esc(emptyText) + '</option>';
    if (prev && options.some(function (o) { return String(o.v) === prev; })) sel.value = prev;
  }

  function renderIssueForm() {
    fillSelect($('issue-item'), inv.state.items.map(function (it) {
      return { v: it.id, t: it.code + ' — ' + it.name + ' (на складе: ' + it.available + ' ' + it.unit + ')' };
    }), 'Нет товаров');
    fillSelect($('issue-rec'), inv.state.recipients.map(function (r) {
      return { v: r.id, t: r.fullName + (r.department ? ' (' + r.department + ')' : '') };
    }), 'Нет получателей');
    if (!$('issue-date').value) $('issue-date').value = TODAY;
    if (!$('issue-due').value) $('issue-due').value = addDays(TODAY, 14);
    var it = inv.findItem(Number($('issue-item').value));
    $('issue-hint').textContent = it ? 'Доступно к выдаче: ' + it.available + ' ' + it.unit : '';
  }

  function renderReturnForm() {
    fillSelect($('return-issue'), inv.getOpenIssues().map(function (i) {
      var it = inv.findItem(i.itemId), r = inv.findRecipient(i.recipientId);
      return { v: i.id, t: i.number + ' от ' + fmt(i.issueDate) + ' · ' + it.name + ' · ' + r.fullName +
        ' · на руках ' + (i.quantity - i.returnedQty) + ' ' + it.unit };
    }), 'Нет невозвращённых выдач');
    if (!$('return-date').value) $('return-date').value = TODAY;
    var iss = inv.findIssue(Number($('return-issue').value));
    $('return-hint').textContent = iss ? 'Ожидается к возврату: ' + (iss.quantity - iss.returnedQty) : '';
  }

  function journalRows() {
    return inv.searchIssues({ text: $('journal-search').value, status: $('journal-status').value, today: TODAY })
      .slice().reverse();
  }

  function renderJournal() {
    var list = journalRows();
    $('journal-table').innerHTML = table(
      ['№', 'Дата выдачи', 'Товар', 'Получатель', { t: 'Выдано', num: true }, { t: 'Возвращено', num: true }, 'Срок', 'Статус'],
      list.map(function (i) {
        var it = inv.findItem(i.itemId), r = inv.findRecipient(i.recipientId);
        return [esc(i.number), fmt(i.issueDate), esc(it.name), esc(r.fullName), String(i.quantity),
          String(i.returnedQty), fmt(i.dueDate), statusBadge(i)];
      }), 'Записей не найдено', function (idx) { return inv.isOverdue(list[idx], TODAY) ? 'overdue' : ''; });
  }

  var lastReport = [];
  function renderReports() {
    if (!$('rep-from').value) $('rep-from').value = TODAY.slice(0, 8) + '01';
    if (!$('rep-to').value) $('rep-to').value = TODAY;
    var ok = guard(function () { lastReport = inv.getTurnoverReport($('rep-from').value, $('rep-to').value); });
    if (!ok) lastReport = [];
    $('report-table').innerHTML = table(
      ['Артикул', 'Наименование', { t: 'Выдано', num: true }, { t: 'Возвращено', num: true },
        { t: 'Списано', num: true }, { t: 'На руках', num: true }, { t: 'На складе', num: true }],
      lastReport.map(function (r) {
        return [esc(r.code), esc(r.name), String(r.issued), String(r.returned), String(r.damaged), String(r.onHands), String(r.available)];
      }), 'Нет данных за период');
    var debts = inv.state.recipients.map(function (r) { return inv.getRecipientDebts(r.id); })
      .filter(function (d) { return d.totalOnHands > 0; });
    $('debts-table').innerHTML = table(
      ['Получатель', 'Подразделение', { t: 'Открытых выдач', num: true }, { t: 'Единиц на руках', num: true }],
      debts.map(function (d) {
        return [esc(d.recipient.fullName), esc(d.recipient.department), String(d.issues.length), String(d.totalOnHands)];
      }), 'Задолженностей нет');
  }

  function render() {
    renderSummary(); renderItems(); renderRecipients(); renderIssueForm();
    renderReturnForm(); renderJournal(); renderReports();
  }

  // ---------------------------------------------------------------- Товары
  function resetItemForm() {
    $('item-form').reset();
    $('item-id').value = '';
    $('item-code').disabled = false;
    $('item-form-title').textContent = 'Новый товар';
  }
  $('item-form').addEventListener('submit', function (e) {
    e.preventDefault();
    var id = $('item-id').value;
    var data = { code: $('item-code').value, name: $('item-name').value, unit: $('item-unit').value,
      category: $('item-category').value, quantity: $('item-qty').value };
    if (guard(function () { if (id) inv.updateItem(Number(id), data); else inv.addItem(data); })) {
      toast(id ? 'Товар изменён' : 'Товар добавлен', 'ok');
      resetItemForm(); render();
    }
  });
  $('item-cancel').addEventListener('click', resetItemForm);
  $('item-search').addEventListener('input', renderItems);
  $('items-table').addEventListener('click', function (e) {
    var ed = e.target.getAttribute('data-edit-item'), del = e.target.getAttribute('data-del-item');
    if (ed) {
      var it = inv.findItem(Number(ed));
      $('item-id').value = it.id; $('item-code').value = it.code; $('item-code').disabled = true;
      $('item-name').value = it.name; $('item-unit').value = it.unit; $('item-category').value = it.category;
      $('item-qty').value = it.total; $('item-form-title').textContent = 'Изменение товара ' + it.code;
      window.scrollTo(0, 0);
    }
    if (del && guard(function () { inv.deleteItem(Number(del)); })) { toast('Товар удалён', 'ok'); render(); }
  });

  // ---------------------------------------------------------------- Получатели
  $('rec-form').addEventListener('submit', function (e) {
    e.preventDefault();
    if (guard(function () {
      inv.addRecipient({ fullName: $('rec-name').value, department: $('rec-dept').value, phone: $('rec-phone').value });
    })) { toast('Получатель добавлен', 'ok'); $('rec-form').reset(); render(); }
  });
  $('recipients-table').addEventListener('click', function (e) {
    var del = e.target.getAttribute('data-del-rec');
    if (del && guard(function () { inv.deleteRecipient(Number(del)); })) { toast('Получатель удалён', 'ok'); render(); }
  });

  // ---------------------------------------------------------------- Выдача / возврат
  $('issue-item').addEventListener('change', renderIssueForm);
  $('issue-form').addEventListener('submit', function (e) {
    e.preventDefault();
    var issue;
    if (guard(function () {
      issue = inv.issueItem({ itemId: $('issue-item').value, recipientId: $('issue-rec').value, quantity: $('issue-qty').value,
        issueDate: $('issue-date').value, dueDate: $('issue-due').value, note: $('issue-note').value });
    })) {
      toast('Оформлена выдача ' + issue.number, 'ok');
      $('issue-qty').value = '1'; $('issue-note').value = '';
      render();
    }
  });
  $('return-issue').addEventListener('change', renderReturnForm);
  $('return-form').addEventListener('submit', function (e) {
    e.preventDefault();
    if (guard(function () {
      inv.returnItem({ issueId: $('return-issue').value, quantity: $('return-qty').value, returnDate: $('return-date').value,
        condition: $('return-cond').value, note: $('return-note').value });
    })) {
      toast('Возврат принят', 'ok');
      $('return-qty').value = '1'; $('return-note').value = '';
      render();
    }
  });

  // ---------------------------------------------------------------- Журнал, отчёты, CSV
  $('journal-search').addEventListener('input', renderJournal);
  $('journal-status').addEventListener('change', renderJournal);
  $('rep-build').addEventListener('click', renderReports);

  function download(name, text, type) {
    var blob = new Blob([text], { type: type || 'text/plain;charset=utf-8' });
    var a = document.createElement('a');
    a.href = URL.createObjectURL(blob); a.download = name;
    document.body.appendChild(a); a.click(); a.remove();
    setTimeout(function () { URL.revokeObjectURL(a.href); }, 1000);
  }
  $('journal-csv').addEventListener('click', function () {
    var rows = journalRows().map(function (i) {
      var it = inv.findItem(i.itemId), r = inv.findRecipient(i.recipientId);
      return [i.number, fmt(i.issueDate), it.code, it.name, r.fullName, i.quantity, i.returnedQty, fmt(i.dueDate),
        inv.isOverdue(i, TODAY) ? 'Просрочен' : Inventory.STATUSES[i.status]];
    });
    download('journal_' + TODAY + '.csv', Inventory.toCSV(
      ['№', 'Дата выдачи', 'Артикул', 'Товар', 'Получатель', 'Выдано', 'Возвращено', 'Срок', 'Статус'], rows), 'text/csv;charset=utf-8');
  });
  $('rep-csv').addEventListener('click', function () {
    download('vedomost_' + TODAY + '.csv', Inventory.toCSV(
      ['Артикул', 'Наименование', 'Выдано', 'Возвращено', 'Списано', 'На руках', 'На складе'],
      lastReport.map(function (r) { return [r.code, r.name, r.issued, r.returned, r.damaged, r.onHands, r.available]; })),
    'text/csv;charset=utf-8');
  });

  // ---------------------------------------------------------------- Данные
  function replaceInventory(newInv) {
    inv = new Inventory(newInv.toJSON(), function (s) { store.save(s); });
    store.save(inv.state);
    render();
  }
  $('backup-save').addEventListener('click', function () {
    download('backup_' + TODAY + '.json', Store.exportJSON(inv), 'application/json');
  });
  $('backup-load').addEventListener('change', function (e) {
    var f = e.target.files[0];
    if (!f) return;
    var reader = new FileReader();
    reader.onload = function () {
      if (guard(function () { replaceInventory(Store.importJSON(reader.result)); })) toast('Данные восстановлены', 'ok');
      e.target.value = '';
    };
    reader.readAsText(f, 'utf-8');
  });
  $('data-clear').addEventListener('click', function () {
    if (!window.confirm('Удалить все данные без возможности восстановления?')) return;
    store.clear();
    replaceInventory(new Inventory());
    toast('Данные очищены', 'ok');
  });
  $('demo-load').addEventListener('click', function () {
    var d = new Inventory();
    var items = [
      ['ДР-001', 'Дрель аккумуляторная Bosch', 'шт.', 'Электроинструмент', 6],
      ['ПЕР-002', 'Перфоратор Makita HR2470', 'шт.', 'Электроинструмент', 4],
      ['УШМ-003', 'Шлифмашина угловая 125 мм', 'шт.', 'Электроинструмент', 5],
      ['МУЛ-004', 'Мультиметр цифровой DT-830', 'шт.', 'Измерительные приборы', 10],
      ['КАС-005', 'Каска защитная', 'шт.', 'Средства защиты', 25],
      ['ПЕР-006', 'Перчатки диэлектрические', 'пар', 'Средства защиты', 30],
      ['УДЛ-007', 'Удлинитель 30 м', 'шт.', 'Электрооборудование', 8]
    ].map(function (a) { return d.addItem({ code: a[0], name: a[1], unit: a[2], category: a[3], quantity: a[4] }); });
    var recs = [
      ['Ахметов Ержан Серикович', 'Монтажный участок', '+7 701 111 22 33'],
      ['Ким Виктория Олеговна', 'Лаборатория', '+7 702 222 33 44'],
      ['Нурланов Данияр Маратович', 'Ремонтный цех', '+7 705 333 44 55'],
      ['Петров Андрей Николаевич', 'Склад', '+7 707 444 55 66']
    ].map(function (a) { return d.addRecipient({ fullName: a[0], department: a[1], phone: a[2] }); });
    var ops = [
      [0, 0, 2, -20, -6], [1, 2, 1, -15, -1], [3, 1, 3, -10, 4], [4, 0, 5, -9, 5],
      [5, 3, 10, -7, 7], [2, 2, 2, -5, 9], [6, 1, 1, -3, 11], [0, 3, 1, -2, 12]
    ];
    var issues = ops.map(function (o) {
      return d.issueItem({ itemId: items[o[0]].id, recipientId: recs[o[1]].id, quantity: o[2],
        issueDate: addDays(TODAY, o[3]), dueDate: addDays(TODAY, o[4]) });
    });
    d.returnItem({ issueId: issues[2].id, quantity: 3, returnDate: addDays(TODAY, -2), condition: 'good' });
    d.returnItem({ issueId: issues[4].id, quantity: 6, returnDate: addDays(TODAY, -1), condition: 'good' });
    d.returnItem({ issueId: issues[4].id, quantity: 1, returnDate: addDays(TODAY, -1), condition: 'damaged', note: 'Порыв' });
    replaceInventory(d);
    toast('Загружены демонстрационные данные', 'ok');
  });

  // ---------------------------------------------------------------- Запуск
  $('today-label').textContent = fmt(TODAY);
  if (store.lastError) toast(store.lastError, 'error');
  render();
  window.__app = { get inventory() { return inv; }, today: TODAY };
})();
