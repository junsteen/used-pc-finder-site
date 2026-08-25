(function () {
  const state = { data: null };
  const params = new URLSearchParams(location.search);

  const el = {
    purpose: document.getElementById('f-purpose'),
    purposePanel: document.getElementById('purpose-panel'),
    keyword: document.getElementById('f-keyword'),
    category: document.getElementById('f-category'),
    form: document.getElementById('f-form'),
    chassis: document.getElementById('f-chassis'),
    gpuOnly: document.getElementById('f-gpu-only'),
    max: document.getElementById('f-max'),
    os: document.getElementById('f-os'),
    cpu: document.getElementById('f-cpu'),
    gen: document.getElementById('f-gen'),
    mem: document.getElementById('f-mem'),
    storage: document.getElementById('f-storage'),
    maker: document.getElementById('f-maker'),
    sort: document.getElementById('f-sort'),
    results: document.getElementById('results'),
    count: document.getElementById('result-count'),
    toggle: document.getElementById('view-toggle'),
    updated: document.getElementById('updated-at'),
  };

  // 表示形式。表は列が多く狭い画面では読めないため、初期値は画面幅で決める。
  // 一度でも自分で選んだ人はその選択を優先する。
  const VIEW_KEY = 'view-mode';
  const VIEW_MIN_WIDTH = 900;
  function initialView() {
    const saved = localStorage.getItem(VIEW_KEY);
    if (saved === 'table' || saved === 'cards') return saved;
    return window.innerWidth >= VIEW_MIN_WIDTH ? 'table' : 'cards';
  }
  state.view = initialView();

  el.keyword.value = params.get('q') || '';
  el.category.value = params.get('cat') || '';
  el.form.value = params.get('form') || '';
  el.chassis.value = params.get('chassis') || '';
  el.gpuOnly.checked = params.get('gpu') === '1';
  el.max.value = params.get('max') || '';
  ['os', 'cpu', 'gen', 'mem', 'storage', 'maker'].forEach(k => {
    el[k].dataset.param = k;
  });

  // 並べ替えは、絞り込みの select と表の列見出しの2か所から操作する。
  // どちらも同じ状態を書き換え、URLには "price_asc" / "vram_desc" の形で残す。
  // "newest" は観測日時の降順で、列としては表に出ていない。
  function parseSort(text) {
    if (!text || text === 'newest') return { key: 'observed', dir: 'desc' };
    const i = text.lastIndexOf('_');
    const dir = text.slice(i + 1);
    return { key: text.slice(0, i), dir: dir === 'desc' ? 'desc' : 'asc' };
  }
  function formatSort(s) {
    return s.key === 'observed' ? 'newest' : s.key + '_' + s.dir;
  }
  state.sort = parseSort(params.get('sort') || 'price_asc');
  // select にない並び順(列見出しで指定したもの)は、隠しオプション側を選ぶ
  el.sort.value = ['price_asc', 'price_desc', 'newest'].includes(formatSort(state.sort))
    ? formatSort(state.sort) : '';

  function yen(n) { return '¥' + n.toLocaleString('ja-JP'); }

  // 出品タイトルやリクエストの本文は外部(各ショップ・GitHub Issue)由来の文字列で、
  // innerHTML に流し込んでいる。HTMLとして解釈されないよう必ずここを通すこと。
  function esc(v) {
    return String(v == null ? '' : v)
      .replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;')
      .replace(/"/g, '&quot;').replace(/'/g, '&#39;');
  }

  function specFacts(spec) {
    if (!spec || !spec.spec) return '';
    const s = spec.spec;
    const facts = [];
    if (s.screen_size_inch) facts.push(['画面', s.screen_size_inch + '型']);
    if (s.resolution) facts.push(['解像度', s.resolution]);
    if (s.weight_g) facts.push(['重さ', s.weight_g + 'g']);
    if (s.vram_gb) facts.push(['VRAM', s.vram_gb + 'GB']);
    if (s.usb_c !== undefined) facts.push(['USB-C', s.usb_c ? 'あり' : 'なし']);
    if (s.thunderbolt) facts.push(['TB', s.thunderbolt]);
    if (spec.release_date) facts.push(['発売', spec.release_date]);
    if (!facts.length) return '';
    // spec は specs/*.json の値で、AI調査のみ(人による検証なし)のものを含む。
    // 出品データと同じく外部由来の文字列として扱い、必ずエスケープする。
    return '<div class="spec-row">' + facts.map(f =>
      '<span>' + esc(f[0]) + ': <b>' + esc(f[1]) + '</b></span>'
    ).join('') + '</div>';
  }

  // 出品が用途プリセットの要件を満たすか、条件ごとに判定する。
  //
  // 「AIが総合判定しました」ではなく、どの条件をどの値で満たしたのかを
  // 全部見せる。根拠が見えないと、判定を信じるかどうかを利用者が決められない。
  //
  // 判定に必要な値が分からない場合は「不適合」ではなく「不明」を返す。
  // 欠損を不適合に丸めると、情報が少ない出品が不当に落ちる。
  //
  // CPUのコア数は当サイトが持っていないため、条件に含めない(型番からコア数を
  // 引く表を持てば判定できるが、現状は推測になるので出さない)。
  function fitChecks(listing, req) {
    const s = (req && req.specs) || {};
    const p = listing.parsed || {};
    const checks = [];

    if (s.ram_gb && s.ram_gb.min) {
      checks.push(compare('メモリ', s.ram_gb.min + 'GB 以上', p.memory_gb,
                          s.ram_gb.min, v => v + 'GB'));
    }
    if (s.vram_gb && s.vram_gb.min) {
      checks.push(compare('VRAM', s.vram_gb.min + 'GB 以上', vramOf(listing),
                          s.vram_gb.min, v => v + 'GB'));
    }
    // required と preferred は意味が違う。preferred を満たさないことを
    // 「不足」と判定すると、推奨にすぎない条件で候補を落としてしまう。
    const gv = s.gpu_vendor || {};
    const vendor = gv.required || gv.preferred;
    if (vendor) checks.push(vendorCheck(listing, vendor, !!gv.required));
    // ストレージ種別は requirements 側が「あると体感が変わる」という助言として
    // 書いているもので、満たさないと動かない条件ではないため判定に含めない。
    return checks;
  }

  function compare(label, need, actual, min, fmt) {
    if (actual === null || actual === undefined) {
      return { label, need, actual: null, status: 'unknown' };
    }
    return { label, need, actual: fmt(actual), status: actual >= min ? 'ok' : 'ng' };
  }

  function vendorCheck(listing, vendor, isRequired) {
    const gpu = gpuOf(listing) || '';
    const known = { NVIDIA: /nvidia|geforce|rtx|gtx|quadro/i,
                    AMD: /radeon|rx\s?\d/i, Intel: /arc|iris|uhd|hd graphics/i };
    const need = vendor + (isRequired ? '' : '（推奨）');
    // 推奨どまりの条件は、外れていても不足にはしない
    const miss = isRequired ? 'ng' : 'unknown';
    if (!gpu) return { label: 'GPU', need, actual: null, status: 'unknown' };
    if (gpu === '内蔵GPU') {
      return { label: 'GPU', need, actual: gpu,
               status: vendor === 'NVIDIA' ? miss : 'unknown' };
    }
    const rx = known[vendor];
    if (!rx) return { label: 'GPU', need, actual: gpu, status: 'unknown' };
    return { label: 'GPU', need, actual: gpu,
             status: rx.test(gpu) ? 'ok' : miss };
  }

  function judgeFit(listing, req) {
    if (!req) return null;
    const checks = fitChecks(listing, req);
    if (!checks.length) return { verdict: 'unknown', reason: '判定条件がありません', checks };
    const ng = checks.filter(c => c.status === 'ng');
    const unknown = checks.filter(c => c.status === 'unknown');
    const detail = c => c.label + ' ' + (c.actual || '不明') + '（必要: ' + c.need + '）';
    if (ng.length) {
      return { verdict: 'unfit', reason: ng.map(detail).join(' / '), checks };
    }
    if (unknown.length) {
      return { verdict: 'unknown',
               reason: unknown.map(c => c.label + 'が不明').join(' / '), checks };
    }
    return { verdict: 'fit', reason: checks.map(detail).join(' / '), checks };
  }

  function renderPurposePanel(req) {
    if (!req) { el.purposePanel.hidden = true; return; }
    const rows = [];
    const s = req.specs || {};
    if (s.vram_gb) rows.push('VRAM 最低' + s.vram_gb.min + 'GB' + (s.vram_gb.recommended ? ' / 推奨' + s.vram_gb.recommended + 'GB' : ''));
    if (s.ram_gb) rows.push('メモリ 最低' + s.ram_gb.min + 'GB' + (s.ram_gb.recommended ? ' / 推奨' + s.ram_gb.recommended + 'GB' : ''));
    if (s.cpu && s.cpu.cores_recommended) rows.push('CPU 推奨' + s.cpu.cores_recommended + 'コア');
    if (s.gpu_vendor) rows.push('GPU ' + (s.gpu_vendor.required || s.gpu_vendor.preferred) + '推奨');

    // req は requirements/*.json の値。現状は開発者が書いた内容だが、
    // 出品データと同じ経路(innerHTML)で組み立てるので同じ規律でエスケープする。
    const src = (req.sources || []).map(x =>
      x.url ? '<a href="' + esc(x.url) + '" target="_blank" rel="noopener">出典</a>' : esc(x.note || '')
    ).filter(Boolean)[0] || '';

    el.purposePanel.innerHTML =
      '<h2>' + esc(req.display_name) + '</h2>' +
      '<div>' + esc(req.summary || '') + '</div>' +
      '<div class="purpose-req">' + rows.map(r => '<span>' + esc(r) + '</span>').join('') + '</div>' +
      '<p class="src muted">CPUのコア数は当サイトで把握していないため、判定には含めていません。' +
      'メモリ・VRAM・GPUベンダー・ストレージ種別のうち、出品から読み取れた項目だけを突き合わせています。</p>' +
      (src ? '<p class="src">' + src + '</p>' : '');
    el.purposePanel.hidden = false;
  }

  function priceDelta(listing) {
    const hist = listing.price_history || [];
    if (hist.length < 2) return '';
    const prev = hist[hist.length - 2].price_yen;
    const diff = listing.price_yen - prev;
    if (diff === 0) return '';
    const cls = diff < 0 ? 'down' : 'up';
    const arrow = diff < 0 ? '▼' : '▲';
    return '<div class="price-delta ' + cls + '">' + arrow + ' ' + yen(prev) + ' から</div>';
  }

  function render() {
    // 全角英数字("８ＧＢ"等)で書かれたタイトルも半角キーワードで探せるよう、
    // 両辺をNFKC正規化してから比較する。
    const kw = el.keyword.value.trim().toLowerCase().normalize('NFKC');
    const cat = el.category.value;
    const form = el.form.value;
    const chassis = el.chassis.value;
    const gpuOnly = el.gpuOnly.checked;
    const max = parseInt(el.max.value, 10);
    const sort = el.sort.value;
    const req = el.purpose.value ? state.data.requirements[el.purpose.value] : null;
    renderPurposePanel(req);

    const os = el.os.value, cpuSeries = el.cpu.value, gen = el.gen.value, maker = el.maker.value;
    const minMem = parseInt(el.mem.value, 10);
    const minStorage = parseInt(el.storage.value, 10);

    let items = state.data.listings.filter(l => {
      if (kw && !l.title.toLowerCase().normalize('NFKC').includes(kw)) return false;
      if (cat && l.watch_name !== cat) return false;
      // 「デスクトップPC」には組み合わせ(素体+GPU、実質デスクトップ)も含める。
      // パーツ単体(GPUカードのみ等)はノート/デスクトップどちらにも該当しないため
      // どちらを選んでも除外する。
      if (form === 'laptop' && !isLaptopListing(l)) return false;
      if (form === 'desktop' && !(l.category === 'combo' || (l.category === 'pc' && !isLaptopListing(l)))) return false;
      if (chassis && l.chassis_gpu_fit !== chassis) return false;
      if (gpuOnly && !hasGpu(l)) return false;
      if (!isNaN(max) && max > 0 && l.price_yen > max) return false;
      // スペックでの絞り込みは、値が読み取れなかった出品を落とす。
      // 「確認できていない」ものを条件に合うとは言えないため。
      const p = l.parsed || {};
      if (os && p.os !== os) return false;
      if (cpuSeries && cpuOf(l) !== cpuSeries) return false;
      if (gen && String(genOf(l)) !== gen) return false;
      if (maker && l.model_maker !== maker) return false;
      if (!isNaN(minMem) && !(p.memory_gb >= minMem)) return false;
      if (!isNaN(minStorage) && !(storageGb(p.storage) >= minStorage)) return false;
      return true;
    });

    syncToggle();

    if (!items.length) {
      el.count.textContent = '0 件';
      el.results.innerHTML = '<div class="empty">条件に合う出品が見つかりませんでした。</div>';
      return;
    }

    const found = items.length;
    items = groupDuplicates(items);
    sortItems(items);
    // 出品の件数と行数がずれる理由(同一機種が複数台)を見える形にしておく
    el.count.textContent = items.length < found
      ? found + ' 件（同一機種をまとめて ' + items.length + ' 行）'
      : found + ' 件';

    if (state.view !== 'table') {
      el.results.innerHTML = cardsHtml(items, req);
      return;
    }

    // 表はパソコン向けの列構成。組み合わせ(素体PC+GPU)も同じ土俵で比べたいので
    // 表に入れる。グラボ等の単体パーツは列がほとんど埋まらないためカードのまま。
    const pcs = items.filter(l => l.category === 'pc' || l.category === 'combo');
    const parts = items.filter(l => l.category === 'part');
    const split = pcs.length && parts.length;
    const total = g => g.reduce((n, l) => n + l.count, 0);
    let html = '';
    if (pcs.length) {
      html += (split ? '<h2 class="section-h">パソコン ' + total(pcs) + '件</h2>' : '')
            + tableHtml(pcs, req);
    }
    if (parts.length) {
      html += (split ? '<h2 class="section-h">パーツ ' + total(parts) + '件</h2>' : '')
            + cardsHtml(parts, req);
    }
    el.results.innerHTML = html;
  }

  // 同じ店が同一機種を複数台出していることがある(中古なので1台ずつ別の出品)。
  // 表にすると同じ行が並んで見分けが付かないため、1行にまとめて台数を添える。
  // 価格・状態が違えば別の行として残す(比較の対象が変わるため)。
  //
  // 「同じ店」と言えるのは shop_id を持つ出品(ソフマップ等、直接収集している
  // 実店舗)だけ。楽天・Yahoo!ショッピングの source は1つのモール名で複数の
  // 異なる出品者をまとめてしまうため、たまたまタイトル・価格・状態が一致しても
  // 別の店の可能性がある。ここを source でまとめると「1店で2台在庫」のように
  // 見えてしまい、実際には別々の店の出品を誤って合算表示することになる。
  function groupDuplicates(items) {
    const map = new Map();
    for (const l of items) {
      const key = l.shop_id
        ? [l.shop_id, l.title, l.price_yen, l.condition_rank || ''].join(' ')
        : [l.source, l.listing_id].join(' ');
      const seen = map.get(key);
      if (seen) seen.count += 1;
      else map.set(key, Object.assign({}, l, { count: 1 }));
    }
    return [...map.values()];
  }

  function stockBadge(l) {
    return l.count > 1 ? '<span class="chip stock">' + l.count + '台</span>' : '';
  }

  // 組み合わせは実在する1つの商品ではないので、価格の内訳と2店であることを
  // 必ず添える。完成品PCの価格と同じ意味に見えてしまうのを避けるため。
  function comboBreakdown(l) {
    if (!l.combo) return '';
    const c = l.combo;
    const part = (x, label) =>
      '<li><span class="combo-role">' + label + '</span>' +
      '<a href="' + esc(x.url) + '" target="_blank" rel="noopener">' + esc(x.title) + '</a>' +
      '<span class="combo-price">' + yen(x.price_yen) + '</span>' +
      '<span class="combo-shop">' + esc(x.source_label || '') + '</span></li>';
    return '<ul class="combo-breakdown">' +
      part(c.base, '本体') + part(c.card, 'カード') +
      '</ul><p class="combo-note muted">別々の店で買って自分で組む前提の合計額です。' +
      '送料は2件分かかります。筐体: ' + esc(c.base.chassis) + '。' + esc(c.note) + '</p>';
  }

  // カテゴリの目印アイコン。カタログ収録済みならスペックのcategory、
  // 無ければ出品のcategory・ウォッチ名から推測する(トップのカテゴリカードと同じ考え方)。
  const ROW_ICONS = {
    desktop: '<svg viewBox="0 0 24 24" width="20" height="20" aria-hidden="true"><path d="M7 2h10a1 1 0 0 1 1 1v18a1 1 0 0 1-1 1H7a1 1 0 0 1-1-1V3a1 1 0 0 1 1-1z" fill="none" stroke="currentColor" stroke-width="1.6" stroke-linejoin="round" stroke-linecap="round"/><path d="M9 6h6" fill="none" stroke="currentColor" stroke-width="1.6" stroke-linejoin="round" stroke-linecap="round"/><path d="M9 9h6" fill="none" stroke="currentColor" stroke-width="1.6" stroke-linejoin="round" stroke-linecap="round"/><path d="M12 13.5a1.6 1.6 0 1 1 0 3.2 1.6 1.6 0 0 1 0-3.2z" fill="currentColor"/></svg>',
    laptop: '<svg viewBox="0 0 24 24" width="20" height="20" aria-hidden="true"><path d="M5 5h14v11H5z" fill="none" stroke="currentColor" stroke-width="1.6" stroke-linejoin="round" stroke-linecap="round"/><path d="M2 19h20l-1.5 2H3.5z" fill="none" stroke="currentColor" stroke-width="1.6" stroke-linejoin="round" stroke-linecap="round"/><path d="M8 11h2v3H8z" fill="currentColor"/><path d="M11 9h2v5h-2z" fill="currentColor"/><path d="M14 7h2v7h-2z" fill="currentColor"/></svg>',
    gpu: '<svg viewBox="0 0 24 24" width="20" height="20" aria-hidden="true"><path d="M2 7h20v10a2 2 0 0 1-2 2H4a2 2 0 0 1-2-2z" fill="none" stroke="currentColor" stroke-width="1.6" stroke-linejoin="round" stroke-linecap="round"/><path d="M7.6 12a2.4 2.4 0 1 1 0 .01z" fill="none" stroke="currentColor" stroke-width="1.6" stroke-linejoin="round" stroke-linecap="round"/><path d="M7.6 10.1v3.8M5.7 12h3.8" fill="none" stroke="currentColor" stroke-width="1.6" stroke-linejoin="round" stroke-linecap="round"/><path d="M16.4 12a2.4 2.4 0 1 1 0 .01z" fill="none" stroke="currentColor" stroke-width="1.6" stroke-linejoin="round" stroke-linecap="round"/><path d="M16.4 10.1v3.8M14.5 12h3.8" fill="none" stroke="currentColor" stroke-width="1.6" stroke-linejoin="round" stroke-linecap="round"/><path d="M4 19h16v1.4a.6.6 0 0 1-.6.6H4.6a.6.6 0 0 1-.6-.6z" fill="currentColor"/></svg>',
    // 以下4つは筐体の大きさ・GPU搭載の有無をillustrations.pyのchassis_art()と
    // 同じ形で示す(サイズ違いが伝わるよう、desktop/laptopより一回り詳細な線にしてある)。
    tiny: '<svg viewBox="0 0 48 48" width="20" height="20" aria-hidden="true"><path d="M8 20h32v10a2 2 0 0 1-2 2H10a2 2 0 0 1-2-2z" fill="none" stroke="currentColor" stroke-width="2.2" stroke-linejoin="round" stroke-linecap="round"/><path d="M12 24h4M12 27h4" fill="none" stroke="currentColor" stroke-width="2.2" stroke-linejoin="round" stroke-linecap="round"/></svg>',
    sff: '<svg viewBox="0 0 48 48" width="20" height="20" aria-hidden="true"><path d="M20 6h12v36a2 2 0 0 1-2 2H22a2 2 0 0 1-2-2z" fill="none" stroke="currentColor" stroke-width="2.2" stroke-linejoin="round" stroke-linecap="round"/><path d="M24 12h4v4h-4z" fill="none" stroke="currentColor" stroke-width="2.2" stroke-linejoin="round" stroke-linecap="round"/></svg>',
    tower: '<svg viewBox="0 0 48 48" width="20" height="20" aria-hidden="true"><path d="M14 4h20v40a2 2 0 0 1-2 2H16a2 2 0 0 1-2-2z" fill="none" stroke="currentColor" stroke-width="2.2" stroke-linejoin="round" stroke-linecap="round"/><path d="M18 10h4M18 14h4" fill="none" stroke="currentColor" stroke-width="2.2" stroke-linejoin="round" stroke-linecap="round"/></svg>',
    tower_gpu: '<svg viewBox="0 0 48 48" width="20" height="20" aria-hidden="true"><path d="M14 4h20v40a2 2 0 0 1-2 2H16a2 2 0 0 1-2-2z" fill="none" stroke="currentColor" stroke-width="2.2" stroke-linejoin="round" stroke-linecap="round"/><path d="M18 10h4M18 14h4" fill="none" stroke="currentColor" stroke-width="2.2" stroke-linejoin="round" stroke-linecap="round"/><path d="M15 26h18v8H15z" fill="var(--accent)"/></svg>',
    laptop_gpu: '<svg viewBox="0 0 48 48" width="20" height="20" aria-hidden="true"><path d="M8 10h32v22H8z" fill="none" stroke="currentColor" stroke-width="2.2" stroke-linejoin="round" stroke-linecap="round"/><path d="M4 34h40l-3 4H7z" fill="none" stroke="currentColor" stroke-width="2.2" stroke-linejoin="round" stroke-linecap="round"/><path d="M27 34.6h9v2.8h-9z" fill="var(--accent)"/></svg>',
  };

  // gpu_fit(export_site_data.pyがmodel_codes.chassis()で計算した値)から
  // 筐体イラストへの対応。"no/low_profile/maybe" は増設可否の判定名であって
  // 筐体の形の名前ではないため、ここで読み替える。
  const CHASSIS_ICON_BY_FIT = { no: 'tiny', low_profile: 'sff', maybe: 'tower' };

  // watch名・表示名にノートPC特有の語があるかで判定する。当サイトはノートPCの
  // 型番から筐体を判定する仕組みを持たないため(model_codes.pyはデスクトップの
  // 法人向けシリーズのみ対象)、今のところこの簡易判定が唯一の手がかり。
  // 行アイコンの選択(rowIconName)と「本体の種類」の絞り込みの両方で使う。
  function isLaptopListing(l) {
    if (l.category !== 'pc') return false;
    const w = state.data.watches[l.watch_name] || {};
    const text = (l.watch_name + ' ' + (w.display_name || '')).toLowerCase();
    return /dynabook|vaio|vjpk|ノート|laptop/.test(text);
  }

  function rowIconName(l) {
    const s = catalogSpec(l);
    if (l.category === 'part') return 'gpu';
    if (l.category === 'combo') return 'tower_gpu';
    if (l.category !== 'pc') return (s && ROW_ICONS[s.category]) || 'desktop';

    const isLaptop = isLaptopListing(l);
    if (isLaptop) return hasGpu(l) ? 'laptop_gpu' : 'laptop';
    if (hasGpu(l)) return 'tower_gpu';
    return CHASSIS_ICON_BY_FIT[l.chassis_gpu_fit] || 'desktop';
  }

  function rowIcon(l) {
    return '<span class="row-icon-wrap">' + (ROW_ICONS[rowIconName(l)] || ROW_ICONS.desktop) + '</span>';
  }

  // 型番が判定できていれば型番の詳細ページへ、できなければ販売元へ直接。
  // opts.icon === false でアイコンを省く(カードでは大きいcardThumb()を
  // 別に置くため、行頭の小さいアイコンと二重表示になるのを避ける)。
  function nameLink(l, opts) {
    const icon = (opts && opts.icon === false) ? '' : rowIcon(l);
    if (l.category === 'combo') {
      return icon + '<span class="combo-title">素体PC + グラフィックカード</span>';
    }
    const label = esc(l.title);
    if (l.model_slug) {
      return icon + '<a href="pc/' + esc(l.model_slug) + '.html" title="' + label + '">' +
        label + '</a><br><small class="model-code">' + esc(l.model_name) + ' の詳細</small>';
    }
    return icon + '<a href="' + esc(l.url) + '" target="_blank" rel="noopener" title="' +
      label + '">' + label + '</a>';
  }

  // --- 表 ---------------------------------------------------------------
  // CPU・メモリ・ストレージ・OS・GPU・VRAMは出品タイトルから機械的に抽出した
  // 推定値。検証済みスペックと見分けが付くよう、列見出しとセルの両方に印を付ける。
  //
  // key   : ソート時の識別子
  // value : 並べ替えに使う値。null/undefined は常に末尾へ送る
  // cell  : 表示するセルの中身(HTML)
  // est   : 推定値の列かどうか(見出しを破線にする)
  const COLUMNS = [
    { key: 'name', label: '製品名 / 構成', cls: 'col-name',
      value: l => l.title,
      cell: l => nameLink(l) + stockBadge(l) +
        (l.is_affiliate ? ' <span class="chip pr">PR</span>' : '') +
        '<div class="row-tags">' + typeBadge(l) + '</div>' + comboBreakdown(l) },
    { key: 'price', label: '価格', cls: 'num price-cell', num: true,
      value: l => l.price_yen,
      cell: l => yen(l.price_yen) + priceDelta(l) },
    { key: 'cpu', label: 'CPU', est: true,
      value: l => l.parsed.cpu, cell: l => est(l.parsed.cpu) },
    { key: 'cpu_generation', label: 'CPU世代', cls: 'num', num: true, est: true,
      value: l => l.parsed.cpu_generation,
      cell: l => est(l.parsed.cpu_generation ? '第' + l.parsed.cpu_generation + '世代' : null) },
    { key: 'gpu', label: 'GPU', cls: 'col-wrap', est: true,
      value: l => gpuOf(l), cell: l => est(gpuOf(l)) },
    { key: 'vram', label: 'VRAM', cls: 'num', num: true, est: true,
      value: l => vramOf(l),
      cell: l => est(vramOf(l) ? vramOf(l) + 'GB' : null) },
    { key: 'memory', label: 'メモリ', cls: 'num', num: true, est: true,
      value: l => l.parsed.memory_gb,
      cell: l => est(l.parsed.memory_gb ? l.parsed.memory_gb + 'GB' : null) },
    { key: 'storage', label: 'ストレージ', cls: 'col-wrap', est: true,
      value: l => storageGb(l.parsed.storage), num: true,
      cell: l => est(l.parsed.storage) },
    { key: 'os', label: 'OS', est: true,
      value: l => l.parsed.os, cell: l => est(l.parsed.os) },
    { key: 'condition', label: '状態',
      value: l => l.condition_rank, cell: l => esc(l.condition_rank || '—') },
    { key: 'shipping', label: '送料', cls: 'num',
      value: l => l.shipping,
      cell: l => l.shipping_label === '—'
        ? '<span title="販売元が送料を記載していません">—</span>'
        : esc(l.shipping_label) },
    { key: 'source', label: '販売元', cls: 'col-wrap',
      value: l => l.source_label, cell: l => esc(l.source_label) },
    { key: 'trust', label: '検証情報', cls: 'col-wrap',
      value: l => dataTrust(l).label, cell: l => trustBadge(l) },
  ];

  function est(v) {
    return v ? '<span class="est-val">' + esc(v) + '</span>' : '—';
  }

  // GPU/VRAMは、カタログに収録済みの製品(グラボ単体など)ならその値を使う。
  // 出品タイトルからの推定より確かなため。
  function catalogSpec(l) {
    return l.spec_id ? (state.data.specs[l.spec_id] || null) : null;
  }

  // GPUを搭載している(組み合わせは構成上必ずGPU搭載、それ以外はspec_idが
  // GPUチップのスペックを指しているかで判定する)。render_index.pyの
  // _device_type_counts()と同じ考え方を絞り込みロジック側でも使う。
  function hasGpu(l) {
    if (l.category === 'combo') return true;
    const s = catalogSpec(l);
    return !!(s && s.category === 'gpu');
  }

  // --- ステータス ---------------------------------------------------------
  // 「必要スペックを満たすか」と「そのデータをどこまで信用できるか」は
  // 別の軸。混ぜると「検証済みだから買っていい」と読まれてしまう。
  // 例:「✓ 下限を満たしています / △ 未検証」は正しい組み合わせ。

  const TYPE_LABELS = { pc: '完成品PC', part: 'パーツ', combo: '素体PC + GPU' };

  function typeBadge(l) {
    let label = TYPE_LABELS[l.category] || l.category;
    const s = catalogSpec(l);
    if (l.category === 'part' && s && s.category === 'gpu') label = 'パーツ / GPU';
    return '<span class="type-badge type-' + esc(l.category) + '">' + esc(label) + '</span>';
  }

  // データ信頼性。当サイトが実際に持っている根拠だけで3段階に分ける。
  function dataTrust(l) {
    const s = catalogSpec(l);
    if (s && s.verified === true) {
      return { level: 'verified', mark: '●', label: '検証済み',
               note: 'メーカー公式情報と照合済みのスペックがあります' };
    }
    if (s) {
      return { level: 'unverified', mark: '△', label: '未検証',
               note: 'カタログに収録済みですが、人による検証を経ていません' };
    }
    return { level: 'estimated', mark: '○', label: '推定値',
             note: '出品タイトルから機械的に抽出した値です' };
  }

  function trustBadge(l) {
    const t = dataTrust(l);
    return '<span class="status status-' + t.level + '" title="' + esc(t.note) + '">' +
      t.mark + ' ' + t.label + '</span>';
  }

  // スペック判定。用途プリセットが選ばれているときだけ意味を持つ。
  function fitBadge(l, req, opts) {
    const fit = judgeFit(l, req);
    if (!fit) return '';
    const map = {
      fit:     ['ok',      '✓', '下限を満たしています'],
      unfit:   ['danger',  '!', '満たしていません'],
      unknown: ['neutral', '?', '判定できません'],
    };
    const [cls, mark, label] = map[fit.verdict] || map.unknown;
    const text = (opts && opts.short) ? mark : mark + ' ' + label;
    const badge = '<span class="status status-' + cls + '" title="' + esc(fit.reason) + '">' +
      text + '</span>';
    if (opts && opts.detail === false) return badge;
    return badge + checkList(fit.checks);
  }

  // どの条件をどの値で満たしたのかを並べる。総合判定だけだと、
  // 何を根拠にそう言っているのかが利用者に分からない。
  function checkList(checks) {
    if (!checks || !checks.length) return '';
    const icon = { ok: '✓', ng: '!', unknown: '?' };
    return '<ul class="check-list">' + checks.map(c =>
      '<li class="check-' + c.status + '"><span class="check-icon">' + icon[c.status] +
      '</span><span class="check-need">' + esc(c.label + ' ' + c.need) + '</span>' +
      '<span class="check-actual">' + esc(c.actual || '不明') + '</span></li>'
    ).join('') + '</ul>';
  }
  function gpuOf(l) {
    const s = catalogSpec(l);
    if (s && s.category === 'gpu') return s.display_name;
    return l.parsed.gpu || null;
  }
  function vramOf(l) {
    const s = catalogSpec(l);
    if (s && s.spec && s.spec.vram_gb) return s.spec.vram_gb;
    return l.parsed.vram_gb || null;
  }

  // CPUは型番まで分けると選択肢が数十個になるので、シリーズ単位でまとめる。
  function cpuOf(l) {
    const cpu = (l.parsed || {}).cpu;
    if (!cpu) return null;
    const m = cpu.match(/^(Core i[3579]|Ryzen [3579]|Xeon|Celeron|Pentium|Athlon)/);
    return m ? m[1] : cpu;
  }

  // CPU世代(第何世代のIntel Coreか)。Ryzen等はタイトルから世代を推定していないため
  // parsed.cpu_generationが無い出品は絞り込みの対象から外れる(=誤って合致扱いにしない)。
  function genOf(l) {
    return (l.parsed || {}).cpu_generation || null;
  }

  // 「SSD 512GB + HDD 2TB」を合計GBにする。並べ替えのためだけの値。
  function storageGb(text) {
    if (!text || text === 'なし') return text === 'なし' ? 0 : null;
    let total = 0;
    for (const m of text.matchAll(/([0-9]+)\s*(TB|GB)/gi)) {
      total += parseInt(m[1], 10) * (m[2].toUpperCase() === 'TB' ? 1024 : 1);
    }
    return total || null;
  }

  // 表に列としては出ていないが、絞り込みの「新着順」で使う
  const OBSERVED_COL = { key: 'observed', num: false,
                         value: l => l.observed_at || '' };

  function sortItems(items) {
    const col = state.sort.key === 'observed' ? OBSERVED_COL
      : (COLUMNS.find(c => c.key === state.sort.key) || COLUMNS[1]);
    const dir = state.sort.dir === 'desc' ? -1 : 1;
    items.sort((a, b) => {
      const x = col.value(a), y = col.value(b);
      // 値がない行は、昇順でも降順でも末尾に置く(「—」が先頭に溜まるのを防ぐ)
      const xn = x === null || x === undefined || x === '';
      const yn = y === null || y === undefined || y === '';
      if (xn && yn) return 0;
      if (xn) return 1;
      if (yn) return -1;
      if (col.num) return (x - y) * dir;
      return String(x).localeCompare(String(y), 'ja') * dir;
    });
  }

  function tableHtml(items, req) {
    const showFit = !!req;
    const head = COLUMNS.map(c => {
      // 用途適合の列だけは並べ替えの対象にしない(判定は用途によって変わるため)
      const active = state.sort.key === c.key;
      const arrow = active ? (state.sort.dir === 'desc' ? '▼' : '▲') : '';
      return '<th class="' + [c.cls, c.est ? 'est' : '', active ? 'sorted' : ''].filter(Boolean).join(' ') + '">' +
        '<button type="button" class="sort-btn" data-sort="' + c.key + '"' +
        ' aria-label="' + c.label + 'で並べ替え">' + c.label +
        '<span class="sort-arrow">' + (arrow || '⇅') + '</span></button></th>';
    }).join('') + (showFit ? '<th>必要スペックとの比較</th>' : '');

    const rows = items.map(l => {
      // 用途を選んでいるときだけ「必要スペックとの比較」列が増える
      const fitCell = showFit
        ? '<td class="col-wrap">' + fitBadge(l, req) + '</td>' : '';
      return '<tr>' + COLUMNS.map(c =>
        '<td' + (c.cls ? ' class="' + c.cls + '"' : '') + '>' + c.cell(l) + '</td>'
      ).join('') + fitCell + '</tr>';
    }).join('');

    return '<p class="est-note muted">' +
      '<span class="est-val">点線</span>の列（CPU・GPU・VRAM・メモリ・ストレージ・OS）は' +
      '出品タイトルから機械的に抽出した推定値です。販売元のページで必ずご確認ください。' +
      '列見出しをクリックすると並べ替えできます。</p>' +
      '<div class="table-wrap"><table class="listing-table">' +
      '<thead><tr>' + head + '</tr></thead><tbody>' + rows + '</tbody></table></div>';
  }

  // --- カード -----------------------------------------------------------
  // カード表示(狭い画面の既定)では表の列が見えないので、抽出した構成をここに出す。
  // 表と同じく点線で推定値であることを示す。
  function parsedFacts(l) {
    const p = l.parsed || {};
    const facts = [
      ['CPU', p.cpu],
      ['CPU世代', p.cpu_generation ? '第' + p.cpu_generation + '世代' : null],
      ['GPU', gpuOf(l)],
      ['VRAM', vramOf(l) ? vramOf(l) + 'GB' : null],
      ['メモリ', p.memory_gb ? p.memory_gb + 'GB' : null],
      ['ストレージ', p.storage],
      ['OS', p.os],
    ].filter(f => f[1]);
    if (!facts.length) return '';
    return '<div class="spec-row parsed">' + facts.map(f =>
      '<span>' + f[0] + ': <b class="est-val">' + esc(f[1]) + '</b></span>'
    ).join('') + '</div>';
  }

  // カードの見出しに置く大きめのカテゴリ画像。行アイコン(rowIcon、20px用)と
  // 中身は同じだが、CSS側で表示サイズだけ変える(アイコンをサイズ別に
  // 二重に持たないため)。
  function cardThumb(l) {
    return '<div class="card-thumb">' + (ROW_ICONS[rowIconName(l)] || ROW_ICONS.desktop) + '</div>';
  }

  // お気に入りボタン。この端末のlocalStorageだけに保存し、サーバーには送らない
  // (local-store.jsのpcFinder.toggleFavorite)。出品は売り切れると消えるため、
  // お気に入り一覧側では「現在は出品されていません」的な扱いになりうる。
  function favoriteButton(l) {
    if (l.category === 'combo') return '';  // 組み合わせは実在する1出品ではないため対象外
    const key = l.source + ':' + l.listing_id;
    const on = window.pcFinder && pcFinder.isFavorite(key);
    return '<button type="button" class="fav-btn' + (on ? ' is-active' : '') + '" data-fav-key="' +
      esc(key) + '" aria-pressed="' + (on ? 'true' : 'false') + '" aria-label="お気に入りに追加">' +
      (on ? '♥' : '♡') + '</button>';
  }

  function cardsHtml(items, req) {
    return '<div class="cards">' + items.map(l => {
      const spec = l.spec_id ? state.data.specs[l.spec_id] : null;
      const watchLabel = (state.data.watches[l.watch_name] || {}).display_name || l.watch_name;

      // 販売元より後でよい情報。狭い画面では最後にまとめる。
      const meta = [];
      if (l.count > 1) meta.push('<span class="chip stock">' + l.count + '台</span>');
      if (l.condition_rank) meta.push('<span class="chip rank">' + esc(l.condition_rank) + '</span>');
      if (l.shipping && l.shipping === l.shipping_label) {
        meta.push('<span class="chip ship">' + esc(l.shipping) + '</span>');
      }
      // アフィリエイトリンクの商品は個別にも明示する(景品表示法のステマ規制対応)
      if (l.is_affiliate) meta.push('<span class="chip pr">PR</span>');
      // スペックがAI調査のみ(人による検証なし)であることを明示する
      if (spec && spec.verified === false) {
        meta.push('<span class="chip unverified">スペック未検証</span>');
      }
      meta.push('<span class="chip">' + esc(watchLabel) + '</span>');

      // 狭い画面ではDOMの順番がそのまま表示順になる。
      // 商品名 → 構成 → 種別 → 価格 → 販売元 → 判定 → 検証 の順に読ませたいので
      // その順に出し、広い画面ではグリッドで価格だけ右上へ寄せる。
      const fitHtml = fitBadge(l, req, { detail: false });
      return '<div class="card">' +
        '<div class="card-head">' + cardThumb(l) + favoriteButton(l) + '</div>' +
        '<div class="card-title">' + nameLink(l, { icon: false }) + '</div>' +
        parsedFacts(l) +
        specFacts(spec) +
        '<div class="card-type">' + typeBadge(l) + '</div>' +
        '<div class="price-block"><div class="price">' + yen(l.price_yen) + '</div>' +
          priceDelta(l) +
          '<div class="card-seller">' + esc(l.source_label) + '</div></div>' +
        '<div class="status-row">' + (fitHtml || '') + trustBadge(l) + '</div>' +
        (l.combo ? '<div class="combo-wrap">' + comboBreakdown(l) + '</div>' : '') +
        '<div class="meta-row">' + meta.join('') + '</div>' +
        (l.model_slug
          ? '<p class="card-more"><a href="pc/' + esc(l.model_slug) + '.html">詳細 &rarr;</a></p>'
          : '') +
        '</div>';
    }).join('') + '</div>';
  }

  // 絞り込みの選択肢は実データから作る。手で書くと収集対象が増えたときにずれる。
  // 出品数が1件しかない値は候補に出さない(選んでも比較にならないため)。
  function buildSpecFilters(listings) {
    const fill = (sel, pairs) => {
      pairs.forEach(([value, label]) => {
        const o = document.createElement('option');
        o.value = value;
        o.textContent = label;
        sel.appendChild(o);
      });
    };
    const tally = (fn) => {
      const m = new Map();
      listings.forEach(l => { const v = fn(l); if (v) m.set(v, (m.get(v) || 0) + 1); });
      return m;
    };
    const byCount = (m, min, label) => [...m.entries()]
      .filter(([, n]) => n >= (min || 1))
      .sort((a, b) => b[1] - a[1])
      .map(([v, n]) => [v, (label || ((v, n) => v + '（' + n + '）'))(v, n)]);

    fill(el.os, byCount(tally(l => (l.parsed || {}).os), 2));
    fill(el.cpu, byCount(tally(cpuOf), 2));
    // 世代は数値なので「Core i5（3）」ではなく「第8世代（3）」の形でラベルを作る。
    fill(el.gen, byCount(tally(genOf), 2, (v, n) => '第' + v + '世代（' + n + '）'));
    fill(el.maker, byCount(tally(l => l.model_maker), 1));
    // 容量は「以上」で絞る。実在する刻みだけを出す。
    const mem = [...new Set(listings.map(l => (l.parsed || {}).memory_gb).filter(Boolean))]
      .sort((a, b) => a - b);
    fill(el.mem, mem.map(v => [String(v), v + 'GB 以上']));
    fill(el.storage, [128, 256, 512, 1024].map(v =>
      [String(v), (v >= 1024 ? (v / 1024) + 'TB' : v + 'GB') + ' 以上']));
  }

  function syncToggle() {
    el.toggle.querySelectorAll('button').forEach(b => {
      b.setAttribute('aria-pressed', String(b.dataset.view === state.view));
    });
  }

  el.toggle.addEventListener('click', (e) => {
    const btn = e.target.closest('button[data-view]');
    if (!btn || btn.dataset.view === state.view) return;
    state.view = btn.dataset.view;
    localStorage.setItem(VIEW_KEY, state.view);
    render();
  });

  // 自分で選んでいない間は、幅の変化(端末の回転・ウィンドウ操作)に追従する。
  // 一度選んだ人の意思は上書きしない。
  let resizeTimer;
  window.addEventListener('resize', () => {
    if (localStorage.getItem(VIEW_KEY)) return;
    clearTimeout(resizeTimer);
    resizeTimer = setTimeout(() => {
      const next = window.innerWidth >= VIEW_MIN_WIDTH ? 'table' : 'cards';
      if (next === state.view || !state.data) return;
      state.view = next;
      render();
    }, 150);
  });

  // カタログ表はビルド時にHTMLへ直接書き込まれている(JSなしのクローラー対策)。
  // ここでは既存DOMに絞り込みのハンドラを付けるだけで、描画はしない。
  function attachCatalogHandlers() {
    // カタログ表(.cat-link)とカテゴリ一覧(.cat-card)の両方にあるので、
    // 見た目のクラスではなく data-watch を目印にする。
    document.querySelectorAll('[data-watch]').forEach(btn => {
      btn.addEventListener('click', () => {
        el.category.value = btn.dataset.watch;
        el.keyword.value = '';
        el.max.value = '';
        render();
        syncUrl();
        document.getElementById('result-count').scrollIntoView({ behavior: 'smooth', block: 'start' });
      });
    });
  }

  // 「PCの種類から探す」グリッド。render_index.pyの_DEVICE_TYPESと対応させる
  // (件数0のタイルは<button>ではなく<span>で出しているので、そちらはそもそも
  // data-deviceを持たずクリックハンドラの対象にならない=押せない)。
  const DEVICE_FILTERS = {
    laptop_gpu: { form: 'laptop', gpu: true },
    desktop_gpu: { form: 'desktop', gpu: true },
    laptop: { form: 'laptop' },
    desktop: { form: 'desktop' },
    tiny: { form: 'desktop', chassis: 'no' },
    sff: { form: 'desktop', chassis: 'low_profile' },
    tower: { form: 'desktop', chassis: 'maybe' },
  };

  function attachDeviceGridHandlers() {
    document.querySelectorAll('[data-device]').forEach(btn => {
      btn.addEventListener('click', () => {
        const f = DEVICE_FILTERS[btn.dataset.device];
        if (!f) return;
        el.category.value = '';
        el.form.value = f.form || '';
        el.chassis.value = f.chassis || '';
        el.gpuOnly.checked = !!f.gpu;
        el.keyword.value = '';
        el.max.value = '';
        render();
        syncUrl();
        document.getElementById('result-count').scrollIntoView({ behavior: 'smooth', block: 'start' });
      });
    });
  }

  function renderQueue(queue) {
    const box = document.getElementById('queue-status');
    if (!queue) return;
    if (queue.error) {
      box.innerHTML = '<p class="queue-empty">順番待ちの状況を取得できませんでした。</p>';
      return;
    }
    const open = queue.open || [];
    if (!open.length) {
      box.innerHTML = '<p class="queue-empty">現在、順番待ちはありません。</p>';
      return;
    }
    box.innerHTML = '<p class="queue-empty">順番待ち ' + open.length + ' 件</p>' +
      '<ul class="queue-list">' + open.map((item, i) =>
        '<li><span class="pos">' + (i + 1) + '.</span>' +
        '<a href="' + esc(item.url) + '" target="_blank" rel="noopener">' + esc(item.title) + '</a></li>'
      ).join('') + '</ul>';
  }

  // 列見出しのクリックで並べ替える。同じ列をもう一度押すと昇順/降順が入れ替わる。
  el.results.addEventListener('click', (e) => {
    // お気に入りは一覧全体を再描画せず、押したボタンだけ見た目を切り替える
    // (件数が多いと全体render()での再描画がスクロール位置を崩すため)。
    const favBtn = e.target.closest('.fav-btn');
    if (favBtn) {
      if (!window.pcFinder) return;
      const key = favBtn.dataset.favKey;
      const listing = state.data.listings.find(x => (x.source + ':' + x.listing_id) === key);
      if (!listing) return;
      const isOn = pcFinder.toggleFavorite(listing);
      favBtn.classList.toggle('is-active', isOn);
      favBtn.setAttribute('aria-pressed', String(isOn));
      favBtn.textContent = isOn ? '♥' : '♡';
      return;
    }
    const btn = e.target.closest('.sort-btn');
    if (!btn) return;
    const key = btn.dataset.sort;
    const col = COLUMNS.find(c => c.key === key);
    if (state.sort.key === key) {
      state.sort.dir = state.sort.dir === 'asc' ? 'desc' : 'asc';
    } else {
      // 価格や容量は「安い順・大きい順」から見たいことが多いので既定を分ける
      state.sort = { key, dir: col && col.num && key !== 'price' ? 'desc' : 'asc' };
    }
    // 絞り込みの select に対応する並び順なら表示を合わせる(合わなければ既定に戻す)
    const text = formatSort(state.sort);
    el.sort.value = ['price_asc', 'price_desc', 'newest'].includes(text) ? text : '';
    render();
    syncUrl();
  });

  function syncUrl() {
    const p = new URLSearchParams();
    if (el.purpose.value) p.set('use', el.purpose.value);
    if (el.keyword.value) p.set('q', el.keyword.value);
    if (el.category.value) p.set('cat', el.category.value);
    if (el.form.value) p.set('form', el.form.value);
    if (el.chassis.value) p.set('chassis', el.chassis.value);
    if (el.gpuOnly.checked) p.set('gpu', '1');
    if (el.max.value) p.set('max', el.max.value);
    ['os', 'cpu', 'gen', 'mem', 'storage', 'maker'].forEach(k => {
      if (el[k].value) p.set(k, el[k].value);
    });
    const sortText = formatSort(state.sort);
    if (sortText !== 'price_asc') p.set('sort', sortText);
    const qs = p.toString();
    history.replaceState(null, '', qs ? '?' + qs : location.pathname);
  }

  [el.purpose, el.keyword, el.category, el.form, el.chassis, el.gpuOnly, el.max,
   el.os, el.cpu, el.gen, el.mem, el.storage, el.maker].forEach(input => {
    input.addEventListener('input', () => { render(); syncUrl(); });
  });

  // 条件パネルの開閉。表は12列あって本文幅に収まらないので、
  // 全列を見たいときに畳んで幅を取り戻せるようにしておく。
  const COLLAPSE_KEY = 'filter-collapsed';
  const layout = document.querySelector('.search-layout');
  const collapseBtn = document.getElementById('filter-collapse');
  function syncCollapse() {
    const on = localStorage.getItem(COLLAPSE_KEY) === '1';
    layout.classList.toggle('is-collapsed', on);
    collapseBtn.textContent = on ? '条件を開く' : '閉じる';
    collapseBtn.setAttribute('aria-expanded', String(!on));
  }
  collapseBtn.addEventListener('click', () => {
    localStorage.setItem(COLLAPSE_KEY,
      localStorage.getItem(COLLAPSE_KEY) === '1' ? '0' : '1');
    syncCollapse();
  });
  syncCollapse();

  // 絞り込みのリセット。並び順は「絞り込み」ではないので触らない。
  document.getElementById('filter-reset').addEventListener('click', () => {
    el.purpose.value = '';
    el.keyword.value = '';
    el.category.value = '';
    el.form.value = '';
    el.chassis.value = '';
    el.gpuOnly.checked = false;
    el.max.value = '';
    ['os', 'cpu', 'gen', 'mem', 'storage', 'maker'].forEach(k => { el[k].value = ''; });
    render();
    syncUrl();
  });

  el.sort.addEventListener('input', () => {
    if (!el.sort.value) return;  // 列見出しで並べ替えたときの空選択
    state.sort = parseSort(el.sort.value);
    render();
    syncUrl();
  });

  // data.jsonは240KB超あり、遅い回線では取得に時間がかかる。取得中は
  // 「何も起きていないように見える」空白を避けるため、読み込み中である
  // ことを見える形にしておく(#result-countはaria-live="polite"なので
  // スクリーンリーダーにも状態変化として伝わる)。
  el.count.textContent = '読み込み中…';
  el.results.setAttribute('aria-busy', 'true');
  el.results.innerHTML = '<div class="empty">読み込み中…</div>';

  fetch('data.json')
    .then(r => r.json())
    .then(data => {
      state.data = data;

      attachCatalogHandlers();
      attachDeviceGridHandlers();
      renderQueue(data.request_queue);

      if (data.correction_url) {
        const link = document.getElementById('correction-link');
        link.href = data.correction_url;
        document.getElementById('correction-line').hidden = false;
      }

      Object.keys(data.requirements || {}).forEach(id => {
        const opt = document.createElement('option');
        opt.value = id;
        opt.textContent = data.requirements[id].display_name;
        el.purpose.appendChild(opt);
      });
      el.purpose.value = params.get('use') || '';

      const seen = new Set();
      Object.keys(data.watches).forEach(name => {
        if (seen.has(name)) return;
        seen.add(name);
        const opt = document.createElement('option');
        opt.value = name;
        opt.textContent = data.watches[name].display_name;
        el.category.appendChild(opt);
      });
      el.category.value = params.get('cat') || '';

      buildSpecFilters(data.listings);
      ['os', 'cpu', 'gen', 'mem', 'storage', 'maker'].forEach(k => {
        el[k].value = params.get(k) || '';
      });

      render();
      el.results.setAttribute('aria-busy', 'false');
    })
    .catch(err => {
      el.results.setAttribute('aria-busy', 'false');
      el.results.innerHTML = '<div class="empty">データの読み込みに失敗しました。</div>';
      console.error(err);
    });
})();
