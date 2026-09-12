// このページを共有ボタン。対応端末はOS標準の共有シートを開き、
// 非対応(主にデスクトップブラウザ)ではリンクをクリップボードにコピーする。
// copyToClipboardはpcFinder名前空間経由でhistory-ui.js(お気に入りアルバム共有)
// からも使う。全ページ共通で読み込まれるのはこのファイルのため、ここに置く。
(function (global) {
  'use strict';

  function copyToClipboard(text, message) {
    message = message || 'リンクをコピーしました';
    if (navigator.clipboard && navigator.clipboard.writeText) {
      navigator.clipboard.writeText(text).then(function () {
        alert(message);
      }, function () {
        window.prompt('コピーできませんでした。このリンクを手動でコピーしてください:', text);
      });
    } else {
      window.prompt('このリンクをコピーしてください:', text);
    }
  }

  global.pcFinder = global.pcFinder || {};
  global.pcFinder.copyToClipboard = copyToClipboard;

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
})(window);
