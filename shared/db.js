/* Bagdrop data layer.
   One API, two engines:
   - Supabase (when shared/config.js has url + anonKey): each collection is a
     table with (id text pk, doc jsonb, status text, created timestamptz),
     realtime via postgres_changes.
   - Local demo mode: localStorage + BroadcastChannel, same live behaviour
     across tabs of this browser.

   API (all async unless noted):
     DB.ready                     -> Promise resolving once the engine is up
     DB.mode                      -> "supabase" | "local"
     DB.put(col, id, doc)         -> save whole document
     DB.get(col, id)              -> doc | null
     DB.list(col)                 -> [doc]   (newest first)
     DB.watch(col, cb)            -> unsubscribe fn; cb(list) on every change
     DB.watchDoc(col, id, cb)     -> unsubscribe fn; cb(doc) on every change
     DB.onState(cb)               -> cb(ok:boolean, msg:string) connection pill
*/
(function () {
  "use strict";
  var cfg = (window.BAGDROP_CONFIG || {}).supabase || {};
  var useSupabase = !!(cfg.url && cfg.anonKey);
  var stateCbs = [], lastState = null;
  function setState(ok, msg) { lastState = [ok, msg]; stateCbs.forEach(function (f) { f(ok, msg); }); }

  var DB = {
    mode: useSupabase ? "supabase" : "local",
    onState: function (cb) { stateCbs.push(cb); if (lastState) cb(lastState[0], lastState[1]); }
  };

  /* ---------------- local engine ---------------- */
  function localEngine() {
    var KEY = "bagdrop:";
    var bc = ("BroadcastChannel" in window) ? new BroadcastChannel("bagdrop") : null;
    var watchers = { col: {}, doc: {} };

    function read(col) {
      try { return JSON.parse(localStorage.getItem(KEY + col) || "{}"); } catch (e) { return {}; }
    }
    function write(col, map) { localStorage.setItem(KEY + col, JSON.stringify(map)); }
    function toList(map) {
      return Object.keys(map).map(function (k) { return map[k]; })
        .sort(function (a, b) { return (b.created || "").localeCompare(a.created || ""); });
    }
    function notify(col, id) {
      (watchers.col[col] || []).forEach(function (cb) { cb(toList(read(col))); });
      var dk = col + "/" + id;
      (watchers.doc[dk] || []).forEach(function (cb) { cb(read(col)[id] || null); });
    }
    if (bc) bc.onmessage = function (e) { notify(e.data.col, e.data.id); };
    window.addEventListener("storage", function (e) {
      if (e.key && e.key.indexOf(KEY) === 0) {
        var col = e.key.slice(KEY.length);
        (watchers.col[col] || []).forEach(function (cb) { cb(toList(read(col))); });
        Object.keys(watchers.doc).forEach(function (dk) {
          if (dk.indexOf(col + "/") === 0) {
            var id = dk.slice(col.length + 1);
            watchers.doc[dk].forEach(function (cb) { cb(read(col)[id] || null); });
          }
        });
      }
    });

    DB.put = function (col, id, doc) {
      var map = read(col); map[id] = doc; write(col, map);
      notify(col, id);
      if (bc) bc.postMessage({ col: col, id: id });
      setState(true, "saved locally · " + id);
      return Promise.resolve(doc);
    };
    DB.get = function (col, id) { return Promise.resolve(read(col)[id] || null); };
    DB.list = function (col) { return Promise.resolve(toList(read(col))); };
    DB.watch = function (col, cb) {
      (watchers.col[col] = watchers.col[col] || []).push(cb);
      cb(toList(read(col)));
      return function () { watchers.col[col] = watchers.col[col].filter(function (f) { return f !== cb; }); };
    };
    DB.watchDoc = function (col, id, cb) {
      var dk = col + "/" + id;
      (watchers.doc[dk] = watchers.doc[dk] || []).push(cb);
      cb(read(col)[id] || null);
      return function () { watchers.doc[dk] = watchers.doc[dk].filter(function (f) { return f !== cb; }); };
    };
    DB.ready = Promise.resolve();
    setState(true, "demo mode · local data, live across tabs");
  }

  /* ---------------- supabase engine ---------------- */
  function supabaseEngine() {
    var client = null;
    DB.ready = new Promise(function (resolve) {
      var s = document.createElement("script");
      s.src = "https://cdn.jsdelivr.net/npm/@supabase/supabase-js@2.49.1/dist/umd/supabase.min.js";
      s.onload = function () {
        client = window.supabase.createClient(cfg.url, cfg.anonKey);
        setState(true, "connected to Supabase");
        resolve();
      };
      s.onerror = function () { setState(false, "could not load Supabase client"); resolve(); };
      document.head.appendChild(s);
    });

    function tbl() { return client; }

    DB.put = function (col, id, doc) {
      return DB.ready.then(function () {
        return tbl().from(col).upsert({ id: id, doc: doc, status: doc.status || null, created: doc.created || new Date().toISOString() })
          .then(function (r) {
            if (r.error) { setState(false, "save failed · " + r.error.message); throw r.error; }
            setState(true, "saved to back end · " + id);
            return doc;
          });
      });
    };
    DB.get = function (col, id) {
      return DB.ready.then(function () {
        return tbl().from(col).select("doc").eq("id", id).maybeSingle()
          .then(function (r) { return r.data ? r.data.doc : null; });
      });
    };
    DB.list = function (col) {
      return DB.ready.then(function () {
        return tbl().from(col).select("doc").order("created", { ascending: false })
          .then(function (r) { return (r.data || []).map(function (x) { return x.doc; }); });
      });
    };
    DB.watch = function (col, cb) {
      var ch = null, dead = false;
      DB.ready.then(function () {
        DB.list(col).then(cb);
        ch = client.channel("w:" + col + ":" + Math.random())
          .on("postgres_changes", { event: "*", schema: "public", table: col }, function () { if (!dead) DB.list(col).then(cb); })
          .subscribe();
      });
      return function () { dead = true; if (ch) client.removeChannel(ch); };
    };
    DB.watchDoc = function (col, id, cb) {
      var ch = null, dead = false;
      DB.ready.then(function () {
        DB.get(col, id).then(cb);
        ch = client.channel("d:" + col + ":" + id + ":" + Math.random())
          .on("postgres_changes", { event: "*", schema: "public", table: col, filter: "id=eq." + id }, function (p) {
            if (!dead) cb(p.new ? p.new.doc : null);
          })
          .subscribe();
      });
      return function () { dead = true; if (ch) client.removeChannel(ch); };
    };
  }

  if (useSupabase) supabaseEngine(); else localEngine();

  /* ---------------- shared helpers ---------------- */
  DB.now = function () { return new Date().toISOString(); };
  DB.id = function (prefix) {
    var n = Math.floor(Math.random() * 9000) + 1000;
    return prefix + "-" + new Date().getFullYear() + "-" + n;
  };
  DB.eventCode = function (type) {
    // no ambiguous characters (0/O, 1/I/L)
    var chars = "23456789ABCDEFGHJKMNPQRSTUVWXYZ", s = "";
    for (var i = 0; i < 5; i++) s += chars[Math.floor(Math.random() * chars.length)];
    return (type || "WED") + "-" + s;
  };
  DB.inr = function (n) { return "₹" + Math.round(n || 0).toLocaleString("en-IN"); };
  DB.fmt = function (iso) {
    try { return new Date(iso).toLocaleString("en-IN", { day: "2-digit", month: "short", hour: "2-digit", minute: "2-digit" }); }
    catch (e) { return iso; }
  };

  window.DB = DB;
})();
