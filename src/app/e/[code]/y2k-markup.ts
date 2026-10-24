/** Y2K wedding desk — CSS and body markup, verbatim from the static build's
 *  y2k.html ("make no mistakes": the page was signed off as-is, so the DOM
 *  and styles are carried over byte-for-byte; y2k-logic.ts drives them). */

export const Y2K_CSS = `
/* Layout: same rhythm as bagdrop.co/y2k (sepia hero, cream, dusk, forest, cream booking desk, deep-forest footer), with a family booking wizard, tag preview, tracker and ops desk added. Single, deliberate light look. */
:root{
  --cream:#F4EEE4; --paper:#FBF8F2; --card:#FFFFFF; --ink:#2B2620; --body:#5A5145;
  --label:#6B5A3E; --stone:#8A8172; --line:#E0D5C2; --line-2:#EDE5D6;
  --forest:#2A3329; --forest-2:#24291F; --forest-card:#343D33; --on-dark:#F4EEE4;
  --gold:#C8A96E; --gold-2:#B08D57; --sand:#E8CE9A; --sand-2:#F1DFB6;
  --bride:#B08D57; --groom:#7A3B2E; --ok:#4E6B3F; --warn:#A8742A; --err:#A4452C;
  --display:"Cormorant Garamond","Cormorant",Georgia,"Times New Roman",serif;
  --sans:"Inter",system-ui,-apple-system,"Segoe UI",sans-serif;
  --mono:ui-monospace,"SFMono-Regular",Menlo,Consolas,monospace;
  --r:14px; --gutter:clamp(16px,4vw,40px);
  color-scheme:light;
}
*{box-sizing:border-box}
[hidden]{display:none!important}
html{scroll-behavior:smooth}
@media (prefers-reduced-motion:reduce){html{scroll-behavior:auto}*{animation:none!important;transition:none!important}}
body{margin:0;background:var(--cream);color:var(--ink);font-family:var(--sans);font-size:16px;line-height:1.6;-webkit-font-smoothing:antialiased}
h1,h2,h3{text-wrap:balance}
a{color:inherit}
:focus-visible{outline:2px solid var(--gold-2);outline-offset:2px}
.wrap{max-width:1180px;margin:0 auto;padding-inline:var(--gutter)}
.eyebrow{font-size:12px;letter-spacing:.28em;text-transform:uppercase;color:var(--gold-2);font-weight:500}
.on-dark .eyebrow{color:var(--gold)}
h2.big{font-family:var(--display);font-weight:400;font-size:clamp(40px,6vw,68px);line-height:1.04;letter-spacing:-.01em;margin:.3em 0 .4em}
h2.big em{font-style:italic;color:var(--label)}
.on-dark h2.big em{color:var(--sand)}
.lede{max-width:56ch;color:var(--body)}
.on-dark .lede{color:rgba(244,238,228,.78)}

/* Nav */
.nav{position:sticky;top:env(safe-area-inset-top,0px);z-index:40;background:rgba(244,238,228,.92);backdrop-filter:blur(10px);border-bottom:1px solid var(--line-2)}
.nav .wrap{display:flex;align-items:center;justify-content:space-between;gap:16px;height:72px}
.logo{display:flex;align-items:center;gap:10px;text-decoration:none}
.logo svg{width:30px;height:40px}
.logo b{font-size:10px;letter-spacing:.14em;font-weight:700}
.nav ul{display:flex;gap:28px;list-style:none;margin:0;padding:0;align-items:center}
.nav ul a{text-decoration:none;font-size:12px;letter-spacing:.18em;text-transform:uppercase}
.nav .pill{border:1px solid var(--ink);border-radius:99px;padding:9px 18px}
.nav .pill:hover{background:var(--ink);color:var(--cream)}
@media (max-width:760px){.nav ul li.hide-sm{display:none}.nav ul{gap:14px}}

/* Hero */
.hero{position:relative;min-height:620px;display:grid;place-items:center;text-align:center;color:var(--on-dark);overflow:hidden;background:#4a3e30}
.hero canvas,.dusk canvas{position:absolute;inset:0;width:100%;height:100%}
.hero .in{position:relative;padding-block:90px 70px}
.hero .place{font-size:12px;letter-spacing:.42em;text-transform:uppercase;opacity:.85}
.names{font-family:var(--display);font-style:italic;font-weight:400;font-size:clamp(64px,13vw,152px);line-height:1;letter-spacing:-.01em;margin:.25em 0 .2em;display:flex;align-items:center;justify-content:center;gap:.25em;flex-wrap:wrap}
.names .heart{width:.3em;height:.3em;color:var(--sand)}
.date-pill{display:inline-flex;align-items:center;gap:14px;border:1px solid rgba(244,238,228,.35);background:rgba(36,30,22,.35);border-radius:99px;padding:10px 22px;font-size:13px;letter-spacing:.24em}
.date-pill:before,.date-pill:after{content:"";width:24px;height:1px;background:rgba(244,238,228,.5)}
.count{display:flex;justify-content:center;gap:clamp(20px,5vw,56px);margin-top:34px}
.count div{display:grid;gap:2px}
.count b{font-family:var(--display);font-weight:400;font-size:clamp(36px,6vw,56px);line-height:1;color:var(--sand);font-variant-numeric:tabular-nums}
.count span{font-size:10px;letter-spacing:.28em;text-transform:uppercase;opacity:.7}

/* Strip */
.strip{background:var(--cream);padding-block:64px;text-align:center}
.strip h3{font-family:var(--display);font-weight:400;font-size:clamp(28px,4vw,40px);margin:0 0 8px;letter-spacing:.04em;text-transform:uppercase}
.strip p{margin:0 auto 22px;max-width:52ch;color:var(--body)}
.chips{display:flex;gap:10px;justify-content:center;flex-wrap:wrap}
.chip{display:inline-flex;align-items:center;gap:8px;border:1px solid var(--line);background:var(--paper);border-radius:99px;padding:7px 14px;font-size:12px;letter-spacing:.08em;color:var(--label)}
.chip i{width:7px;height:7px;border-radius:50%;background:var(--ok);display:inline-block}

.btn{display:inline-flex;align-items:center;justify-content:center;gap:10px;border:0;cursor:pointer;font:600 13px/1 var(--sans);letter-spacing:.16em;text-transform:uppercase;border-radius:var(--r);padding:16px 26px;background:var(--forest);color:var(--on-dark);text-decoration:none;transition:transform .15s,background .15s}
.btn:hover{background:var(--forest-2);transform:translateY(-1px)}
.btn.ghost{background:transparent;color:var(--ink);border:1px solid var(--line)}
.btn.ghost:hover{background:var(--paper)}
.btn.gold{background:var(--sand);color:#3A2E1C}
.btn.sm{padding:10px 14px;font-size:11px;border-radius:10px}
.btn[disabled]{opacity:.45;cursor:not-allowed;transform:none}

/* Celebration */
.cel{padding-block:100px}
.two{display:grid;grid-template-columns:1.05fr .95fr;gap:clamp(28px,6vw,80px);align-items:center}
.two>*{min-width:0}
@media (max-width:860px){.two{grid-template-columns:1fr}}
.stats{display:flex;gap:40px;margin-top:28px;flex-wrap:wrap}
.stats b{display:block;font-family:var(--display);font-weight:400;font-size:44px;line-height:1}
.stats span{font-size:11px;letter-spacing:.24em;text-transform:uppercase;color:var(--stone)}
.monocard{aspect-ratio:4/5;max-width:100%;border-radius:22px;background:radial-gradient(120% 90% at 30% 10%,#FFFDF8,#EFE5D3 70%);border:1px solid var(--line);display:grid;place-items:center;text-align:center;padding:30px;position:relative;box-shadow:0 30px 60px -30px rgba(58,46,28,.35)}
.monocard:before{content:"";position:absolute;inset:14px;border:1px solid var(--line);border-radius:14px}
.mono{font-family:var(--display);font-style:italic;font-size:clamp(90px,12vw,150px);line-height:.9;color:var(--label)}
.mono small{display:block;font-style:normal;font-size:13px;letter-spacing:.32em;text-transform:uppercase;color:var(--stone);margin-top:22px;font-family:var(--sans)}
.tag-hash{font-family:var(--display);font-size:22px;letter-spacing:.2em;color:var(--gold-2);margin-top:6px}

/* Dusk */
.dusk{position:relative;min-height:520px;color:var(--on-dark);overflow:hidden;background:#2b2230;display:flex;align-items:center}
.dusk .wrap{position:relative;width:100%;padding-block:90px}
.dusk h2{font-family:var(--display);font-weight:400;font-size:clamp(52px,8vw,96px);line-height:1;margin:.25em 0 .35em}
.dusk h2 em{display:block}
.dusk p{max-width:46ch;color:rgba(244,238,228,.85)}

/* Travel */
.travel{background:var(--forest);color:var(--on-dark);padding-block:100px;position:relative}
.steps{display:grid;grid-template-columns:repeat(4,1fr);gap:16px;margin-top:56px}
@media (max-width:980px){.steps{grid-template-columns:repeat(2,1fr)}}
@media (max-width:520px){.steps{grid-template-columns:1fr}}
.step{background:var(--forest-card);border:1px solid rgba(244,238,228,.08);border-radius:18px;padding:26px 22px}
.step b{font-family:var(--display);font-weight:400;font-size:40px;color:var(--gold);line-height:1}
.step h4{margin:14px 0 6px;font-size:16px;font-weight:600}
.step p{margin:0;font-size:14px;color:rgba(244,238,228,.7)}

/* Luggage tag */
.ltag{position:relative;background:var(--paper);color:var(--ink);border-radius:16px 16px 16px 16px;padding:18px 18px 16px 34px;border:1px solid var(--line);min-width:0;box-shadow:0 18px 40px -24px rgba(0,0,0,.45);font-size:13px}
.ltag:before{content:"";position:absolute;left:12px;top:50%;width:12px;height:12px;margin-top:-6px;border-radius:50%;background:var(--cream);border:1px solid var(--line);box-shadow:inset 0 1px 2px rgba(0,0,0,.15)}
.ltag .band{position:absolute;left:0;top:0;bottom:0;width:6px;border-radius:16px 0 0 16px;background:var(--bride)}
.ltag.groom .band{background:var(--groom)}
.ltag .row{display:flex;justify-content:space-between;align-items:flex-start;gap:12px}
.ltag .id{font-family:var(--mono);font-size:12px;letter-spacing:.04em;word-break:break-all}
.ltag .who{font-family:var(--display);font-size:24px;line-height:1.05;margin:6px 0 2px}
.ltag .room{font-family:var(--display);font-size:34px;line-height:1;text-align:right}
.ltag .room small{display:block;font-family:var(--sans);font-size:9px;letter-spacing:.2em;text-transform:uppercase;color:var(--stone)}
.ltag .meta{display:flex;gap:6px;flex-wrap:wrap;margin-top:10px}
.ltag .meta span{font-size:10px;letter-spacing:.08em;text-transform:uppercase;border:1px solid var(--line);border-radius:6px;padding:3px 6px;color:var(--label)}
.ltag .meta span.hot{background:#F6E7D3;border-color:#E4C79C;color:#7A4E14}
.ltag canvas{width:64px;height:64px;image-rendering:pixelated;flex:none}
.tagdemo{display:grid;grid-template-columns:1fr 1fr;gap:16px;margin-top:22px}
@media (max-width:520px){.tagdemo{grid-template-columns:1fr}}

/* Booking */
.book{padding-block:100px}
.book .head{text-align:center;margin-bottom:40px}
.book .head .lede{margin:0 auto}
.desk{display:grid;grid-template-columns:minmax(0,1fr) 320px;gap:24px;align-items:start}
@media (max-width:980px){.desk{grid-template-columns:1fr}}
.panel{background:var(--card);border:1px solid var(--line-2);border-radius:24px;padding:clamp(20px,3.5vw,40px);box-shadow:0 30px 60px -40px rgba(58,46,28,.35);min-width:0}
.stepper{display:flex;gap:6px;margin:0 0 28px;padding:0;list-style:none;overflow-x:auto;scrollbar-width:none}
.stepper li{flex:1 0 auto}
.stepper button{width:100%;background:none;border:0;border-top:2px solid var(--line);padding:10px 4px 0;text-align:left;cursor:pointer;font:500 11px/1.3 var(--sans);letter-spacing:.14em;text-transform:uppercase;color:var(--stone)}
.stepper button span{display:block;font-family:var(--display);font-size:20px;letter-spacing:0;text-transform:none;color:inherit}
.stepper li.done button{border-color:var(--gold-2);color:var(--label)}
.stepper li.cur button{border-color:var(--ink);color:var(--ink)}
.stepper button[disabled]{cursor:default}
.ph{font-family:var(--display);font-size:clamp(28px,4vw,36px);font-weight:400;margin:0 0 4px;line-height:1.1}
.psub{color:var(--body);margin:0 0 24px;font-size:15px}
.grid{display:grid;grid-template-columns:1fr 1fr;gap:16px 18px}
.grid.three{grid-template-columns:repeat(3,1fr)}
.grid>*{min-width:0}
.full{grid-column:1/-1}
@media (max-width:620px){.grid,.grid.three{grid-template-columns:1fr}}
label.f{display:grid;gap:7px}
label.f>span,.lab{font-size:11px;font-weight:600;letter-spacing:.08em;text-transform:uppercase;color:var(--label)}
label.f>span em,.lab em{font-style:normal;text-transform:none;letter-spacing:0;font-weight:400;color:var(--stone)}
input[type=text],input[type=tel],input[type=email],input[type=number],input[type=time],select,textarea{width:100%;font:400 15px/1.3 var(--sans);color:var(--ink);background:var(--paper);border:1px solid var(--line);border-radius:12px;padding:12px 14px;min-height:46px;appearance:none}
select{background-image:linear-gradient(45deg,transparent 50%,var(--label) 50%),linear-gradient(135deg,var(--label) 50%,transparent 50%);background-position:calc(100% - 18px) 50%,calc(100% - 13px) 50%;background-size:5px 5px;background-repeat:no-repeat;padding-right:34px}
textarea{min-height:80px;resize:vertical}
input:focus,select:focus,textarea:focus{outline:none;border-color:var(--gold-2);box-shadow:0 0 0 3px rgba(200,169,110,.2)}
input[readonly]{background:var(--line-2);color:var(--label)}
.bad input,.bad select,input.bad,select.bad{border-color:var(--err)}
.msg{font-size:12px;color:var(--err)}
.hint{font-size:12px;color:var(--stone)}
.seg{display:flex;gap:8px;flex-wrap:wrap}
.seg label{cursor:pointer;position:relative}
.seg input{position:absolute;opacity:0;pointer-events:none}
.seg span{display:inline-flex;align-items:center;gap:8px;border:1px solid var(--line);border-radius:10px;padding:10px 14px;font-size:14px;background:var(--paper)}
.seg input:checked+span{border-color:var(--ink);background:var(--ink);color:var(--cream)}
.seg input:focus-visible+span{outline:2px solid var(--gold-2);outline-offset:2px}
.tick{display:flex;gap:10px;align-items:flex-start;font-size:14px;cursor:pointer}
.tick input{width:18px;height:18px;margin:2px 0 0;accent-color:var(--forest);flex:none}
.item{border:1px solid var(--line);border-radius:18px;padding:18px;background:var(--paper);display:grid;gap:14px;min-width:0}
.item+.item{margin-top:14px}
.item .top{display:flex;justify-content:space-between;align-items:center;gap:10px;flex-wrap:wrap}
.item .top h4{margin:0;font-family:var(--display);font-weight:500;font-size:22px}
.idchip{font-family:var(--mono);font-size:11px;background:var(--card);border:1px solid var(--line);border-radius:6px;padding:3px 7px;color:var(--label)}
.x{background:none;border:0;color:var(--stone);cursor:pointer;font-size:13px;text-decoration:underline}
.x:hover{color:var(--err)}
.adders{display:flex;gap:8px;flex-wrap:wrap;margin:6px 0 18px}
.adders button{border:1px dashed var(--gold-2);background:var(--paper);color:var(--label);border-radius:10px;padding:9px 12px;font:500 13px var(--sans);cursor:pointer}
.adders button:hover{background:var(--sand-2)}
.swatches{display:flex;gap:6px;flex-wrap:wrap}
.swatches label{cursor:pointer;position:relative}
.swatches input{position:absolute;opacity:0;pointer-events:none}
.swatches i{display:block;width:28px;height:28px;border-radius:50%;border:2px solid var(--card);box-shadow:0 0 0 1px var(--line)}
.swatches input:checked+i{box-shadow:0 0 0 2px var(--ink)}
.swatches input:focus-visible+i{outline:2px solid var(--gold-2);outline-offset:2px}
.callout{border-radius:14px;padding:14px 16px;font-size:14px;background:#F8F1E4;border:1px solid #EADBC0;color:#5B4A2E;display:flex;gap:10px}
.callout.ok{background:#EEF2E8;border-color:#D4DEC8;color:#3C5230}
.callout.warn{background:#FBEFDF;border-color:#EFD3A8;color:#6E4A12}
.proto{display:inline-block;font-size:10px;letter-spacing:.12em;text-transform:uppercase;border:1px dashed var(--warn);color:var(--warn);border-radius:6px;padding:2px 6px;margin-left:6px;vertical-align:middle;font-weight:600}
.navrow{display:flex;justify-content:space-between;gap:12px;margin-top:30px;flex-wrap:wrap}
.tbl-wrap{overflow-x:auto;border:1px solid var(--line);border-radius:14px}
table{border-collapse:collapse;width:100%;font-size:14px;min-width:560px}
th,td{text-align:left;padding:10px 12px;border-bottom:1px solid var(--line-2);vertical-align:top}
th{font-size:11px;letter-spacing:.1em;text-transform:uppercase;color:var(--label);font-weight:600;background:var(--paper)}
tr:last-child td{border-bottom:0}
td.num{font-variant-numeric:tabular-nums}
.retrow{display:grid;grid-template-columns:minmax(0,1.3fr) minmax(0,1fr) minmax(0,1fr) minmax(0,1.2fr);gap:10px;align-items:center;padding:12px 0;border-bottom:1px solid var(--line-2)}
.retrow:last-child{border-bottom:0}
@media (max-width:720px){.retrow{grid-template-columns:1fr 1fr}}

/* Summary */
.sum{position:sticky;top:96px;background:var(--forest);color:var(--on-dark);border-radius:24px;padding:24px;display:grid;gap:16px}
@media (max-width:980px){.sum{position:static}}
.sum h4{margin:0;font-family:var(--display);font-weight:400;font-size:26px}
.sum dl{margin:0;display:grid;grid-template-columns:1fr auto;gap:8px 12px;font-size:14px}
.sum dt{color:rgba(244,238,228,.7)}
.sum dd{margin:0;text-align:right;font-variant-numeric:tabular-nums}
.sum hr{border:0;border-top:1px solid rgba(244,238,228,.12);margin:0}
.flags{display:grid;gap:8px}
.flag{font-size:13px;display:flex;gap:8px;align-items:flex-start;color:rgba(244,238,228,.85)}
.flag i{flex:none;width:8px;height:8px;border-radius:50%;margin-top:6px;background:var(--gold)}
.flag.w i{background:#E3A857}
.flag.g i{background:#9DBA86}

/* Confirmation */
.conf-head{display:flex;justify-content:space-between;gap:16px;flex-wrap:wrap;align-items:flex-end;margin-bottom:22px}
.bid{font-family:var(--mono);font-size:22px;letter-spacing:.06em}
.tags{display:grid;grid-template-columns:repeat(auto-fill,minmax(260px,1fr));gap:14px}
.wa{background:#E9F0E2;border:1px solid #D2DEC6;border-radius:14px;padding:16px;white-space:pre-wrap;font-size:14px;line-height:1.5;color:#2E3B26;margin:0;font-family:var(--sans)}

/* Track */
.track{background:var(--paper);padding-block:90px;border-top:1px solid var(--line-2)}
.tline{display:grid;grid-template-columns:repeat(8,1fr);gap:4px;margin-top:10px}
.tline div{height:6px;border-radius:3px;background:var(--line)}
.tline div.on{background:var(--ok)}
.tlabels{display:grid;grid-template-columns:repeat(8,1fr);gap:4px;font-size:10px;color:var(--stone);letter-spacing:.04em;margin-top:6px}
@media (max-width:620px){.tlabels{display:none}}
.trk{border:1px solid var(--line);border-radius:16px;padding:16px;background:var(--card)}
.trk+.trk{margin-top:12px}
.trk .top{display:flex;justify-content:space-between;gap:10px;flex-wrap:wrap;font-size:14px}
.state{display:inline-flex;align-items:center;gap:6px;border-radius:99px;padding:3px 10px;font-size:12px;font-weight:600;background:#EEF2E8;color:#3C5230}

/* Ops */
.ops{background:var(--cream);padding-block:90px;border-top:1px solid var(--line-2)}
.kpis{display:grid;grid-template-columns:repeat(6,1fr);gap:12px;margin:24px 0}
@media (max-width:900px){.kpis{grid-template-columns:repeat(3,1fr)}}
@media (max-width:480px){.kpis{grid-template-columns:repeat(2,1fr)}}
.kpi{background:var(--card);border:1px solid var(--line-2);border-radius:14px;padding:14px}
.kpi b{display:block;font-family:var(--display);font-size:36px;font-weight:500;line-height:1;font-variant-numeric:tabular-nums}
.kpi span{font-size:11px;letter-spacing:.1em;text-transform:uppercase;color:var(--label)}
.pillside{display:inline-block;border-radius:99px;padding:2px 9px;font-size:11px;font-weight:600;color:#fff;background:var(--bride)}
.pillside.groom{background:var(--groom)}
.mini{font-size:12px;color:var(--stone)}
details.fam{border-top:1px solid var(--line-2)}
details.fam summary{cursor:pointer;list-style:none;padding:12px 0;display:grid;grid-template-columns:110px minmax(0,1fr) 90px 70px 70px minmax(0,1.2fr);gap:10px;align-items:center;font-size:14px}
details.fam summary::-webkit-details-marker{display:none}
@media (max-width:780px){details.fam summary{grid-template-columns:1fr 1fr}}
.opshead{display:grid;grid-template-columns:110px minmax(0,1fr) 90px 70px 70px minmax(0,1.2fr);gap:10px;font-size:11px;letter-spacing:.1em;text-transform:uppercase;color:var(--label);padding-bottom:8px}
@media (max-width:780px){.opshead{display:none}}
.opsbox{background:var(--card);border:1px solid var(--line-2);border-radius:20px;padding:20px}
select.mini-sel{min-height:34px;padding:6px 30px 6px 10px;font-size:13px}

/* Footer */
footer{background:var(--forest-2);color:var(--on-dark);text-align:center;padding-block:80px 40px}
footer .n{font-family:var(--display);font-style:italic;font-size:clamp(40px,6vw,60px);margin:18px 0 8px}
footer .d{font-size:12px;letter-spacing:.28em;color:rgba(244,238,228,.6)}
footer .h{color:var(--gold);letter-spacing:.2em;margin-top:8px;font-size:14px}
footer .base{border-top:1px solid rgba(244,238,228,.1);margin-top:44px;padding-top:22px;font-size:12px;color:rgba(244,238,228,.5);display:flex;gap:18px;justify-content:center;flex-wrap:wrap}
.toast{position:fixed;left:50%;bottom:calc(20px + env(safe-area-inset-bottom,0px));transform:translateX(-50%);background:var(--ink);color:var(--cream);padding:12px 18px;border-radius:12px;font-size:14px;z-index:60;box-shadow:0 10px 30px rgba(0,0,0,.25);max-width:calc(100% - 32px)}
.sr{position:absolute;width:1px;height:1px;overflow:hidden;clip:rect(0 0 0 0)}
`;

