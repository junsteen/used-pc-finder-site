// PWAとしてインストール可能にする。オフラインでも直近の内容が読める。
// 価格データはService Worker側でネットワーク優先にしてあるため、
// オンラインなら常に最新を取得する。
if ('serviceWorker' in navigator) {
  window.addEventListener('load', () => {
    navigator.serviceWorker.register('sw.js').catch(err => {
      console.warn('Service Workerの登録に失敗しました', err);
    });
  });
}
