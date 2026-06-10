// clientTimingObserver.js — Observer "client-timing" (doc 03 §3, doc 01 M1).
// Reply speed discriminates: a closed port refuses instantly, an open non-HTTP port hangs, a real
// HTTP server replies fast. Scored as a RELATIVE test against the negative-closed control (doc 05 §7
// M6) — NO absolute ms threshold here; the harness calibrates per host.
export const clientTimingObserver = {
  id() {
    return "client-timing";
  },
  async observe(probe) {
    return { client_timing_ms: probe.result.clientTimingMs };
  },
};