export const Y2K_HTML = `
<nav class="nav" aria-label="Main">
  <div class="wrap">
    <a class="logo" href="#top" aria-label="Bagdrop">
      <svg viewBox="0 0 30 40" aria-hidden="true"><rect x="10" y="0" width="10" height="7" rx="2" fill="none" stroke="#111" stroke-width="2.4"/><path d="M4 7h12c6 0 10 4 10 9 0 2.6-1.2 4.7-3 6 2.6 1.4 4 3.8 4 6.8C27 34 23 38 17 38H4z" fill="#111"/><path d="M11 18l7 5-7 5z" fill="#F4EEE4"/></svg>
      <b>BAGDROP</b>
    </a>
    <ul>
      <li class="hide-sm"><a href="#celebration">Celebration</a></li>
      <li class="hide-sm"><a href="#destination">Destination</a></li>
      <li class="hide-sm"><a href="#travel">Travel</a></li>
      <li><a href="#track">Track</a></li>
      <li><a class="pill" href="#book">Book bags</a></li>
    </ul>
  </div>
</nav>

<header class="hero" id="top">
  <canvas id="heroArt" aria-hidden="true"></canvas>
  <div class="in wrap">
    <div class="place">Taj Aravali · Udaipur</div>
    <h1 class="names">Yashna <svg class="heart" viewBox="0 0 24 24" aria-label="and"><path d="M12 21s-8-5.2-8-11a4.5 4.5 0 0 1 8-2.8A4.5 4.5 0 0 1 20 10c0 5.8-8 11-8 11z" fill="none" stroke="currentColor" stroke-width="1.4"/></svg> Yash</h1>
    <div class="date-pill">17 &amp; 18 DECEMBER 2026</div>
    <div class="count" aria-live="off">
      <div><b id="cd-d">--</b><span>Days</span></div>
      <div><b id="cd-h">--</b><span>Hours</span></div>
      <div><b id="cd-m">--</b><span>Minutes</span></div>
      <div><b id="cd-s">--</b><span>Seconds</span></div>
    </div>
  </div>
</header>

<section class="strip">
  <div class="wrap">
    <h3>Travel light to the mountains</h3>
    <p>One booking for your whole family. Every bag tagged, sealed and tracked from your door in Mumbai to your room at Taj Aravali, and back home after.</p>
    <div class="chips">
      <span class="chip"><i></i>Room-matched delivery</span>
      <span class="chip"><i></i>Tagged &amp; sealed</span>
      <span class="chip"><i></i>Live tracking</span>
      <span class="chip"><i></i>Return home included</span>
    </div>
    <p style="margin-top:28px"><a class="btn" href="#book">Book luggage pickup</a></p>
  </div>
</section>

<section class="cel" id="celebration">
  <div class="wrap two">
    <div>
      <div class="eyebrow">01 · The celebration</div>
      <h2 class="big">Two days in the <em>Aravallis</em>, one forever.</h2>
      <p class="lede">We're gathering the people we love most in the folds of the oldest mountains in India, for slow mornings, long evenings, and a wedding under an open Udaipur sky. No rush, no noise. Just us, and you.</p>
      <div class="stats">
        <div><b>2</b><span>Days</span></div>
        <div><b>1</b><span>Palace</span></div>
        <div><b>∞</b><span>Memories</span></div>
      </div>
    </div>
    <div class="monocard" aria-label="Wedding monogram">
      <div>
        <div class="mono">Y<span style="font-size:.5em;vertical-align:middle;color:var(--gold-2)"> &amp; </span>Y</div>
        <div class="tag-hash">#Y2K</div>
        <div class="mono"><small>17 · 18 December 2026</small></div>
      </div>
    </div>
  </div>
</section>

<section class="dusk on-dark" id="destination">
  <canvas id="duskArt" aria-hidden="true"></canvas>
  <div class="wrap">
    <div class="eyebrow">02 · The destination</div>
    <h2>Taj Aravali,<em>Udaipur</em></h2>
    <p>Tucked into the Aravalli range above the City of Lakes: terraced gardens, still water, and mountain light that turns gold at dusk. A 30-minute drive from Maharana Pratap Airport.</p>
  </div>
</section>

<section class="travel on-dark" id="travel">
  <div class="wrap">
    <div class="two">
      <div>
        <div class="eyebrow">03 · Travel light</div>
        <h2 class="big">Your bags, handled. So the mountains are all <em>you</em> carry.</h2>
        <p class="lede">Powered by Bagdrop. Every bag gets its own tag, linked to the person it belongs to and the room they're staying in. You see each one move, and you get a photo when it reaches your room.</p>
      </div>
      <div>
        <div class="eyebrow" style="margin-bottom:4px">What goes on every bag</div>
        <div class="tagdemo" id="tagDemo"></div>
        <p class="hint" style="color:rgba(244,238,228,.55);margin-top:12px">Gold band: bride's side. Maroon band: groom's side. Sample tags.</p>
      </div>
    </div>
    <div class="steps">
      <div class="step"><b>01</b><h4>Door pickup in Mumbai</h4><p>One booking covers every family member, even when they live at different addresses.</p></div>
      <div class="step"><b>02</b><h4>Tagged, photographed, sealed</h4><p>Each bag is scanned, weighed and sealed at your door. You get the list with photos on WhatsApp.</p></div>
      <div class="step"><b>03</b><h4>In your room after check-in</h4><p>Matched to the host's rooming list. Bags arriving early wait safely at the bell desk.</p></div>
      <div class="step"><b>04</b><h4>Home again after</h4><p>We collect from your room at checkout and deliver to any address, or to the airport.</p></div>
    </div>
  </div>
</section>

<section class="book" id="book">
  <div class="wrap">
    <div class="head">
      <div class="eyebrow">04 · Reserve your pickup</div>
      <h2 class="big">Book for your whole family</h2>
      <p class="lede">About three minutes for a family of four. You can edit your booking until 24 hours before pickup.</p>
    </div>
    <div class="desk">
      <div class="panel" id="panel"></div>
      <aside class="sum" id="summary" aria-label="Booking summary"></aside>
    </div>
  </div>
</section>

<section class="track" id="track">
  <div class="wrap">
    <div class="eyebrow">05 · Track</div>
    <h2 class="big">Where are my bags?</h2>
    <div id="trackBox"></div>
  </div>
</section>

<section class="ops" id="ops" hidden>
  <div class="wrap">
    <div class="eyebrow">Bagdrop ops desk · editors only</div>
    <h2 class="big" style="margin-bottom:0">Y2K manifest</h2>
    <p class="mini" id="opsNote"></p>
    <div class="kpis" id="opsKpis"></div>
    <div class="opsbox">
      <div style="display:flex;justify-content:space-between;gap:12px;flex-wrap:wrap;margin-bottom:14px;align-items:center">
        <div class="seg" id="opsFilter">
          <label><input type="radio" name="opsf" value="all" checked><span>All</span></label>
          <label><input type="radio" name="opsf" value="bride"><span>Bride side</span></label>
          <label><input type="radio" name="opsf" value="groom"><span>Groom side</span></label>
          <label><input type="radio" name="opsf" value="flag"><span>Needs attention</span></label>
        </div>
        <span class="mini">Tap a family to update bag status</span>
      </div>
      <div class="opshead"><div>Booking</div><div>Family</div><div>Side</div><div>Guests</div><div>Bags</div><div>Flags</div></div>
      <div id="opsList"></div>
    </div>
  </div>
</section>

<footer>
  <div class="wrap">
    <svg viewBox="0 0 30 40" width="38" height="50" aria-hidden="true"><rect x="10" y="0" width="10" height="7" rx="2" fill="none" stroke="#F4EEE4" stroke-width="2.4"/><path d="M4 7h12c6 0 10 4 10 9 0 2.6-1.2 4.7-3 6 2.6 1.4 4 3.8 4 6.8C27 34 23 38 17 38H4z" fill="#F4EEE4"/><path d="M11 18l7 5-7 5z" fill="#24291F"/></svg>
    <div style="font-size:11px;letter-spacing:.2em;font-weight:700">BAGDROP</div>
    <div class="n">Yashna · Yash</div>
    <div class="d">17 &amp; 18 DECEMBER 2026 · UDAIPUR</div>
    <div class="h">#Y2K</div>
    <div class="base"><span>With love, from the mountains</span><span>Luggage handled by Bagdrop · Bag. Box. Delivered.</span></div>
  </div>
</footer>

<div class="toast" id="toast" hidden role="status"></div>
`;
