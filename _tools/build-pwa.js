// build-pwa.js — transforma um app HTML do Ecossistema Flow em PWA responsivo.
// Uso: node build-pwa.js <pastaDoApp>
// Lê <pasta>/app.config.json e reescreve <pasta>/index.html (idempotente).
//
// app.config.json:
// { "name": "FinFlow · ...", "short": "FinFlow", "slug": "finflow",
//   "theme": "#05090a", "icon": "icons/finflow-192.png",
//   "libs": { "<url-cdn>": "libs/arquivo.js", ... } }

const fs = require('fs');
const path = require('path');

const dir = process.argv[2];
if (!dir) { console.error('uso: node build-pwa.js <pastaDoApp>'); process.exit(1); }

const cfg = JSON.parse(fs.readFileSync(path.join(dir, 'app.config.json'), 'utf8'));
const file = path.join(dir, 'index.html');
let html = fs.readFileSync(file, 'utf8');

// 1) CDN -> libs locais
for (const [url, local] of Object.entries(cfg.libs || {})) {
  html = html.split(url).join(local);
}

// 2) Bloco PWA + CSS responsivo (injeta uma vez, antes de </head>)
const HEAD = `
<!-- FLOW-PWA:start -->
<link rel="manifest" href="manifest.json">
<meta name="theme-color" content="${cfg.theme}">
<link rel="icon" type="image/png" sizes="192x192" href="${cfg.icon}">
<meta name="apple-mobile-web-app-capable" content="yes">
<meta name="apple-mobile-web-app-status-bar-style" content="black-translucent">
<meta name="apple-mobile-web-app-title" content="${cfg.short}">
<link rel="apple-touch-icon" href="${cfg.icon}">
<style id="flow-responsive">
#flowHamb{display:none;align-items:center;justify-content:center;width:38px;height:38px;
  flex:0 0 auto;margin-right:10px;background:var(--bg3,#1a2228);
  border:1px solid var(--gbb,#2a2a2a);border-radius:10px;color:var(--t1,#fff);cursor:pointer}
#flowHamb svg{width:20px;height:20px;stroke-width:2.2}
#flowBackdrop{display:none}
@media (max-width:820px){
  html,body{overflow:auto !important;height:auto !important}
  #app{height:auto !important;min-height:100vh}
  #sb{position:fixed !important;top:0;left:0;bottom:0;height:100% !important;z-index:2000;
    width:86% !important;max-width:330px;min-width:0 !important;
    transform:translateX(-100%);transition:transform .25s ease;box-shadow:0 0 40px rgba(0,0,0,.6)}
  #sb.open{transform:translateX(0)}
  #main{width:100% !important;min-width:0 !important;height:auto !important}
  #cnt{overflow:visible !important;height:auto !important}
  #topbar{position:sticky;top:0;z-index:100;padding:0 14px !important}
  #topbar .tbi{flex:1 1 auto;min-width:0}
  #flowHamb{display:flex}
  #flowBackdrop{display:block;position:fixed;inset:0;background:rgba(0,0,0,.5);z-index:1500;
    opacity:0;visibility:hidden;transition:opacity .25s}
  #flowBackdrop.show{opacity:1;visibility:visible}

  /* --- conteúdo responsivo --- */
  /* topbar cresce conforme o texto (evita sobreposição) e fica opaco */
  #topbar{height:auto !important;min-height:54px !important;flex-wrap:wrap;
    padding:8px 12px !important;gap:8px;background:${cfg.theme} !important;backdrop-filter:none !important}
  #topbar .tbi{flex:1 1 auto;min-width:0}
  #topbar .tbt{font-size:15px !important;line-height:1.2;white-space:normal !important}
  #topbar .tbs,#topbar .tbsub,#topbar .secsub{font-size:11px !important;line-height:1.25;white-space:normal !important}
  /* grades viram coluna única — exceto teclados (repeat(4)) e calendários (repeat(7)) */
  #cnt .kgrid,#cnt .cgrid,#cnt .fg2,#cnt .fg3,#cnt .dp-grid,
  #cnt [style*="grid-template-columns"]:not([style*="repeat(4"]):not([style*="repeat(7"]){grid-template-columns:1fr !important}
  /* impede estouro horizontal */
  #main,#cnt{overflow-x:hidden !important;max-width:100vw}
  #cnt .kval{font-size:18px !important;white-space:normal !important;word-break:break-word}
  #cnt canvas{max-width:100% !important;height:auto !important}
  /* tabelas mais compactas e roláveis */
  #cnt table{width:100% !important;font-size:12px;display:block;overflow-x:auto;-webkit-overflow-scrolling:touch}
  #cnt th,#cnt td{padding:6px 8px !important}
}
</style>
<!-- FLOW-PWA:end -->
`;
if (!html.includes('FLOW-PWA:start')) {
  html = html.replace('</head>', HEAD + '</head>');
}

// 3) Botão hambúrguer no topbar (1ª posição)
if (!html.includes('id="flowHamb"')) {
  html = html.replace('<div id="topbar">',
    '<div id="topbar"><button id="flowHamb" onclick="flowToggleMenu()" aria-label="Menu">' +
    '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor"><path d="M4 6h16M4 12h16M4 18h16"/></svg></button>');
}

// 4) Backdrop logo após <div id="app">
if (!html.includes('id="flowBackdrop"')) {
  html = html.replace('<div id="app">',
    '<div id="app"><div id="flowBackdrop" onclick="flowCloseMenu()"></div>');
}

// 5) JS: toggle do menu + registro do service worker (antes de </body>)
const SCRIPT = `
<!-- FLOW-PWA-JS:start -->
<script>
// Em telas estreitas, oculta rótulos de valor sobre os gráficos (evita sobreposição).
// O valor continua acessível ao tocar na barra/ponto. Reaparece em telas largas (ex.: horizontal).
try{
  if(window.Chart){
    var _p=(Chart.defaults.plugins=Chart.defaults.plugins||{});
    var _dl=(_p.datalabels=_p.datalabels||{});
    _dl.display=function(ctx){return (ctx.chart && ctx.chart.width||0) > 460;};
  }
}catch(e){}
function flowToggleMenu(){var s=document.getElementById('sb'),b=document.getElementById('flowBackdrop');
  if(!s)return;s.classList.toggle('open');if(b)b.classList.toggle('show');}
function flowCloseMenu(){var s=document.getElementById('sb'),b=document.getElementById('flowBackdrop');
  if(s)s.classList.remove('open');if(b)b.classList.remove('show');}
document.addEventListener('DOMContentLoaded',function(){
  document.querySelectorAll('#sb .ni').forEach(function(n){
    n.addEventListener('click',function(){if(window.innerWidth<=820)flowCloseMenu();});});
});
if('serviceWorker' in navigator){window.addEventListener('load',function(){
  navigator.serviceWorker.register('service-worker.js').catch(function(e){console.warn('SW:',e);});});}
</script>
<!-- FLOW-PWA-JS:end -->
`;
if (!html.includes('FLOW-PWA-JS:start')) {
  html = html.replace('</body>', SCRIPT + '</body>');
}

fs.writeFileSync(file, html);
console.log('PWA construído:', cfg.slug);
