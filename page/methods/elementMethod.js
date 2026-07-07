// elementMethod.js — Method "element" (doc 03 §3; D3 element types). Loads the probe URL via an HTML
// element instead of fetch: img (passive resource), script (active), iframe (subframe). The element's
// onload/onerror is a weak client signal (a 204/non-asset makes onerror fire even though the request
// REACHED) — so, as always, the server RECEIPT is the truth. This lets us compare whether LNA gates
// passive vs active resource loads the same way it gates fetch.
function probeUrl(d, ctx) {
  const t = ctx.target, p = d.payload;
  // Scheme is descriptor-driven (bypass-matrix): an HTTPS DNS-name cell must load over https so it isn't
  // mixed-content-blocked before DNS resolves. Default "http" keeps every literal-IP cell byte-identical.
  const scheme = (t && t.scheme) || "http";
  const q = new URLSearchParams({
    batchId: d.batchId, deviceId: d.deviceId, runId: d.runId, seq: String(d.seq),
    secret: p.secret, via: "element-" + (d.method.element || "img"),
  });
  return `${scheme}://${t.host}:${t.port}/probe?` + q.toString();
}

export const elementMethod = {
  id() {
    return "element";
  },
  applicable() {
    return typeof document !== "undefined";
  },
  run(d, ctx) {
    return new Promise((resolve) => {
      const url = probeUrl(d, ctx);
      const kind = d.method.element || "img";
      const start = performance.now();
      let el, settled = false;
      const finish = (clientEvent, failureClass) => {
        if (settled) return;
        settled = true;
        clearTimeout(timer);
        try { if (el && el.remove) el.remove(); } catch (_) {}
        resolve({
          clientEvent, clientTimingMs: Math.round((performance.now() - start) * 10) / 10,
          failureClass, blockReason: null, source: "elementMethod", stack: "",
          timestamp: Date.now(), probeUrl: url,
        });
      };
      const timer = setTimeout(() => finish("timeout", "timeout"), ctx.timeoutMs || 5000);
      if (kind === "img") el = new Image();
      else if (kind === "script") el = document.createElement("script");
      else el = document.createElement("iframe");
      el.onload = () => finish("load", "none");
      el.onerror = () => finish("error", "none");  // reached-but-invalid OR blocked — receipt decides
      el.src = url;
      if (kind !== "img") document.body.appendChild(el);
    });
  },
};
