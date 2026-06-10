// callbackReporter.js — Reporter (doc 03 §3, §5). Prints each canonical row and POSTs it to the
// public callback (the observer channel, doc 02 §C) carrying runId. Emits server_received:null —
// the receipt is joined SERVER-side (doc 03 §5), never via an in-page callback (slow + racy).
export const callbackReporter = {
  id() {
    return "callback";
  },
  rows: [],
  async emit(row) {
    this.rows.push(row);
    console.log("[row]", JSON.stringify(row));
    const url = (window.__lnaConfig && window.__lnaConfig.callbackUrl) || null;
    if (!url) return; // no callback configured (UI/demo mode): rows still available in .rows
    try {
      await fetch(url, {
        method: "POST",
        mode: "cors",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(row),
        keepalive: true, // survive a navigation/teardown
      });
    } catch (e) {
      // observer-channel failure is itself a finding — surface it; the §C control flags an empty sink.
      console.error("[reporter] callback POST failed:", e && e.message);
    }
  },
};
