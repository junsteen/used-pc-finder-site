(function () {
  function esc(v) {
    return String(v == null ? '' : v)
      .replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;')
      .replace(/"/g, '&quot;').replace(/'/g, '&#39;');
  }
  var listEl = document.getElementById('preset-list');
  var saveBtn = document.getElementById('preset-save');
  if (!listEl || !saveBtn) return;

  function render() {
    var presets = window.pcFinder ? pcFinder.getPresets() : [];
    if (!presets.length) {
      listEl.innerHTML = '<li class="muted">まだありません</li>';
      return;
    }
    listEl.innerHTML = presets.map(function (p) {
      return '<li><a href="' + esc(p.query || '') + '">' + esc(p.label) + '</a>' +
        '<button type="button" class="btn-icon" data-remove-preset="' + esc(p.id) +
        '" aria-label="この条件を削除">&times;</button></li>';
    }).join('');
  }

  listEl.addEventListener('click', function (ev) {
    var btn = ev.target.closest('[data-remove-preset]');
    if (!btn || !window.pcFinder) return;
    ev.preventDefault();
    pcFinder.removePreset(btn.dataset.removePreset);
    render();
  });

  saveBtn.addEventListener('click', function () {
    if (!window.pcFinder) return;
    // 現在の絞り込み条件はapp.jsが常にURLのクエリ文字列(location.search)に
    // 同期しているので、そのままラベルを付けて保存すればよい。
    var label = window.prompt('この条件に名前を付けて保存します');
    if (label === null) return;
    pcFinder.savePreset(label, location.search || '');
    render();
  });

  render();
})();
