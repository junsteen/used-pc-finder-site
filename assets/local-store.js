// -*- coding: utf-8 -*-
// 個人用のローカル機能(閲覧履歴・検索条件プリセット)。
// すべてこの端末のブラウザ内(localStorage)だけで完結し、サーバーには
// 一切送信しない。保存に失敗しても(プライベートブラウジング等)ページ本体の
// 動作は妨げないよう、例外は握りつぶして機能だけを諦める。
(function (global) {
  'use strict';

  var HISTORY_KEY = 'pcfinder:history';
  var HISTORY_MAX = 200;
  var PRESET_KEY = 'pcfinder:presets';
  var PRESET_MAX = 50;

  function safeGet(key) {
    try {
      var raw = localStorage.getItem(key);
      var parsed = raw ? JSON.parse(raw) : [];
      return Array.isArray(parsed) ? parsed : [];
    } catch (e) {
      return [];
    }
  }

  function safeSet(key, value) {
    try {
      localStorage.setItem(key, JSON.stringify(value));
    } catch (e) {
      // 容量超過・プライベートブラウジング等。機能を諦めるだけでよい。
    }
  }

  // --- 閲覧履歴 -----------------------------------------------------------
  // 型番の詳細ページ(pc/*.html・models/*.html)を開いたときに記録する。
  // 出品(個体)は売れると消えるが型番の詳細ページ自体は残り続けるため、
  // 上限を設けないと同じページがいつまでも履歴に居座ることになる。
  function recordView(entry) {
    if (!entry || !entry.href) return;
    var list = safeGet(HISTORY_KEY).filter(function (e) { return e.href !== entry.href; });
    list.unshift({
      href: entry.href,
      title: entry.title || entry.href,
      kind: entry.kind || '',
      viewed_at: new Date().toISOString(),
    });
    if (list.length > HISTORY_MAX) list.length = HISTORY_MAX;
    safeSet(HISTORY_KEY, list);
  }

  function getHistory() {
    return safeGet(HISTORY_KEY);
  }

  function removeHistoryEntry(href) {
    safeSet(HISTORY_KEY, safeGet(HISTORY_KEY).filter(function (e) { return e.href !== href; }));
  }

  function clearHistory() {
    safeSet(HISTORY_KEY, []);
  }

  // --- 検索条件プリセット ---------------------------------------------------
  // 閲覧のたびに自動保存はしない。雑多な組み合わせで埋まって結局使われなく
  // なるため、検索パネルの「この条件を保存」ボタンからの明示的な保存のみ扱う。
  // 条件そのものは既にURLのクエリ文字列に落ちている(index.htmlのsyncUrl())ので、
  // ここではラベルを付けて保存するだけでよい。
  function savePreset(label, query) {
    var list = safeGet(PRESET_KEY);
    list.unshift({
      id: Date.now().toString(36) + Math.random().toString(36).slice(2, 6),
      label: (label || '').trim() || '無題の条件',
      query: query || '',
      saved_at: new Date().toISOString(),
    });
    if (list.length > PRESET_MAX) list.length = PRESET_MAX;
    safeSet(PRESET_KEY, list);
  }

  function getPresets() {
    return safeGet(PRESET_KEY);
  }

  function removePreset(id) {
    safeSet(PRESET_KEY, safeGet(PRESET_KEY).filter(function (p) { return p.id !== id; }));
  }

  global.pcFinder = global.pcFinder || {};
  Object.assign(global.pcFinder, {
    recordView: recordView,
    getHistory: getHistory,
    removeHistoryEntry: removeHistoryEntry,
    clearHistory: clearHistory,
    savePreset: savePreset,
    getPresets: getPresets,
    removePreset: removePreset,
  });
})(window);
