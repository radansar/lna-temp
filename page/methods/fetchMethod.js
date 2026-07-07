// fetchMethod.js — Method "fetch" (doc 03 §3). Sends the slice-1 probe to the loopback listener.
//
// no-cors GET to http://127.0.0.1:<port>/probe?...&runId=...&secret=...  — the runId + secret ride in
// the query (payload.carrier="query"). An opaque no-cors response still RESOLVES, so a resolve means
// "the browser did not block it", NOT "leak confirmed" — the server RECEIPT is the authoritative proof
// (doc 03 §5). failure_class is a best-effort client guess from error type + timing (doc 03 §4); the
// client-timing Observer and the server receipt refine/override the verdict downstream.

export const fetchMethod = {
  id() {
    return "fetch";
  },
  applicable() {
    return typeof fetch === "function"; // capability feature-detect only (doc 03 §3)
  },
  async run(d, ctx) {
    const t = ctx.target;
    const p = d.payload;
    // Scheme is descriptor-driven (D26): an HTTPS page must reach a static-dns->local name over HTTPS
    // (https://cert.lnatest.click:<port>) because http://<name> is mixed-content blocked BEFORE DNS
    // resolves (the loopback exemption is literals-only). Default "http" keeps every existing literal-IP
    // cell byte-identical. NOTE: mixed-content classification still applies below — an https-page ->
    // http-name (or http-IP) probe can still trip the "mixed content" -> mixed-content-blocked branch.
    const scheme = (d.target && d.target.scheme) || "http";
    const url =
      `${scheme}://${t.host}:${t.port}/probe` +
      `?batchId=${encodeURIComponent(d.batchId)}` +
      `&deviceId=${encodeURIComponent(d.deviceId)}` +
      `&runId=${encodeURIComponent(d.runId)}` +
      `&seq=${encodeURIComponent(d.seq)}` +
      `&secret=${encodeURIComponent(p.secret)}`;

    const ctrl = new AbortController();
    const timeoutMs = ctx.timeoutMs || 5000;
    const timer = setTimeout(() => ctrl.abort(), timeoutMs);
    const start = performance.now();

    let clientEvent = "error";
    let failureClass = "none";
    let blockReason = null;
    let stack = "";

    try {
      await fetch(url, {
        method: d.method.verb || "GET",
        mode: d.method.mode || "no-cors",
        signal: ctrl.signal,
        cache: "no-store",
        credentials: "omit",
      });
      clientEvent = "load"; // opaque resolve == not blocked at the web layer
      failureClass = "none";
    } catch (e) {
      stack = (e && e.stack) || "";
      const msg = ((e && e.message) || "").toLowerCase();
      if (e && e.name === "AbortError") {
        clientEvent = "timeout";
        failureClass = "timeout"; // hang (Android LNP denial / firewall) — refined by timing Observer
      } else if (msg.includes("mixed content")) {
        clientEvent = "blocked";
        failureClass = "mixed-content-blocked";
        blockReason = "mixed-content";
      } else {
        // opaque TypeError: cannot tell refused-vs-LNA from JS alone. Best-effort by permission state;
        // the server receipt + timing decide the truth downstream.
        const granted = (ctx.env && ctx.env.permissionState) === "granted";
        clientEvent = "blocked";
        failureClass = granted ? "refused" : "policy-blocked";
        blockReason = granted ? null : "lna-policy";
      }
    } finally {
      clearTimeout(timer);
    }

    return {
      clientEvent,
      clientTimingMs: Math.round((performance.now() - start) * 10) / 10,
      failureClass,
      blockReason,
      source: "fetchMethod",
      stack,
      timestamp: Date.now(),
      probeUrl: url,
    };
  },
};
