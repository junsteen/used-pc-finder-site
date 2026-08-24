(function () {
  var d = document.getElementById('__view');
  if (window.pcFinder && d) {
    pcFinder.recordView({ href: d.dataset.href, title: d.dataset.title, kind: d.dataset.kind });
  }
})();
