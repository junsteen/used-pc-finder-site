// このページを共有ボタン。対応端末はOS標準の共有シートを開き、
// 非対応(主にデスクトップブラウザ)ではリンクをクリップボードにコピーする。
// history-ui.js の共有リンクコピー(お気に入りアルバム用)と同じ挙動に揃えている。
(function () {
  'use strict';

  function copyToClipboard(text) {
    if (navigator.clipboard && navigator.clipboard.writeText) {
      navigator.clipboard.writeText(text).then(function () {
        alert('リンクをコピーしました');
      }, function () {
        window.prompt('コピーできませんでした。このリンクを手動でコピーしてください:', text);
      });
    } else {
      window.prompt('このリンクをコピーしてください:', text);
    }
  }

  document.addEventListener('click', function (ev) {
    var btn = ev.target.closest('[data-share-url]');
    if (!btn) return;
    var url = btn.dataset.shareUrl;
    var title = btn.dataset.shareTitle || document.title;
    if (navigator.share) {
      navigator.share({ title: title, url: url }).catch(function () {});
    } else {
      copyToClipboard(url);
    }
  });
})();
