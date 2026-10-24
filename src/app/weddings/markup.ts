/** The wedding landing page's CSS + body markup, verbatim from the static
 *  build (wedding.css / wedding.html) — ported as strings so the look and
 *  DOM ids stay byte-for-byte identical; logic.ts drives it the same way
 *  wedding.js did. */

export const WEDDING_CSS = `
/* Wedding landing page — its own warm palette, independent of the platform theme. */
:root{
  --cream:#F4EEE4;--paper:#FBF8F2;--card:#FFFFFF;--ink:#2B2620;--body-c:#5A5145;
  --label:#6B5A3E;--stone:#8A8172;--line:#E0D5C2;--line-2:#EDE5D6;
  --forest:#2A3329;--forest-2:#24291F;--forest-card:#343D33;--on-dark:#F4EEE4;
  --gold:#C8A96E;--gold-2:#B08D57;--sand:#E8CE9A;--sand-2:#F1DFB6;
  --ok:#4E6B3F;--err:#A4452C;
  --display:"Cormorant Garamond",Georgia,serif;
  --sans:"Inter",system-ui,sans-serif;
  --mono:ui-monospace,Menlo,monospace;
  --r:14px;--gutter:clamp(16px,4vw,40px);
  color-scheme:light;
}
*{box-sizing:border-box}
[hidden]{display:none!important}
body{margin:0;background:var(--cream);color:var(--ink);font-family:var(--sans);font-size:16px;line-height:1.6;-webkit-font-smoothing:antialiased}
h1,h2,h3{text-wrap:balance;font-weight:400}
a{color:inherit}
:focus-visible{outline:2px solid var(--gold-2);outline-offset:2px}
.wrap{max-width:1180px;margin:0 auto;padding-inline:var(--gutter)}
.eyebrow{font-size:12px;letter-spacing:.28em;text-transform:uppercase;color:var(--gold-2);font-weight:500}
.on-dark .eyebrow{color:var(--gold)}
h2.big{font-family:var(--display);font-size:clamp(40px,6vw,68px);line-height:1.04;letter-spacing:-.01em;margin:.3em 0 .4em}
h2.big em{font-style:italic;color:var(--label)}
.lede{max-width:56ch;color:var(--body-c)}
.on-dark .lede{color:rgba(244,238,228,.78)}

.nav{position:sticky;top:0;z-index:40;background:rgba(244,238,228,.92);backdrop-filter:blur(10px);border-bottom:1px solid var(--line-2)}
.nav .wrap{display:flex;align-items:center;justify-content:space-between;gap:16px;height:72px}
.logo{display:flex;align-items:center;gap:10px;text-decoration:none}
.logo b{font-size:10px;letter-spacing:.14em;font-weight:700}
.nav ul{display:flex;gap:28px;list-style:none;margin:0;padding:0;align-items:center}
.nav ul a{text-decoration:none;font-size:12px;letter-spacing:.18em;text-transform:uppercase}
.nav .pill{border:1px solid var(--ink);border-radius:99px;padding:9px 18px}
.nav .pill:hover{background:var(--ink);color:var(--cream)}
@media (max-width:760px){.nav ul li.hide-sm{display:none}.nav ul{gap:14px}}

.hero{position:relative;min-height:560px;display:grid;place-items:center;text-align:center;color:var(--on-dark);overflow:hidden;
  background:linear-gradient(180deg,#3a3225 0%,#4a3e30 45%,#5a4b38 100%)}
.hero .in{position:relative;padding-block:90px 70px}
.hero .place{font-size:12px;letter-spacing:.42em;text-transform:uppercase;opacity:.85}
.names{font-family:var(--display);font-style:italic;font-size:clamp(56px,12vw,140px);line-height:1;margin:.25em 0 .2em}
.date-pill{display:inline-flex;align-items:center;gap:14px;border:1px solid rgba(244,238,228,.35);background:rgba(36,30,22,.35);border-radius:99px;padding:10px 22px;font-size:13px;letter-spacing:.24em}
.count{display:flex;justify-content:center;gap:clamp(20px,5vw,56px);margin-top:34px}
.count div{display:grid;gap:2px}
.count b{font-family:var(--display);font-weight:400;font-size:clamp(36px,6vw,56px);line-height:1;color:var(--sand);font-variant-numeric:tabular-nums}
.count span{font-size:10px;letter-spacing:.28em;text-transform:uppercase;opacity:.7}

.strip{background:var(--cream);padding-block:64px;text-align:center}
.strip h3{font-family:var(--display);font-size:clamp(28px,4vw,40px);margin:0 0 8px;letter-spacing:.04em;text-transform:uppercase}
.strip p{margin:0 auto 22px;max-width:52ch;color:var(--body-c)}
.chips{display:flex;gap:10px;justify-content:center;flex-wrap:wrap}
.chip{display:inline-flex;align-items:center;gap:8px;border:1px solid var(--line);background:var(--paper);border-radius:99px;padding:7px 14px;font-size:12px;letter-spacing:.08em;color:var(--label)}
.chip i{width:7px;height:7px;border-radius:50%;background:var(--ok);display:inline-block}

.btn{display:inline-flex;align-items:center;justify-content:center;gap:10px;border:0;cursor:pointer;
  font:600 13px/1 var(--sans);letter-spacing:.16em;text-transform:uppercase;border-radius:var(--r);
  padding:16px 26px;background:var(--forest);color:var(--on-dark);text-decoration:none;transition:transform .15s,background .15s}
.btn:hover{background:var(--forest-2);transform:translateY(-1px)}
.btn.ghost{background:transparent;color:var(--ink);border:1px solid var(--line)}
.btn.sm{padding:10px 14px;font-size:11px;border-radius:10px}
.btn[disabled]{opacity:.45;cursor:not-allowed;transform:none}

.travel{background:var(--forest);color:var(--on-dark);padding-block:90px}
.steps{display:grid;grid-template-columns:repeat(4,1fr);gap:16px;margin-top:48px}
@media (max-width:980px){.steps{grid-template-columns:repeat(2,1fr)}}
@media (max-width:520px){.steps{grid-template-columns:1fr}}
.stepc{background:var(--forest-card);border:1px solid rgba(244,238,228,.08);border-radius:18px;padding:26px 22px}
.stepc b{font-family:var(--display);font-weight:400;font-size:40px;color:var(--gold);line-height:1}
.stepc h4{margin:14px 0 6px;font-size:16px;font-weight:600}
.stepc p{margin:0;font-size:14px;color:rgba(244,238,228,.7)}

.book{padding-block:90px}
.book .head{text-align:center;margin-bottom:40px}
.book .head .lede{margin:0 auto}
.panel{background:var(--card);border:1px solid var(--line-2);border-radius:24px;padding:clamp(20px,3.5vw,40px);
  box-shadow:0 30px 60px -40px rgba(58,46,28,.35);max-width:720px;margin:0 auto}
label.f{display:grid;gap:7px;margin-bottom:16px}
label.f>span{font-size:11px;font-weight:600;letter-spacing:.08em;text-transform:uppercase;color:var(--label)}
input,select,textarea{width:100%;font:400 15px/1.3 var(--sans);color:var(--ink);background:var(--paper);
  border:1px solid var(--line);border-radius:12px;padding:12px 14px;min-height:46px;appearance:none}
select{background-image:linear-gradient(45deg,transparent 50%,var(--label) 50%),linear-gradient(135deg,var(--label) 50%,transparent 50%);
  background-position:calc(100% - 18px) 50%,calc(100% - 13px) 50%;background-size:5px 5px;background-repeat:no-repeat;padding-right:34px}
input:focus,select:focus{outline:none;border-color:var(--gold-2);box-shadow:0 0 0 3px rgba(200,169,110,.2)}
.grid2{display:grid;grid-template-columns:1fr 1fr;gap:0 18px}
@media (max-width:620px){.grid2{grid-template-columns:1fr}}
.hint{font-size:12px;color:var(--stone)}
.msg{font-size:13px;color:var(--err)}
.callout{border-radius:14px;padding:14px 16px;font-size:14px;background:#F8F1E4;border:1px solid #EADBC0;color:#5B4A2E;margin-bottom:16px}
.callout.ok{background:#EEF2E8;border-color:#D4DEC8;color:#3C5230}
.tick{display:flex;gap:10px;align-items:flex-start;font-size:14px;cursor:pointer;margin-bottom:12px}
.tick input{width:18px;height:18px;margin:2px 0 0;accent-color:var(--forest);flex:none;min-height:0}
.stepperc{display:flex;align-items:center;gap:12px;border:1px solid var(--line);border-radius:12px;padding:10px 14px;margin-bottom:16px;background:var(--paper)}
.stepperc button{width:38px;height:38px;min-height:0;border-radius:10px;border:1px solid var(--line);background:var(--card);font-size:20px;cursor:pointer;padding:0}
.stepperc .n{font-family:var(--display);font-size:26px;min-width:30px;text-align:center}
.bid{font-family:var(--mono);font-size:20px;letter-spacing:.06em}
.done-tick{width:64px;height:64px;border-radius:50%;background:#EEF2E8;color:var(--ok);display:inline-flex;align-items:center;justify-content:center;font-size:30px;margin-bottom:10px}

.trackw{background:var(--paper);padding-block:80px;border-top:1px solid var(--line-2)}
.trk{border:1px solid var(--line);border-radius:16px;padding:16px;background:var(--card);margin-top:12px}
.trk .top{display:flex;justify-content:space-between;gap:10px;flex-wrap:wrap;font-size:14px}
.state{display:inline-flex;align-items:center;gap:6px;border-radius:99px;padding:3px 10px;font-size:12px;font-weight:600;background:#EEF2E8;color:#3C5230}

footer{background:var(--forest-2);color:var(--on-dark);text-align:center;padding-block:70px 36px}
footer .n{font-family:var(--display);font-style:italic;font-size:clamp(40px,6vw,60px);margin:18px 0 8px}
footer .d{font-size:12px;letter-spacing:.28em;color:rgba(244,238,228,.6)}
footer .h{color:var(--gold);letter-spacing:.2em;margin-top:8px;font-size:14px}
footer .base{border-top:1px solid rgba(244,238,228,.1);margin-top:40px;padding-top:22px;font-size:12px;color:rgba(244,238,228,.5);display:flex;gap:18px;justify-content:center;flex-wrap:wrap}
@media (prefers-reduced-motion:reduce){*{animation:none!important;transition:none!important}}
`;

