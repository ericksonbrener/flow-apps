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
<script src="libs/jspdf.umd.min.js"></script>
<script src="libs/html2canvas.min.js"></script>
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

/* === MODO HORIZONTAL (paisagem, telas baixas) === */
@media (orientation:landscape) and (max-height:600px){
  /* compacta cabeçalho e rodapé da sidebar p/ o menu respirar e rolar */
  #sb .sbl{padding:10px 14px !important}
  #sb .sbl > div:last-child > div:last-child{display:none !important} /* bloco de autoria */
  #sb .sbnav{flex:1 1 auto !important;overflow-y:auto !important;min-height:0}
  #sb .ni{padding:7px 10px !important;font-size:12.5px}
  #sb .sbs{margin-bottom:6px !important}
  #sb .sbsl{margin-top:4px !important;margin-bottom:4px !important}
  #sb .sbbot{padding:8px 12px !important}
  #sb .sbbot .mw{padding:8px 10px !important}
  /* topbar mais baixo p/ aproveitar a altura reduzida */
  #topbar{min-height:46px !important;padding:6px 12px !important}
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
    // só mostra o rótulo quando cada categoria tem largura suficiente p/ não cortar
    _dl.display=function(ctx){
      var ch=ctx.chart; if(!ch) return true;
      var n=(ch.data&&ch.data.labels&&ch.data.labels.length)||1;
      return (ch.width/n) > 64;
    };
  }
}catch(e){}
function flowToggleMenu(){var s=document.getElementById('sb'),b=document.getElementById('flowBackdrop');
  if(!s)return;s.classList.toggle('open');if(b)b.classList.toggle('show');}
function flowCloseMenu(){var s=document.getElementById('sb'),b=document.getElementById('flowBackdrop');
  if(s)s.classList.remove('open');if(b)b.classList.remove('show');}

/* ===== Compartilhar PDF (celular) ===== */
// Copia as regras de @media print do próprio app para o clone (folha branca, igual à impressão).
function flowActivatePrintCSS(doc){
  var css='';
  for(var i=0;i<document.styleSheets.length;i++){
    var rules; try{rules=document.styleSheets[i].cssRules;}catch(e){continue;}
    if(!rules)continue;
    for(var j=0;j<rules.length;j++){
      var r=rules[j];
      if(r.type===CSSRule.MEDIA_RULE && /print/.test(r.media.mediaText)){
        for(var k=0;k<r.cssRules.length;k++) css+=r.cssRules[k].cssText+'\\n';
      }
    }
  }
  // largura tipo A4 p/ a captura encher a página
  css+='.ppg{width:760px !important;max-width:none !important;margin:0 auto !important;padding:26px !important;background:#fff !important}';
  var st=doc.createElement('style'); st.textContent=css; doc.head.appendChild(st);
}
async function flowSharePDF(){
  var btn=document.querySelector('[data-flow-share]'); var orig=btn?btn.innerHTML:'';
  try{
    var JspdfCtor=(window.jspdf&&window.jspdf.jsPDF)||window.jsPDF;
    if(!JspdfCtor||typeof html2canvas==='undefined'){alert('Bibliotecas de PDF ainda carregando. Tente de novo em instantes.');return;}
    var pages=document.querySelectorAll('#cnt .ppg');
    if(!pages.length){alert('Abra o Relatório primeiro.');return;}
    if(btn){btn.disabled=true;btn.textContent='Gerando PDF…';}
    var pdf=new JspdfCtor({orientation:'portrait',unit:'pt',format:'a4'});
    var W=pdf.internal.pageSize.getWidth(), H=pdf.internal.pageSize.getHeight();
    for(var i=0;i<pages.length;i++){
      var canvas=await html2canvas(pages[i],{scale:2,backgroundColor:'#ffffff',useCORS:true,windowWidth:820,onclone:flowActivatePrintCSS});
      var img=canvas.toDataURL('image/jpeg',0.92);
      var ratio=Math.min(W/canvas.width,H/canvas.height), w=canvas.width*ratio, h=canvas.height*ratio;
      if(i>0)pdf.addPage();
      pdf.addImage(img,'JPEG',(W-w)/2,10,w,h);
    }
    var blob=pdf.output('blob');
    var file=new File([blob],'${cfg.short}-relatorio.pdf',{type:'application/pdf'});
    if(navigator.canShare&&navigator.canShare({files:[file]})){
      await navigator.share({files:[file],title:'Relatório ${cfg.short}'});
    }else{
      var url=URL.createObjectURL(blob), a=document.createElement('a');
      a.href=url; a.download=file.name; document.body.appendChild(a); a.click(); a.remove();
      setTimeout(function(){URL.revokeObjectURL(url);},4000);
    }
  }catch(e){ if(e&&e.name==='AbortError')return; console.error(e); alert('Não foi possível gerar o PDF: '+(e&&e.message||e)); }
  finally{ if(btn){btn.disabled=false; btn.innerHTML=orig;} }
}
// insere o botão "Compartilhar PDF" ao lado do "Imprimir / PDF" quando o relatório é aberto
function flowAddShareBtn(){
  var tba=document.getElementById('tba'); if(!tba) return;
  var printBtn=tba.querySelector('button[onclick*="doPrint"]');
  if(!printBtn){ var ex=tba.querySelector('[data-flow-share]'); if(ex)ex.remove(); return; }
  if(tba.querySelector('[data-flow-share]')) return;
  var b=document.createElement('button');
  b.className=printBtn.className; b.setAttribute('data-flow-share','1');
  b.innerHTML='<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><circle cx="18" cy="5" r="3"/><circle cx="6" cy="12" r="3"/><circle cx="18" cy="19" r="3"/><path d="M8.6 13.5l6.8 4M15.4 6.5l-6.8 4"/></svg> Compartilhar PDF';
  b.onclick=flowSharePDF;
  printBtn.parentNode.insertBefore(b, printBtn.nextSibling);
}
document.addEventListener('DOMContentLoaded',function(){
  document.querySelectorAll('#sb .ni').forEach(function(n){
    n.addEventListener('click',function(){if(window.innerWidth<=820)flowCloseMenu();});});
  var cnt=document.getElementById('cnt');
  if(cnt&&window.MutationObserver){
    new MutationObserver(flowAddShareBtn).observe(cnt,{childList:true});
  }
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
