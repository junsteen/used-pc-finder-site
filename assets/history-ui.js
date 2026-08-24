(function () {
  function esc(v) {
    return String(v == null ? '' : v)
      .replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;')
      .replace(/"/g, '&quot;').replace(/'/g, '&#39;');
  }
  function fmt(iso) {
    try {
      return new Date(iso).toLocaleString('ja-JP', {
        year: 'numeric', month: '2-digit', day: '2-digit', hour: '2-digit', minute: '2-digit',
      });
    } catch (e) { return iso; }
  }

  // --- 閲覧履歴 -------------------------------------------------------------
  var KIND_LABEL = { pc: '型番(PC)', model: 'カタログ(スペック)' };
  var historyListEl = document.getElementById('history-list');
  var historyClearBtn = document.getElementById('history-clear');

  function renderHistory() {
    if (!historyListEl || !historyClearBtn) return;
    var items = window.pcFinder ? pcFinder.getHistory() : [];
    if (!items.length) {
      historyListEl.innerHTML = '<p class="queue-empty">まだ閲覧履歴がありません。型番ページ('
        + '検索結果から製品名をクリックした先のページ)を開くとここに記録されます。</p>';
      historyClearBtn.hidden = true;
      return;
    }
    historyClearBtn.hidden = false;
    historyListEl.innerHTML = items.map(function (e) {
      return '<div class="listing">' +
        '<span><a href="' + esc(e.href) + '">' + esc(e.title) + '</a>' +
        '<br><small>' + esc(KIND_LABEL[e.kind] || '') + ' ・ ' + esc(fmt(e.viewed_at)) + '</small></span>' +
        '<button type="button" class="btn-icon" data-remove="' + esc(e.href) +
        '" aria-label="この履歴を削除">&times;</button>' +
        '</div>';
    }).join('');
  }

  if (historyListEl) {
    historyListEl.addEventListener('click', function (ev) {
      var btn = ev.target.closest('[data-remove]');
      if (!btn || !window.pcFinder) return;
      pcFinder.removeHistoryEntry(btn.dataset.remove);
      renderHistory();
    });
  }
  if (historyClearBtn) {
    historyClearBtn.addEventListener('click', function () {
      if (!window.pcFinder || !confirm('閲覧履歴をすべて削除しますか？')) return;
      pcFinder.clearHistory();
      renderHistory();
    });
  }

  // --- お気に入り -----------------------------------------------------------
  // 出品(個体)は売り切れると元のページから消えるため、ここでは保存時点の
  // 情報(タイトル・価格・販売元)をそのまま出す。「現在も出品中か」の確認は
  // しない(このページはlocalStorageの中身を見せるだけで、data.jsonへは
  // 問い合わせない)。
  var favoriteListEl = document.getElementById('favorite-list');
  var favoriteClearBtn = document.getElementById('favorite-clear');

  function yen(n) {
    return (typeof n === 'number') ? '¥' + n.toLocaleString('ja-JP') : '—';
  }

  function renderFavorites() {
    if (!favoriteListEl || !favoriteClearBtn) return;
    var items = window.pcFinder ? pcFinder.getFavorites() : [];
    if (!items.length) {
      favoriteListEl.innerHTML = '<p class="queue-empty">まだお気に入りがありません。検索結果カードのハートボタンで追加できます。</p>';
      favoriteClearBtn.hidden = true;
      return;
    }
    favoriteClearBtn.hidden = false;
    favoriteListEl.innerHTML = items.map(function (f) {
      return '<div class="listing">' +
        '<span><a href="' + esc(f.url) + '" target="_blank" rel="noopener">' + esc(f.title) + '</a>' +
        '<br><small>' + esc(f.source_label || '') + ' ・ ' + yen(f.price_yen) +
        ' ・ ' + esc(fmt(f.favorited_at)) + '</small></span>' +
        '<button type="button" class="btn-icon" data-remove-fav="' + esc(f.key) +
        '" aria-label="お気に入りから削除">&times;</button>' +
        '</div>';
    }).join('');
  }

  if (favoriteListEl) {
    favoriteListEl.addEventListener('click', function (ev) {
      var btn = ev.target.closest('[data-remove-fav]');
      if (!btn || !window.pcFinder) return;
      pcFinder.removeFavorite(btn.dataset.removeFav);
      renderFavorites();
    });
  }
  if (favoriteClearBtn) {
    favoriteClearBtn.addEventListener('click', function () {
      if (!window.pcFinder || !confirm('お気に入りをすべて削除しますか？')) return;
      pcFinder.getFavorites().forEach(function (f) { pcFinder.removeFavorite(f.key); });
      renderFavorites();
    });
  }

  renderHistory();
  renderFavorites();
})();
