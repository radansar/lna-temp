// clientEventObserver.js — Observer "client-event" (doc 03 §3, doc 01 M1).
// Weakest tier: an opaque no-cors response still resolves, so client_event="load" means
// "not blocked at the web layer", NOT "leak". The server-receipt Observer is the robust truth.
export const clientEventObserver = {
  id() {
    return "client-event";
  },
  async observe(probe) {
    return { client_event: probe.result.clientEvent, block_reason: probe.result.blockReason };
  },
};
