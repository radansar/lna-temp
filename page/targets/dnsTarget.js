// dnsTarget.js — TargetProvider for FQDN name-resolution cells (D2: static-dns / dynamic-dns-to-self /
// wildcard / dns-rebind). The DESIGN point: return the FQDN as the host so the BROWSER/OS performs the real
// DNS resolution — we measure how the browser classifies the *resolved* IP. All Route 53 / AWS orchestration
// lives in orchestrator/dns_control.py, NOT here (keep the browser plugin dumb — codex+Gemini, 2026-07-06).
//
// The descriptor host may carry a `{runId}` placeholder for per-run names under *.run.lnatest.click
// (e.g. "lb-{runId}.run.lnatest.click"); it is substituted at resolve time so the name matches the record
// dns_control.py provisioned for this run.
export const dnsTarget = {
  id() {
    return "dns";
  },
  async resolve(d) {
    // {runId} -> the suite runId (matches the provisioned lb-<runId>/gua-<runId>/... record); {vid} -> the
    // per-visitor id (class E; falls back to runId until the whoami->mint->return flow is wired client-side).
    const host = String(d.target.host)
      .replace(/\{runId\}/g, d.runId)
      .replace(/\{vid\}/g, d.vid || d.runId);
    return { host, port: d.target.port, literalForm: null };
  },
};
