/* Bagdrop document engine.
   Every business document — LR, manifest, proforma invoice, tax invoice,
   payment/cash receipt, credit voucher, MIS report — renders on the company
   letterhead in a print window: Save as PDF from there (the print dialog),
   or share a summary straight to WhatsApp / email. Numbering is sequential
   per document type and persists in the back end (settings/seq). */
(function () {
  "use strict";
  var CFG = window.BAGDROP_CONFIG || {}, CO = CFG.company || {};
  var inr = function (n) { return "₹" + Math.round(n || 0).toLocaleString("en-IN"); };

  /* ---------- sequential numbering ---------- */
  var FY = (function () {
    var d = new Date(), y = d.getFullYear();
    return d.getMonth() >= 3 ? y + "-" + String(y + 1).slice(-2) : (y - 1) + "-" + String(y).slice(-2);
  })();
  function nextNo(type) {
    /* LR, MF, PI, INV, RCT, CSH, CV */
    return DB.get("settings", "seq").then(function (doc) {
      var seq = (doc && doc.seq) || {};
      seq[type] = (seq[type] || 0) + 1;
      return DB.put("settings", "seq", { id: "seq", created: DB.now(), seq: seq }).then(function () {
        return type + "/" + FY + "/" + String(seq[type]).padStart(4, "0");
      });
    });
  }

  /* ---------- letterhead print window ---------- */
  var DOC_CSS = [
    "*{box-sizing:border-box}",
    "body{font:13px/1.5 'Inter',system-ui,sans-serif;color:#1a1a1a;margin:0;padding:28px;max-width:860px;margin-inline:auto}",
    ".lh{display:flex;justify-content:space-between;gap:16px;border-bottom:3px solid #EA580C;padding-bottom:14px;margin-bottom:6px}",
    ".lh h1{font-size:19px;margin:0;letter-spacing:.02em}",
    ".lh .t{font-size:10px;letter-spacing:.14em;color:#EA580C;font-weight:600}",
    ".lh .a{font-size:10.5px;color:#555;margin-top:4px;max-width:46ch}",
    ".lh .r{text-align:right;font-size:10.5px;color:#555}",
    ".dt{display:flex;justify-content:space-between;align-items:baseline;margin:14px 0 10px}",
    ".dt h2{font-size:15px;margin:0;text-transform:uppercase;letter-spacing:.12em}",
    ".dt .no{font-family:ui-monospace,monospace;font-size:13px}",
    "table{width:100%;border-collapse:collapse;font-size:12px;margin:10px 0}",
    "th{text-align:left;font-size:10px;letter-spacing:.08em;text-transform:uppercase;color:#666;border-bottom:1.5px solid #ddd;padding:7px 8px;background:#FAFAF8}",
    "td{padding:7px 8px;border-bottom:1px solid #eee;vertical-align:top}",
    ".num{text-align:right;font-variant-numeric:tabular-nums}",
    ".tot td{border-top:2px solid #1a1a1a;border-bottom:0;font-weight:700}",
    ".grid2{display:grid;grid-template-columns:1fr 1fr;gap:14px;margin:10px 0}",
    ".box{border:1px solid #ddd;border-radius:8px;padding:10px 12px;font-size:12px}",
    ".box b{display:block;font-size:10px;letter-spacing:.08em;text-transform:uppercase;color:#888;margin-bottom:4px}",
    ".terms{font-size:10px;color:#666;margin-top:14px;border-top:1px solid #eee;padding-top:10px}",
    ".sig{display:flex;justify-content:space-between;margin-top:44px;font-size:11px}",
    ".sig div{border-top:1px solid #999;padding-top:6px;width:200px;text-align:center}",
    ".stamp{font-size:10px;color:#aaa;text-align:center;margin-top:24px;letter-spacing:.2em}",
    ".bar{display:flex;gap:8px;justify-content:flex-end;margin-bottom:16px}",
    ".bar button,.bar a{font:600 12px 'Inter',sans-serif;border:1px solid #ddd;background:#fff;border-radius:8px;padding:9px 14px;cursor:pointer;text-decoration:none;color:#1a1a1a}",
    ".bar .p{background:#EA580C;color:#fff;border-color:#EA580C}",
    "@media print{.bar{display:none}body{padding:0}}"
  ].join("\n");

  function letterhead() {
    return '<div class="lh"><div><div class="t">' + (CO.tagline || "") + "</div><h1>" + (CO.name || "BAGDROP") + '</h1>' +
      '<div class="a">' + (CO.address || "") + "</div></div>" +
      '<div class="r">' + (CO.phone || "") + "<br>" + (CO.email || "") + " · " + (CO.web || "") +
      "<br>GSTIN " + (CO.gstin || "") + " · SAC " + (CO.sac || "") + "</div></div>";
  }

  /* openDoc: renders a document and offers Print/PDF, WhatsApp, Email */
  function openDoc(title, docNo, bodyHTML, shareText, toMobile, toEmail) {
    var wa = "https://wa.me/" + String(toMobile || "").replace(/\D/g, "") + "?text=" + encodeURIComponent(shareText || title);
    var mail = "mailto:" + encodeURIComponent(toEmail || "") + "?subject=" + encodeURIComponent(title + " · " + (docNo || "")) + "&body=" + encodeURIComponent((shareText || "") + "\n\n(Attach the PDF saved from the print dialog.)");
    var html = "<!doctype html><html><head><meta charset='utf-8'><title>" + title + " " + (docNo || "") + "</title>" +
      "<link rel='stylesheet' href='https://fonts.googleapis.com/css2?family=Inter:wght@400;600;700&display=swap'>" +
      "<style>" + DOC_CSS + "</style></head><body>" +
      '<div class="bar"><a href="' + wa + '" target="_blank">Share on WhatsApp</a><a href="' + mail + '">Email</a><button class="p" onclick="print()">Print / Save as PDF</button></div>' +
      letterhead() +
      '<div class="dt"><h2>' + title + '</h2><div class="no">' + (docNo || "") + " · " + new Date().toLocaleDateString("en-IN", { day: "2-digit", month: "short", year: "numeric" }) + "</div></div>" +
      bodyHTML +
      '<div class="stamp">SEALED · TRACKED · INSURED — THE BAGGAGE LAYER</div>' +
      "</body></html>";
    var w = window.open("", "_blank");
    if (!w) { alert("Allow pop-ups to open documents, or use your own browser."); return; }
    w.document.write(html);
    w.document.close();
  }

  /* generic helpers the modules compose documents from */
  function kv(pairs) {
    return '<div class="grid2">' + pairs.map(function (p) {
      return '<div class="box"><b>' + p[0] + "</b>" + (p[1] || "—") + "</div>";
    }).join("") + "</div>";
  }
  function moneyTable(rows, totalLabel, total) {
    return "<table><thead><tr><th>Particulars</th><th class='num'>Amount</th></tr></thead><tbody>" +
      rows.map(function (r) { return "<tr><td>" + r[0] + "</td><td class='num'>" + inr(r[1]) + "</td></tr>"; }).join("") +
      "<tr class='tot'><td>" + (totalLabel || "Total") + "</td><td class='num'>" + inr(total) + "</td></tr></tbody></table>";
  }
  function sigBlock(left) {
    return '<div class="sig"><div>' + (left || "Customer / consignor") + "</div><div>For " + (CO.name || "Bagdrop") + "<br>Authorised signatory</div></div>";
  }
  function inWords(n) {
    n = Math.round(n || 0);
    if (!n) return "Zero rupees";
    var a = ["", "one", "two", "three", "four", "five", "six", "seven", "eight", "nine", "ten", "eleven", "twelve", "thirteen", "fourteen", "fifteen", "sixteen", "seventeen", "eighteen", "nineteen"];
    var b = ["", "", "twenty", "thirty", "forty", "fifty", "sixty", "seventy", "eighty", "ninety"];
    function two(x) { return x < 20 ? a[x] : b[Math.floor(x / 10)] + (x % 10 ? " " + a[x % 10] : ""); }
    function three(x) { return (x > 99 ? a[Math.floor(x / 100)] + " hundred " : "") + (x % 100 ? two(x % 100) : ""); }
    var cr = Math.floor(n / 1e7), lk = Math.floor(n / 1e5) % 100, th = Math.floor(n / 1000) % 100, rest = n % 1000;
    var s = (cr ? three(cr) + " crore " : "") + (lk ? two(lk) + " lakh " : "") + (th ? two(th) + " thousand " : "") + (rest ? three(rest) : "");
    return (s.trim().charAt(0).toUpperCase() + s.trim().slice(1)) + " rupees only";
  }

  /* ---------- real PDF files (jsPDF) ---------- */
  function filePdf(title, docNo, headers, rows, extraLines) {
    var J = window.jspdf && window.jspdf.jsPDF;
    if (!J) { alert("PDF library still loading — try again in a second."); return; }
    var doc = new J({ unit: "pt", format: "a4" });
    var W = doc.internal.pageSize.getWidth(), M = 40, y = 48;
    doc.setFont("helvetica", "bold").setFontSize(13).text(CO.name || "BAGDROP", M, y);
    doc.setFont("helvetica", "normal").setFontSize(7.5).setTextColor(120);
    y += 12; doc.text(CO.tagline || "", M, y);
    y += 10; doc.text((CO.address || "").slice(0, 110), M, y);
    y += 10; doc.text((CO.phone || "") + " · " + (CO.email || "") + " · GSTIN " + (CO.gstin || ""), M, y);
    doc.setDrawColor(234, 88, 12).setLineWidth(2).line(M, y + 8, W - M, y + 8);
    y += 28;
    doc.setTextColor(0).setFont("helvetica", "bold").setFontSize(12).text(title.toUpperCase(), M, y);
    doc.setFont("helvetica", "normal").setFontSize(9).text((docNo || "") + " · " + new Date().toLocaleDateString("en-IN"), W - M, y, { align: "right" });
    y += 18;
    var colW = (W - 2 * M) / headers.length;
    function headerRow() {
      doc.setFillColor(250, 250, 248).rect(M, y - 9, W - 2 * M, 14, "F");
      doc.setFont("helvetica", "bold").setFontSize(7.5).setTextColor(90);
      headers.forEach(function (h, i) { doc.text(String(h).toUpperCase(), M + i * colW + 3, y); });
      doc.setTextColor(0).setFont("helvetica", "normal").setFontSize(8.5);
      y += 14;
    }
    headerRow();
    rows.forEach(function (r) {
      if (y > 790) { doc.addPage(); y = 50; headerRow(); }
      r.forEach(function (c, i) {
        doc.text(String(c == null ? "" : c).slice(0, Math.floor(colW / 4.2)), M + i * colW + 3, y);
      });
      doc.setDrawColor(235).setLineWidth(0.5).line(M, y + 4, W - M, y + 4);
      y += 14;
    });
    (extraLines || []).forEach(function (l) {
      if (y > 790) { doc.addPage(); y = 50; }
      y += 6; doc.setFontSize(8.5).text(String(l), M, y); y += 8;
    });
    doc.setFontSize(7).setTextColor(160).text("SEALED · TRACKED · INSURED — THE BAGGAGE LAYER", W / 2, 812, { align: "center" });
    doc.save((title + " " + (docNo || "")).replace(/[\/\s]+/g, "-") + ".pdf");
  }

  window.DOCS = { nextNo: nextNo, openDoc: openDoc, kv: kv, moneyTable: moneyTable, sigBlock: sigBlock, inWords: inWords, inr: inr, FY: FY, filePdf: filePdf };
})();
