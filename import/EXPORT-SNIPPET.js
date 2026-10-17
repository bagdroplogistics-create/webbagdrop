/* BAGDROP DATA EXPORT v2 — paste into the Chrome console on your logged-in
   www.bagdrop.co/admin page (⌘+Option+J). Saves your panel's own data to
   this machine only (http://127.0.0.1:8787 → the session's import folder). */
(async () => {
  const log = (...a) => console.log('%c[BAGDROP EXPORT]', 'color:#EA580C;font-weight:bold', ...a);
  const wanted = ['/api/admin/bookings', '/api/admin/stats', '/api/admin/dashboard-v2', '/api/admin/trip-sheets'];
  const seen = {};
  performance.getEntriesByType('resource').forEach(r => {
    const hit = wanted.find(w => r.name.includes(w));
    if (hit && !seen[hit]) seen[hit] = r.name;
  });
  if (!seen['/api/admin/bookings']) { log('⚠️ Open the Dashboard & Bookings screen first, then paste again.'); return; }
  let ok = 0, fail = 0;
  for (const [path, url] of Object.entries(seen)) {
    const name = path.split('/').pop();
    try {
      const resp = await fetch(url, { credentials: 'include' });
      if (!resp.ok) { log('❌ FAILED', name, 'HTTP', resp.status); fail++; continue; }
      const data = await resp.json();
      const save = await fetch('http://127.0.0.1:8787/' + name, {
        method: 'POST', headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(data)
      });
      const j = await save.json();
      log('✅ SAVED', name, '—', j.msg);
      ok++;
    } catch (e) {
      log('❌ FAILED', name, '—', e.message, '(is the local receiver running? ask Claude)');
      fail++;
    }
  }
  log(fail === 0 && ok > 0 ? '🎉 ALL SAVED (' + ok + ' files) — tell Claude: export is in.'
      : '⚠️ Finished with ' + fail + ' failure(s) — tell Claude what it says above.');
})();
