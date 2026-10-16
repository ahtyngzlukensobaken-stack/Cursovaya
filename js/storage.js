/**
 * Модуль хранения данных.
 * В браузере используется localStorage; в тестах подставляется объект-заглушка
 * с теми же методами getItem / setItem / removeItem.
 */
(function (root, factory) {
  if (typeof module === 'object' && module.exports) {
    module.exports = factory(require('./inventory.js'));
  } else {
    root.Store = factory(root.Inventory);
  }
})(typeof self !== 'undefined' ? self : this, function (Inventory) {
  'use strict';

  var DEFAULT_KEY = 'uchet-vydachi-v1';

  function Store(adapter, key) {
    if (!adapter || typeof adapter.getItem !== 'function' || typeof adapter.setItem !== 'function') {
      throw new Error('Не задано хранилище данных');
    }
    this.adapter = adapter;
    this.key = key || DEFAULT_KEY;
    this.lastError = null;
  }

  /** Загрузка состояния. При повреждённых данных возвращает null и сохраняет копию */
  Store.prototype.load = function () {
    this.lastError = null;
    var raw = this.adapter.getItem(this.key);
    if (raw === null || raw === undefined || raw === '') return null;
    try {
      var state = JSON.parse(raw);
      return Inventory.validateState(state);
    } catch (e) {
      this.lastError = 'Сохранённые данные повреждены, создана резервная копия';
      this.adapter.setItem(this.key + '-corrupted-' + Date.now(), raw);
      return null;
    }
  };

  /** Сохранение состояния; возвращает true при успехе */
  Store.prototype.save = function (state) {
    try {
      this.adapter.setItem(this.key, JSON.stringify(state));
      this.lastError = null;
      return true;
    } catch (e) {
      this.lastError = 'Не удалось сохранить данные: ' + e.message;
      return false;
    }
  };

  Store.prototype.clear = function () {
    if (typeof this.adapter.removeItem === 'function') this.adapter.removeItem(this.key);
  };

  /** Создание объекта учёта, связанного с хранилищем (автосохранение) */
  Store.prototype.openInventory = function () {
    var self = this;
    var state = this.load();
    return new Inventory(state, function (s) { self.save(s); });
  };

  /** Резервная копия в виде JSON-текста */
  Store.exportJSON = function (inventory) {
    return JSON.stringify(inventory.toJSON(), null, 2);
  };

  /** Восстановление из JSON-текста; при ошибке бросает InventoryError */
  Store.importJSON = function (text) {
    var state;
    try {
      state = JSON.parse(text);
    } catch (e) {
      throw new Inventory.InventoryError('BAD_DATA', 'Файл не является корректным JSON');
    }
    return new Inventory(Inventory.validateState(state));
  };

  /** Простая реализация хранилища в памяти (для тестов) */
  Store.MemoryAdapter = function () {
    var data = {};
    return {
      getItem: function (k) { return Object.prototype.hasOwnProperty.call(data, k) ? data[k] : null; },
      setItem: function (k, v) { data[k] = String(v); },
      removeItem: function (k) { delete data[k]; },
      keys: function () { return Object.keys(data); }
    };
  };

  Store.DEFAULT_KEY = DEFAULT_KEY;
  return Store;
});
