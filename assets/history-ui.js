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
  function yen(n) {
    return (typeof n === 'number') ? '¥' + n.toLocaleString('ja-JP') : '—';
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
  // 問い合わせない)。チェックボックスはアルバム作成の選択に使う。
  var favoriteListEl = document.getElementById('favorite-list');
  var favoriteClearBtn = document.getElementById('favorite-clear');
  var albumCreateBtn = document.getElementById('album-create');

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
        '<label class="fav-select"><input type="checkbox" data-fav-select="' + esc(f.key) + '"></label>' +
        '<span class="listing-text"><a href="' + esc(f.url) + '" target="_blank" rel="noopener">' + esc(f.title) + '</a>' +
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

  // --- アルバム -------------------------------------------------------------
  // お気に入りチェックボックスで選んだキーからアルバムを作る。共有リンクは
  // サーバー側の登録先を持たない(静的サイトのため)ので、URLに実際の
  // 「店舗+出品ID」をそのまま埋め込む。開いた人はログイン不要で見られる代わり、
  // 出品が売り切れて消えていれば「見つかりませんでした」と表示される。
  var SOURCE_CODE = { rakuten: 'r', yahoo_shopping: 'y', sofmap: 's', dospara: 'd', pc_koubou: 'p', janpara: 'j' };
  var CODE_SOURCE = {};
  Object.keys(SOURCE_CODE).forEach(function (s) { CODE_SOURCE[SOURCE_CODE[s]] = s; });

  function encodeKey(key) {
    var i = key.indexOf(':');
    var source = key.slice(0, i), listingId = key.slice(i + 1);
    var code = SOURCE_CODE[source];
    return code ? code + ':' + listingId : null;
  }

  function decodeItem(pair) {
    var i = pair.indexOf(':');
    var code = pair.slice(0, i), listingId = pair.slice(i + 1);
    var source = CODE_SOURCE[code];
    return source ? { source: source, listing_id: listingId } : null;
  }

  function buildShareUrl(album) {
    var encoded = album.keys.map(encodeKey).filter(Boolean);
    var p = new URLSearchParams();
    p.set('album', album.name);
    p.set('items', encoded.join(','));
    return location.origin + location.pathname + '?' + p.toString();
  }

  function copyToClipboard(text) {
    if (navigator.clipboard && navigator.clipboard.writeText) {
      navigator.clipboard.writeText(text).then(function () {
        alert('共有リンクをコピーしました');
      }, function () {
        window.prompt('コピーできませんでした。このリンクを手動でコピーしてください:', text);
      });
    } else {
      window.prompt('このリンクをコピーしてください:', text);
    }
  }

  var albumListEl = document.getElementById('album-list');

  function renderAlbums() {
    if (!albumListEl) return;
    var albums = window.pcFinder ? pcFinder.getAlbums() : [];
    if (!albums.length) {
      albumListEl.innerHTML = '<p class="queue-empty">まだアルバムがありません。お気に入りにチェックを付けて「アルバムを作る」から作成できます。</p>';
      return;
    }
    albumListEl.innerHTML = albums.map(function (a) {
      return '<div class="listing">' +
        '<span><b>' + esc(a.name) + '</b>' +
        '<br><small>' + a.keys.length + '件 ・ ' + esc(fmt(a.created_at)) + '</small></span>' +
        '<span class="row-tags">' +
        '<button type="button" class="btn-icon" data-share-album="' + esc(a.id) + '" aria-label="共有リンクをコピー">🔗</button>' +
        '<button type="button" class="btn-icon" data-rename-album="' + esc(a.id) + '" aria-label="名前を変更">✎</button>' +
        '<button type="button" class="btn-icon" data-delete-album="' + esc(a.id) + '" aria-label="アルバムを削除">&times;</button>' +
        '</span></div>';
    }).join('');
  }

  if (albumCreateBtn) {
    albumCreateBtn.addEventListener('click', function () {
      if (!window.pcFinder) return;
      var checked = favoriteListEl
        ? [].slice.call(favoriteListEl.querySelectorAll('[data-fav-select]:checked'))
        : [];
      if (!checked.length) {
        alert('お気に入りの中からアルバムに入れたい項目にチェックを付けてください。');
        return;
      }
      var name = window.prompt('アルバムの名前を付けてください(例: セレクトした15件のノートPC一覧)');
      if (name === null) return;
      var keys = checked.map(function (c) { return c.dataset.favSelect; });
      pcFinder.createAlbum(name, keys);
      renderAlbums();
    });
  }

  if (albumListEl) {
    albumListEl.addEventListener('click', function (ev) {
      if (!window.pcFinder) return;
      var shareBtn = ev.target.closest('[data-share-album]');
      if (shareBtn) {
        var album = pcFinder.getAlbums().filter(function (a) { return a.id === shareBtn.dataset.shareAlbum; })[0];
        if (album) copyToClipboard(buildShareUrl(album));
        return;
      }
      var renameBtn = ev.target.closest('[data-rename-album]');
      if (renameBtn) {
        var newName = window.prompt('新しい名前を入力してください');
        if (newName !== null) pcFinder.renameAlbum(renameBtn.dataset.renameAlbum, newName);
        renderAlbums();
        return;
      }
      var deleteBtn = ev.target.closest('[data-delete-album]');
      if (deleteBtn) {
        if (confirm('このアルバムを削除しますか？(お気に入り自体は消えません)')) {
          pcFinder.deleteAlbum(deleteBtn.dataset.deleteAlbum);
          renderAlbums();
        }
      }
    });
  }

  // --- 共有されたアルバムの表示 -----------------------------------------------
  // ?items=... がある場合だけ、data.jsonを取得して現在も出品中のものだけ
  // 突き合わせて表示する。ログイン・localStorage無しの初見の相手でも見られる。
  function renderSharedAlbum() {
    var params = new URLSearchParams(location.search);
    var itemsParam = params.get('items');
    if (!itemsParam) return;

    var section = document.getElementById('shared-album-section');
    var titleEl = document.getElementById('shared-album-title');
    var noteEl = document.getElementById('shared-album-note');
    var listEl = document.getElementById('shared-album-list');
    if (!section || !listEl) return;

    var albumName = params.get('album');
    titleEl.textContent = albumName ? '共有されたアルバム: ' + albumName : '共有されたアルバム';
    section.hidden = false;
    listEl.innerHTML = '<p class="queue-empty">読み込み中…</p>';

    var wanted = itemsParam.split(',').map(decodeItem).filter(Boolean);

    fetch('data.json').then(function (r) { return r.json(); }).then(function (data) {
      var byKey = {};
      (data.listings || []).forEach(function (l) {
        byKey[l.source + ':' + l.listing_id] = l;
      });
      var found = 0, rows = wanted.map(function (w) {
        var l = byKey[w.source + ':' + w.listing_id];
        if (!l) {
          return '<div class="listing"><span class="muted">見つかりませんでした(売り切れ・掲載終了の可能性があります)</span></div>';
        }
        found++;
        return '<div class="listing">' +
          '<span><a href="' + esc(l.url) + '" target="_blank" rel="noopener">' + esc(l.title) + '</a>' +
          '<br><small>' + esc(l.source_label || '') + ' ・ ' + yen(l.price_yen) + '</small></span>' +
          '</div>';
      });
      noteEl.textContent = wanted.length + '件中 ' + found + '件が現在も出品中です。';
      listEl.innerHTML = rows.join('') || '<p class="queue-empty">項目がありません。</p>';
    }).catch(function () {
      listEl.innerHTML = '<p class="queue-empty">読み込みに失敗しました。</p>';
    });
  }

  renderHistory();
  renderFavorites();
  renderAlbums();
  renderSharedAlbum();
})();
