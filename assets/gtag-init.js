// Google Analytics(GA4)の初期化。gtag.js本体(googletagmanager.com)は
// base.html.j2側で別途<script async>で読み込む。ここを外部ファイルにしているのは
// CSPのscript-srcに'unsafe-inline'を許可せずに済むようにするため(_headers参照)。
window.dataLayer = window.dataLayer || [];
function gtag() { dataLayer.push(arguments); }
gtag('js', new Date());
gtag('config', 'G-TMC0W25B8W');