export const WEDDING_HTML = `
<nav class="nav" aria-label="Main"><div class="wrap">
  <a class="logo" href="#top" aria-label="Bagdrop">
    <svg viewBox="0 0 30 40" width="30" height="40" aria-hidden="true"><rect x="10" y="0" width="10" height="7" rx="2" fill="none" stroke="#2B2620" stroke-width="2.4"/><path d="M4 7h12c6 0 10 4 10 9 0 2.6-1.2 4.7-3 6 2.6 1.4 4 3.8 4 6.8C27 34 23 38 17 38H4z" fill="#2B2620"/><path d="M11 18l7 5-7 5z" fill="#F4EEE4"/></svg>
    <b>BAGDROP</b>
  </a>
  <ul>
    <li class="hide-sm"><a href="#l-travel">Travel</a></li>
    <li><a href="#l-track">Track</a></li>
    <li><a class="pill" href="#l-book">Book bags</a></li>
  </ul>
</div></nav>

<div id="notfound" class="wrap" hidden style="padding-block:120px;text-align:center">
  <h2 class="big">This page is not open yet.</h2>
  <p class="lede" style="margin:0 auto">Check the link on your invitation, or ask the hosts for a fresh one.</p>
</div>

<div id="page" hidden>

<header class="hero" id="top">
  <div class="in wrap">
    <div class="place" id="l-place">—</div>
    <h1 class="names" id="l-names">—</h1>
    <div class="date-pill" id="l-dates">—</div>
    <div class="count"><div><b id="cd-d">--</b><span>Days</span></div><div><b id="cd-h">--</b><span>Hours</span></div><div><b id="cd-m">--</b><span>Minutes</span></div><div><b id="cd-s">--</b><span>Seconds</span></div></div>
  </div>
</header>

<section class="strip"><div class="wrap">
  <h3>Travel light</h3>
  <p id="l-stripp">One booking for your whole family. Every bag tagged, sealed and tracked from your door to your room, and back home after.</p>
  <div class="chips" id="l-chips"></div>
  <p style="margin-top:28px"><a class="btn" href="#l-book">Book luggage pickup</a></p>
</div></section>

<section class="travel on-dark" id="l-travel"><div class="wrap">
  <div class="eyebrow">How it works</div>
  <h2 class="big">Your bags, handled. So the celebration is all <em>you</em> carry.</h2>
  <p class="lede" id="l-destp"></p>
  <div class="steps">
    <div class="stepc"><b>01</b><h4>Door pickup at home</h4><p>One booking covers every family member, even when they live at different addresses.</p></div>
    <div class="stepc"><b>02</b><h4>Tagged, photographed, sealed</h4><p>Each bag is scanned, weighed and sealed at your door. You get the list with photos on WhatsApp.</p></div>
    <div class="stepc"><b>03</b><h4>In your room after check-in</h4><p>Matched to the hosts' rooming list. Bags arriving early wait safely at the bell desk.</p></div>
    <div class="stepc"><b>04</b><h4>Home again after</h4><p>We collect from your room at checkout and deliver back to your door.</p></div>
  </div>
</div></section>

<section class="book" id="l-book"><div class="wrap">
  <div class="head">
    <div class="eyebrow">Reserve your pickup</div>
    <h2 class="big">Book for your whole family</h2>
    <p class="lede" id="l-booklede">About three minutes. No payment: the hosts have covered it. You confirm with a one-time Aadhaar code at the end.</p>
  </div>

  <div class="panel" id="formview">
    <div class="grid2">
      <label class="f"><span>Family name</span><input id="w-fam" placeholder="The Amins"></label>
      <label class="f"><span>Lead guest · full name as on ID</span><input id="w-lead" placeholder="Mihir Amin"></label>
    </div>
    <div class="grid2">
      <label class="f"><span>Mobile</span><input id="w-mob" inputmode="tel" placeholder="+91 98XXX XXXXX"></label>
      <label class="f"><span>Pickup city</span><select id="w-city"></select></label>
    </div>
    <label class="f"><span>Pickup address</span><input id="w-addr" placeholder="Flat, building, area or pincode"></label>
    <div class="callout" id="w-days">—</div>
    <div class="stepperc"><div style="flex:1"><b style="font-family:var(--display);font-size:18px">Bags</b><div class="hint">Suitcase, duffel, garment bag · up to 32 kg each</div></div><button id="w-minus" aria-label="Fewer bags">−</button><span class="n" id="w-n">2</span><button id="w-plus" aria-label="More bags">+</button></div>
    <div class="grid2">
      <label class="f"><span>Side</span><select id="w-side"></select></label>
      <label class="f"><span>Anything we should know <em style="text-transform:none;letter-spacing:0;font-weight:400;color:var(--stone)">(optional)</em></span><input id="w-note" placeholder="Outfits to hang on arrival · fragile item"></label>
    </div>
    <label class="tick"><input type="checkbox" id="w-proh"> <span>Nothing prohibited is packed: no cash, jewellery, passports, medicines needed in transit, or loose lithium batteries. The captain checks and seals each bag with us at the door.</span></label>
    <label class="tick"><input type="checkbox" id="w-ind"> <span>I accept the indemnity and release terms sent with the confirmation.</span></label>
    <div class="callout" id="w-aadbox" hidden><b>Confirm with Aadhaar</b> · UIDAI sends a code to the mobile linked to the lead guest's Aadhaar <span style="font-family:var(--mono)">(demo: 112233)</span>.<br>
      <input id="w-aad" maxlength="6" inputmode="numeric" placeholder="••••••" style="max-width:160px;margin-top:8px;letter-spacing:.3em;font-family:var(--mono)">
    </div>
    <div class="msg" id="w-msg" style="margin-bottom:10px"></div>
    <button class="btn" id="w-go" style="width:100%">Reserve the pickup</button>
  </div>

  <div class="panel" id="doneview" hidden style="text-align:center">
    <div class="done-tick">✓</div>
    <h2 class="big" style="font-size:clamp(28px,4vw,40px)">Done. Your bags are on the plan.</h2>
    <p class="lede" style="margin:0 auto 16px">Reference <span class="bid" id="w-ref"></span><br>Confirmation on WhatsApp with each bag's tag. Track below any time with your mobile number.</p>
    <div class="callout ok" id="w-donedays" style="text-align:left"></div>
    <a class="btn ghost" href="#l-track">Track my bags</a>
  </div>
</div></section>

<section class="trackw" id="l-track"><div class="wrap">
  <div class="eyebrow">Track</div>
  <h2 class="big">Where are my bags?</h2>
  <div style="display:flex;gap:10px;flex-wrap:wrap;align-items:center;margin-bottom:8px">
    <input type="tel" id="l-trackmob" placeholder="Mobile used to book" style="max-width:260px">
    <button class="btn sm" type="button" id="l-trackgo">Show my bags</button>
  </div>
  <div id="l-trackBox"></div>
</div></section>

<footer><div class="wrap">
  <svg viewBox="0 0 30 40" width="38" height="50" aria-hidden="true"><rect x="10" y="0" width="10" height="7" rx="2" fill="none" stroke="#F4EEE4" stroke-width="2.4"/><path d="M4 7h12c6 0 10 4 10 9 0 2.6-1.2 4.7-3 6 2.6 1.4 4 3.8 4 6.8C27 34 23 38 17 38H4z" fill="#F4EEE4"/><path d="M11 18l7 5-7 5z" fill="#24291F"/></svg>
  <div style="font-size:11px;letter-spacing:.2em;font-weight:700">BAGDROP</div>
  <div class="n" id="l-footnames">—</div>
  <div class="d" id="l-footdates"></div>
  <div class="h" id="l-foothash"></div>
  <div class="base"><span>With love</span><span>Luggage handled by Bagdrop · Bag. Box. Delivered.</span></div>
</div></footer>

</div>
`;
