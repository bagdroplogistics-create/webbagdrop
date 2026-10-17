/* Bagdrop Admin OS — login gate with roles.
   Demo-grade but real structure: users live in the back end (settings/users,
   SHA-256 password hashes, never plaintext), sessions expire after 12 hours,
   every login and logout is written to the audit trail, and each role sees
   only its modules. Supabase Auth + RLS replaces this file in production. */
(function () {
  "use strict";
  var $ = function (id) { return document.getElementById(id); };

  var ROLES = {
    management: null, /* everything */
    ops: ["cmd", "ship", "quote", "lr", "exc", "evt", "drv", "flt", "cap", "crm", "id", "intel", "rep", "rules"],
    finance: ["cmd", "fin", "quote", "rep", "lr", "ship"],
    sales: ["cmd", "crm", "quote", "ship", "evt", "rep"]
  };
  var SESS_KEY = "bagdrop:sess";

  function sha256(s) {
    return crypto.subtle.digest("SHA-256", new TextEncoder().encode(s)).then(function (b) {
      return Array.from(new Uint8Array(b)).map(function (x) { return x.toString(16).padStart(2, "0"); }).join("");
    });
  }
  function session() {
    try {
      var s = JSON.parse(sessionStorage.getItem(SESS_KEY));
      if (s && s.exp > Date.now()) return s;
    } catch (e) {}
    return null;
  }
  function seedUsers() {
    return DB.get("settings", "users").then(function (doc) {
      if (doc && doc.users && doc.users.length) return doc.users;
      /* first run: seed the management account with the known admin password */
      return sha256("bagdrop@2026admin").then(function (h) {
        var users = [
          { email: "admin@bagdrop.co", name: "Bagdrop Management", role: "management", hash: h },
          { email: "ops@bagdrop.co", name: "Ops Lead", role: "ops", hash: h },
          { email: "finance@bagdrop.co", name: "Finance", role: "finance", hash: h },
          { email: "sales@bagdrop.co", name: "Sales Desk", role: "sales", hash: h }
        ];
        return DB.put("settings", "users", { id: "users", created: DB.now(), users: users }).then(function () { return users; });
      });
    });
  }
  function applyRole(sess) {
    var allowed = ROLES[sess.role];
    document.querySelectorAll(".railnav button[data-m]").forEach(function (b) {
      b.style.display = (!allowed || allowed.indexOf(b.dataset.m) >= 0) ? "" : "none";
    });
    var who = document.querySelector(".who");
    if (who) {
      who.innerHTML = "<b>" + sess.name + "</b>" + sess.role.charAt(0).toUpperCase() + sess.role.slice(1) +
        ' · session to ' + new Date(sess.exp).toLocaleTimeString("en-IN", { hour: "2-digit", minute: "2-digit" }) +
        '<br><button class="btn sm" id="logout" style="margin-top:8px">Sign out</button>';
      $("logout").addEventListener("click", function () {
        var id = "CRM-" + Date.now().toString(36);
        DB.put("crm", id, { id: id, created: DB.now(), text: "Audit · " + sess.email + " signed out", kind: "Auth", dept: "Security" });
        sessionStorage.removeItem(SESS_KEY);
        location.reload();
      });
    }
    window.BAGDROP_SESSION = sess;
  }
  function unlock(sess) {
    $("login-gate").hidden = true;
    document.querySelector(".app").style.display = "";
    document.querySelector(".topbar").style.display = "";
    applyRole(sess);
  }
  function gate() {
    var g = $("login-gate");
    var sess = session();
    if (sess) { unlock(sess); return; }
    g.hidden = false;
    document.querySelector(".app").style.display = "none";
    document.querySelector(".topbar").style.display = "none";
    $("lg-go").addEventListener("click", attempt);
    $("lg-pass").addEventListener("keydown", function (e) { if (e.key === "Enter") attempt(); });
    function attempt() {
      var email = ($("lg-email").value || "").trim().toLowerCase();
      var pass = $("lg-pass").value || "";
      $("lg-msg").textContent = "Checking…";
      Promise.all([seedUsers(), sha256(pass)]).then(function (r) {
        var u = r[0].filter(function (x) { return x.email.toLowerCase() === email; })[0];
        if (!u || u.hash !== r[1]) {
          $("lg-msg").textContent = "Wrong email or password. Attempt logged.";
          var id = "CRM-" + Date.now().toString(36);
          DB.put("crm", id, { id: id, created: DB.now(), text: "Audit · FAILED sign-in for " + (email || "(blank)"), kind: "Auth", dept: "Security" });
          return;
        }
        var s = { email: u.email, name: u.name, role: u.role, exp: Date.now() + 12 * 3600 * 1000 };
        sessionStorage.setItem(SESS_KEY, JSON.stringify(s));
        var id = "CRM-" + Date.now().toString(36);
        DB.put("crm", id, { id: id, created: DB.now(), text: "Audit · " + u.email + " signed in (" + u.role + ")", kind: "Auth", dept: "Security" });
        unlock(s);
      });
    }
  }
  if (document.readyState === "loading") document.addEventListener("DOMContentLoaded", gate); else gate();
})();
