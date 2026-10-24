/** Y2K wedding desk — CSS and body markup. The marketing chrome (nav, hero,
 *  banner, celebration, destination, travel) was redesigned to match the
 *  live bagdrop.co/y2k page (real photography, fixed/hamburger nav, dark
 *  "wedding-synced" banner) — see the redesign note in y2k-logic.ts. The
 *  booking wizard, track and ops sections further down (the "Booking"
 *  comment block) are unchanged: bagdrop.co/y2k's own wizard CSS (its
 *  ".ywz" namespace) is the same design already ported here. */

export const Y2K_CSS = `
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

/* Nav — fixed, transparent over the hero; gains a solid background once
 *  scrolled past it (logic.ts toggles .scrolled). Collapses to a hamburger
 *  + slide-in drawer under 860px. */
.nav{position:fixed;top:0;left:0;right:0;z-index:100;height:92px;display:flex;align-items:center;justify-content:space-between;padding:0 clamp(20px,5vw,56px);background:transparent;color:var(--on-dark);transition:background .4s ease,color .4s ease,box-shadow .4s ease}
.nav.scrolled{background:rgba(244,238,228,.94);backdrop-filter:blur(10px);color:var(--ink);box-shadow:0 1px 0 var(--line-2)}
.nav .logo{display:flex;align-items:center}
/* The logo file is a flat white silhouette, so a filter-revealed "true
 * color" is invisible on a light background (reported bug: white-on-white
 * once .scrolled makes the nav background cream). Rendered as a CSS mask
 * instead, so its color is ours to set: white on the hero, ink once
 * scrolled (readable on the cream background), gold on hover either way. */
.nav .logo .mark{display:block;height:clamp(48px,8vw,80px);aspect-ratio:1092/1552;width:auto;background-color:#fff;-webkit-mask:url(/logo-white.png) center/contain no-repeat;mask:url(/logo-white.png) center/contain no-repeat;transition:background-color .3s ease}
.nav.scrolled .logo .mark{background-color:var(--ink)}
.nav .logo:hover .mark{background-color:var(--gold)}
.nav-links{display:flex;align-items:center;gap:34px;font-size:12.5px;font-weight:500;letter-spacing:.13em;text-transform:uppercase}
.nav-links a{text-decoration:none;transition:color .2s ease}
.nav-links a:not(.pill):hover{color:var(--gold)}
.nav.scrolled .nav-links a:not(.pill):hover{color:var(--gold-2)}
.nav-links .pill{border:1px solid currentColor;padding:9px 20px;border-radius:999px;transition:background .2s,color .2s,border-color .2s}
.nav-links .pill:hover{background:var(--gold);border-color:var(--gold);color:var(--forest)}
.hamburger{display:none;background:none;border:0;color:inherit;cursor:pointer;padding:8px;flex-direction:column;gap:5px;width:42px;height:42px;align-items:center;justify-content:center}
.hamburger span{width:22px;height:1.5px;background:currentColor;display:block}
@media (max-width:860px){.nav-links{display:none}.hamburger{display:flex}}
.navdrawer-backdrop{position:fixed;inset:0;z-index:110;background:rgba(20,16,10,.45);backdrop-filter:blur(4px);opacity:0;pointer-events:none;transition:opacity .35s ease}
.navdrawer-backdrop.open{opacity:1;pointer-events:auto}
.navdrawer{position:fixed;top:0;right:0;bottom:0;z-index:120;width:min(82vw,340px);background:var(--forest);color:var(--on-dark);transform:translateX(100%);transition:transform .42s cubic-bezier(.22,1,.36,1);display:flex;flex-direction:column;padding:28px 30px;box-shadow:-20px 0 60px rgba(0,0,0,.3)}
.navdrawer.open{transform:translateX(0)}
.navdrawer .head{display:flex;justify-content:space-between;align-items:center;margin-bottom:48px}
.navdrawer .head span{font-family:var(--display);font-size:22px;letter-spacing:.04em}
.navdrawer .close{background:rgba(255,255,255,.1);border:0;color:var(--on-dark);width:40px;height:40px;border-radius:50%;font-size:20px;cursor:pointer;line-height:1}
.navdrawer nav{display:flex;flex-direction:column;gap:4px;font-family:var(--display)}
.navdrawer nav a{font-size:30px;padding:12px 0;border-bottom:1px solid rgba(255,255,255,.1);text-decoration:none}
.navdrawer .cta{margin-top:auto;text-align:center;background:var(--gold);color:var(--forest);font-family:var(--sans);font-size:13px;font-weight:600;letter-spacing:.16em;text-transform:uppercase;padding:18px;border-radius:999px;text-decoration:none}

/* Hero — real photography instead of canvas art */
.hero{position:relative;min-height:100svh;display:flex;flex-direction:column;align-items:center;justify-content:center;text-align:center;padding:100px 20px 56px;overflow:hidden;color:var(--on-dark)}
.hero .bg{position:absolute;inset:0;z-index:0;background-size:cover;background-position:center;background-image:url(/images/y2k-hero-mountains.webp)}
.hero .shade{position:absolute;inset:0;z-index:1;pointer-events:none;background:linear-gradient(180deg,rgba(20,16,10,.55) 0%,rgba(20,16,10,.32) 30%,rgba(20,16,10,.42) 58%,rgba(20,16,10,.82) 100%)}
.hero .vignette{position:absolute;inset:0;z-index:1;pointer-events:none;background:radial-gradient(ellipse 60% 45% at 50% 46%,rgba(20,16,10,.4) 0%,transparent 70%)}
.hero .ridge{position:absolute;left:0;right:0;bottom:0;width:100%;height:200px;z-index:1;pointer-events:none;opacity:.5}
.hero .in{position:relative;z-index:2;display:flex;flex-direction:column;align-items:center}
.hero .place{font-size:12px;font-weight:500;letter-spacing:.42em;text-transform:uppercase;opacity:.9;margin-bottom:28px;padding-left:.42em}
.names{font-family:var(--display);font-weight:400;font-size:clamp(52px,13vw,152px);line-height:.94;letter-spacing:-.01em;margin:0;display:flex;flex-wrap:wrap;align-items:center;justify-content:center;gap:clamp(14px,4vw,44px);text-shadow:0 2px 30px rgba(0,0,0,.55),0 1px 4px rgba(0,0,0,.4)}
.names em{font-style:italic}
.names .heart{width:clamp(28px,7vw,62px);height:auto;flex-shrink:0;color:var(--sand)}
.date-pill{display:flex;align-items:center;gap:16px;margin-top:34px;background:rgba(20,16,10,.32);border:1px solid rgba(232,206,154,.4);backdrop-filter:blur(2px);padding:12px 24px;border-radius:999px;font-size:clamp(12px,1.6vw,15px);letter-spacing:.28em;text-transform:uppercase;font-weight:600;color:var(--sand-2);text-shadow:0 1px 3px rgba(0,0,0,.5)}
.date-pill .ln{width:28px;height:1px;background:rgba(232,206,154,.6)}
.count{display:flex;gap:clamp(20px,6vw,52px);margin-top:48px}
.count div{display:flex;flex-direction:column;align-items:center;gap:8px}
.count b{font-family:var(--display);font-weight:400;font-size:clamp(34px,7vw,56px);line-height:1;color:var(--sand);font-variant-numeric:tabular-nums}
.count span{font-size:10px;letter-spacing:.24em;text-transform:uppercase;opacity:.8}

.btn{display:inline-flex;align-items:center;justify-content:center;gap:10px;border:0;cursor:pointer;font:600 13px/1 var(--sans);letter-spacing:.16em;text-transform:uppercase;border-radius:var(--r);padding:16px 26px;background:var(--forest);color:var(--on-dark);text-decoration:none;transition:transform .15s,background .15s}
.btn:hover{background:var(--forest-2);transform:translateY(-1px)}
.btn.ghost{background:transparent;color:var(--ink);border:1px solid var(--line)}
.btn.ghost:hover{background:var(--paper)}
.btn.gold{background:var(--sand);color:#3A2E1C}
.btn.sm{padding:10px 14px;font-size:11px;border-radius:10px}
.btn[disabled]{opacity:.45;cursor:not-allowed;transform:none}

/* Banner — "travel light to the mountains" card right under the hero */
.banner-wrap{background:var(--cream);padding:clamp(40px,7vw,80px) clamp(20px,5vw,56px) clamp(20px,4vw,48px);position:relative;z-index:3}
.banner{max-width:1120px;margin:0 auto;background:#4A3B29;color:var(--on-dark);border-radius:26px;padding:clamp(30px,5vw,52px);display:flex;flex-wrap:wrap;align-items:center;gap:clamp(22px,4vw,48px);box-shadow:0 30px 70px rgba(45,32,18,.28);position:relative;overflow:hidden}
.banner .ridge2{position:absolute;right:-20px;bottom:-10px;width:320px;height:120px;opacity:.14;pointer-events:none}
.banner .copy{flex:1 1 340px;min-width:min(260px,100%)}
.banner .copy .eyebrow{color:var(--sand)}
.banner .copy p{font-family:var(--display);font-size:clamp(24px,3.4vw,36px);line-height:1.24;margin:16px 0 0;font-weight:400}
.banner .stats-cta{flex:0 0 auto;display:flex;flex-direction:column;gap:14px;min-width:min(220px,100%)}
.banner .bstats{display:flex;gap:22px}
.banner .bstats b{font-family:var(--display);font-weight:400;font-size:30px;color:var(--sand);display:block;line-height:1}
.banner .bstats span{font-size:11px;letter-spacing:.12em;text-transform:uppercase;opacity:.7}
.banner .cta{text-align:center;background:var(--sand);color:#3A2E1C;font-family:var(--sans);font-size:12.5px;font-weight:600;letter-spacing:.16em;text-transform:uppercase;padding:16px 28px;border-radius:999px;text-decoration:none}

/* Celebration */
.cel{padding-block:clamp(96px,14vw,168px) clamp(60px,9vw,110px)}
.two{display:grid;grid-template-columns:1.05fr .95fr;gap:clamp(28px,6vw,80px);align-items:center}
.two>*{min-width:0}
@media (max-width:860px){.two{grid-template-columns:1fr}}
.stats{display:flex;gap:40px;margin-top:28px;flex-wrap:wrap}
.stats b{display:block;font-family:var(--display);font-weight:400;font-size:44px;line-height:1}
.stats span{font-size:11px;letter-spacing:.24em;text-transform:uppercase;color:var(--stone)}
.cel .photo{position:relative}
.cel .frame{position:relative;width:100%;aspect-ratio:4/5;border-radius:22px;overflow:hidden;box-shadow:0 30px 60px rgba(45,32,18,.16)}
.cel .frame img{width:100%;height:100%;object-fit:cover;display:block}
.cel .badge{position:absolute;bottom:-22px;left:-22px;background:var(--cream);padding:18px 24px;border-radius:16px;box-shadow:0 14px 34px rgba(45,32,18,.12);font-family:var(--display);font-style:italic;font-size:20px;color:var(--label)}

/* Destination — full-bleed photo */
.dusk{position:relative;min-height:86vh;display:flex;align-items:flex-end;padding:clamp(40px,8vw,88px) clamp(20px,5vw,56px);overflow:hidden;color:var(--on-dark)}
.dusk .bg{position:absolute;inset:0;z-index:0;background-size:cover;background-position:center;background-image:url(/images/y2k-taj-aravali-dusk.webp)}
.dusk .shade{position:absolute;inset:0;z-index:1;pointer-events:none;background:linear-gradient(180deg,rgba(20,16,10,.34) 0%,rgba(20,16,10,.05) 40%,rgba(20,16,10,.78) 100%)}
.dusk .in{position:relative;z-index:2;max-width:1120px;margin:0 auto;width:100%}
.dusk h2{font-family:var(--display);font-weight:400;font-size:clamp(42px,8vw,96px);line-height:1;margin:18px 0 0;letter-spacing:-.01em}
.dusk h2 em{font-style:italic;display:block}
.dusk p{font-size:clamp(15px,1.8vw,18px);line-height:1.8;max-width:52ch;margin:24px 0 0;color:rgba(244,238,228,.9)}

/* Travel */
.travel{background:var(--forest);color:var(--on-dark);padding-block:clamp(88px,12vw,148px);position:relative;overflow:hidden}
.travel .ridge3{position:absolute;left:0;right:0;top:0;width:100%;height:220px;opacity:.1;pointer-events:none}
.travel .photo{position:relative}
.travel .frame{position:relative;width:100%;aspect-ratio:4/3;border-radius:22px;overflow:hidden;box-shadow:0 30px 60px rgba(0,0,0,.28)}
.travel .frame img{width:100%;height:100%;object-fit:cover;display:block}
.travel .badge{position:absolute;bottom:-18px;left:-18px;background:var(--sand);color:var(--forest);padding:12px 20px;border-radius:14px;box-shadow:0 14px 34px rgba(0,0,0,.22);font-size:11px;font-weight:600;letter-spacing:.14em;text-transform:uppercase}
.steps{display:grid;grid-template-columns:repeat(3,1fr);gap:16px;margin-top:56px}
@media (max-width:860px){.steps{grid-template-columns:repeat(2,1fr)}}
@media (max-width:520px){.steps{grid-template-columns:1fr}}
.step{background:var(--forest-card);border:1px solid rgba(244,238,228,.08);border-radius:18px;padding:26px 22px}
.step b{font-family:var(--display);font-weight:400;font-size:40px;color:var(--gold);line-height:1}
.step h4{margin:14px 0 6px;font-size:16px;font-weight:600}
.step p{margin:0;font-size:14px;color:rgba(244,238,228,.7)}

/* Fade-up reveal on scroll (logic.ts toggles .in via IntersectionObserver) */
.reveal{opacity:0;transform:translateY(28px);transition:opacity .6s ease,transform .6s ease}
.reveal.in{opacity:1;transform:none}
@media (prefers-reduced-motion:reduce){.reveal{opacity:1;transform:none}}

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
<nav class="nav" id="siteNav" aria-label="Main">
  <a class="logo" href="#top" aria-label="Bagdrop"><span class="mark"></span></a>
  <div class="nav-links">
    <a href="#celebration">Celebration</a>
    <a href="#destination">Destination</a>
    <a href="#travel">Travel</a>
    <a class="pill" href="#book">Book Bags</a>
  </div>
  <button type="button" class="hamburger" id="navOpen" aria-label="Open menu">
    <span></span><span></span><span></span>
  </button>
</nav>

<div class="navdrawer-backdrop" id="navBackdrop"></div>
<aside class="navdrawer" id="navDrawer">
  <div class="head">
    <span>Yashna &amp; Yash</span>
    <button type="button" class="close" id="navClose" aria-label="Close menu">&times;</button>
  </div>
  <nav>
    <a href="#celebration" data-nav-link>The Celebration</a>
    <a href="#destination" data-nav-link>The Destination</a>
    <a href="#travel" data-nav-link>Travel Light</a>
  </nav>
  <a href="#book" class="cta" data-nav-link>Book Luggage Pickup</a>
</aside>

<header class="hero" id="top">
  <div class="bg" aria-hidden="true"></div>
  <div class="shade" aria-hidden="true"></div>
  <div class="vignette" aria-hidden="true"></div>
  <svg class="ridge" viewBox="0 0 1440 220" preserveAspectRatio="none" aria-hidden="true">
    <path d="M0 220 L0 150 L180 92 L340 138 L520 60 L700 128 L900 44 L1080 120 L1260 78 L1440 132 L1440 220 Z" fill="none" stroke="rgba(244,238,228,0.35)" stroke-width="1.2"/>
  </svg>
  <div class="in">
    <div class="place">Taj Aravali · Udaipur</div>
    <h1 class="names"><em>Yashna</em> <svg class="heart" viewBox="0 0 24 24" aria-label="and"><path d="M12 21.2s-8.2-5.1-10.4-10C-0.2 6.6 2.6 3.4 6.2 4c2 .3 3.2 1.7 3.8 3 .6-1.3 1.8-2.7 3.8-3 3.6-.6 6.4 2.6 4.6 7.2-2.2 4.9-10.4 10-10.4 10Z" fill="none" stroke="currentColor" stroke-width="1"/></svg> <em>Yash</em></h1>
    <div class="date-pill"><span class="ln"></span>17 &amp; 18 December 2026<span class="ln"></span></div>
    <div class="count" aria-live="off">
      <div><b id="cd-d">--</b><span>Days</span></div>
      <div><b id="cd-h">--</b><span>Hours</span></div>
      <div><b id="cd-m">--</b><span>Minutes</span></div>
      <div><b id="cd-s">--</b><span>Seconds</span></div>
    </div>
  </div>
</header>

<section class="banner-wrap">
  <div class="banner reveal">
    <svg class="ridge2" viewBox="0 0 400 120" preserveAspectRatio="none" aria-hidden="true">
      <path d="M0 120 L60 60 L120 92 L200 30 L280 84 L340 48 L400 90 L400 120 Z" fill="none" stroke="#E8CE9A" stroke-width="2"/>
    </svg>
    <div class="copy">
      <div class="eyebrow">Travel light to the mountains</div>
      <p>Arrive with only your best self. We&#x27;ll carry your bags door-to-destination. Your bags reach before you do!</p>
    </div>
    <div class="stats-cta">
      <div class="bstats">
        <div><b>Wedding</b><span>Synced</span></div>
        <div><b>100%</b><span>Fully wrapped</span></div>
      </div>
      <a href="#book" class="cta">Book Luggage Pickup</a>
    </div>
  </div>
</section>

<section class="cel" id="celebration">
  <div class="wrap two">
    <div class="reveal">
      <div class="eyebrow">01 — The Celebration</div>
      <h2 class="big">Two days in the <em>Aravallis</em>, one forever.</h2>
      <p class="lede">We're gathering the people we love most in the folds of the oldest mountains in India — for slow mornings, long evenings, and a wedding under an open Udaipur sky. No rush, no noise. Just us, and you.</p>
      <div class="stats">
        <div><b>2</b><span>Days</span></div>
        <div><b>1</b><span>Palace</span></div>
        <div><b>∞</b><span>Memories</span></div>
      </div>
    </div>
    <div class="reveal photo">
      <div class="frame"><img src="/images/y2k-couple.jpeg" alt="Yashna &amp; Yash"/></div>
      <div class="badge">#Y2K</div>
    </div>
  </div>
</section>

<section class="dusk" id="destination">
  <div class="bg" aria-hidden="true"></div>
  <div class="shade" aria-hidden="true"></div>
  <div class="in">
    <div class="reveal">
      <div class="eyebrow">02 — The Destination</div>
      <h2>Taj Aravali,<br/><em>Udaipur</em></h2>
      <p>Tucked into the Aravalli range above the City of Lakes — terraced gardens, still water, and mountain light that turns gold at dusk. A 30-minute drive from Maharana Pratap Airport.</p>
    </div>
  </div>
</section>

<section class="travel" id="travel">
  <svg class="ridge3" viewBox="0 0 1440 260" preserveAspectRatio="none" aria-hidden="true">
    <path d="M0 260 L0 180 L200 100 L400 160 L620 70 L840 150 L1060 60 L1260 140 L1440 90 L1440 260 Z" fill="none" stroke="#E8CE9A" stroke-width="1.4"/>
  </svg>
  <div class="wrap">
    <div class="two">
      <div class="reveal">
        <div class="eyebrow">03 — Travel Light</div>
        <h2 class="big">Your bags, handled.<br/>So the mountains are all you carry.</h2>
        <p class="lede">Powered by Bagdrop. We collect your luggage in Mumbai and deliver it straight to your room at Taj Aravali — wedding-synced &amp; fully wrapped.</p>
      </div>
      <div class="reveal photo">
        <div class="frame"><img src="/images/y2k-bagdrop-luggage.webp" alt="Bagdrop luggage delivery"/></div>
        <div class="badge">Mumbai → Udaipur</div>
      </div>
    </div>
    <div class="steps">
      <div class="reveal step"><b>01</b><h4>Door pickup, Mumbai</h4><p>From home or the airport — one tap and we're there.</p></div>
      <div class="reveal step"><b>02</b><h4>Wedding-synced transit</h4><p>Tracked end-to-end, timed to land when you do.</p></div>
      <div class="reveal step"><b>03</b><h4>Delivered to your room</h4><p>Waiting at Taj Aravali before you check in.</p></div>
    </div>
  </div>
</section>

<section class="book" id="book">
  <div class="wrap">
    <div class="head">
      <div class="eyebrow">04 — Reserve Your Pickup</div>
      <h2 class="big">Book your luggage pickup</h2>
      <p class="lede">One request for your whole family. Pickups run 10–12 December 2026 from Mumbai.</p>
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
    <img src="/logo-white.png" alt="Bagdrop" style="display:block;margin:0 auto 36px;height:clamp(64px,14vw,120px);width:auto;opacity:.95"/>
    <div class="n">Yashna · Yash</div>
    <div class="d">17 &amp; 18 DECEMBER 2026 · UDAIPUR</div>
    <div class="h">#Y2K</div>
    <div class="base"><span>With love, from the mountains</span><span>Luggage handled by Bagdrop · Bag. Box. Delivered.</span></div>
  </div>
</footer>

<div class="toast" id="toast" hidden role="status"></div>
`;
