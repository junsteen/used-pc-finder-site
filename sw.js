// 中古PC・パーツ横断検索 — Service Worker
//
// 価格は20分ごとに変わる。古い価格を掴ませると購入判断を誤らせるため、
// data.json は必ずネットワークを先に試し、失敗した場合だけキャッシュを返す。
// HTML/CSS/アイコンは変化が緩やかなのでキャッシュ優先で構わない。
//
// なお、ページには生成時刻が埋め込まれているため、キャッシュから表示された
// 場合でも「最終更新」の表示で古さが利用者に伝わる。

const VERSION = 'v2';
const SHELL_CACHE = `shell-${VERSION}`;
const DATA_CACHE = `data-${VERSION}`;

const SHELL_ASSETS = [
  './',
  './index.html',
  // CSSを入れ忘れるとオフライン時に無スタイルのページが出るため必ず含める
  './assets/base.css',
  './assets/home.css',
  './manifest.webmanifest',
  './icons/icon-192.png',
  './icons/icon-512.png',
];

self.addEventListener('install', (event) => {
  event.waitUntil(
    caches.open(SHELL_CACHE)
      // 1つでも失敗すると全体が失敗するのを避けるため個別に追加する
      .then((cache) => Promise.allSettled(SHELL_ASSETS.map((u) => cache.add(u))))
      .then(() => self.skipWaiting())
  );
});

self.addEventListener('activate', (event) => {
  event.waitUntil(
    caches.keys()
      .then((keys) => Promise.all(
        keys.filter((k) => k !== SHELL_CACHE && k !== DATA_CACHE)
            .map((k) => caches.delete(k))
      ))
      .then(() => self.clients.claim())
  );
});

// 価格データ: ネットワーク優先。オフライン時のみキャッシュにフォールバック。
async function networkFirst(request) {
  try {
    const fresh = await fetch(request);
    if (fresh && fresh.ok) {
      const cache = await caches.open(DATA_CACHE);
      cache.put(request, fresh.clone());
    }
    return fresh;
  } catch (err) {
    const cached = await caches.match(request);
    if (cached) return cached;
    throw err;
  }
}

// ページ・静的アセット: キャッシュを返しつつ裏で更新する。
async function staleWhileRevalidate(request) {
  const cache = await caches.open(SHELL_CACHE);
  const cached = await cache.match(request);
  const fetching = fetch(request)
    .then((res) => {
      if (res && res.ok) cache.put(request, res.clone());
      return res;
    })
    .catch(() => cached);
  return cached || fetching;
}

self.addEventListener('fetch', (event) => {
  const { request } = event;
  if (request.method !== 'GET') return;

  const url = new URL(request.url);
  // 別オリジン(Googleフォント、各ショップへのリンク先)には介入しない
  if (url.origin !== self.location.origin) return;

  if (url.pathname.endsWith('/data.json')) {
    event.respondWith(networkFirst(request));
    return;
  }
  // RSSとsitemapも鮮度が要るのでネットワーク優先
  if (url.pathname.endsWith('/feed.xml') || url.pathname.endsWith('/sitemap.xml')) {
    event.respondWith(networkFirst(request));
    return;
  }
  event.respondWith(staleWhileRevalidate(request));
});
