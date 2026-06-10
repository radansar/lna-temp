// descriptor.js — parse + validate a batch, and fill the runtime-set fields (doc 03 §1, §1.2).
// The secret derivation MUST byte-match server/common.py derive_secret() so the join confirms integrity.

const enc = new TextEncoder();

async function sha256hex(s) {
  const buf = await crypto.subtle.digest("SHA-256", enc.encode(s));
  return [...new Uint8Array(buf)].map((b) => b.toString(16).padStart(2, "0")).join("");
}

// mirror of server/common.py derive_secret: "s_" + sha256("lna-secret::"+runId)[:24]
export async function deriveSecret(runId) {
  return "s_" + (await sha256hex("lna-secret::" + runId)).slice(0, 24);
}

function guessEnv(env) {
  const e = { ...env };
  const ua = navigator.userAgent || "";
  if (!e.browserVer) {
    const m = ua.match(/Chrome\/(\d+[\d.]*)/);
    if (m) e.browserVer = m[1];
  }
  if (!e.buildId) e.buildId = e.browserVer || null;
  if (!e.osVer) e.osVer = (navigator.userAgentData && navigator.userAgentData.platform) || null;
  return e;
}

export function validate(batch) {
  if (!batch || typeof batch !== "object") throw new Error("batch must be an object");
  if (!Array.isArray(batch.descriptors) || batch.descriptors.length === 0)
    throw new Error("batch.descriptors must be a non-empty array");
  for (const d of batch.descriptors) {
    if (!d.target || !d.method) throw new Error("descriptor needs target + method");
    if (!Array.isArray(d.observer)) throw new Error("descriptor.observer must be an array");
  }
  return true;
}

// fill batchId (hash of env), per-probe runId + secret. Returns a ready-to-run batch.
export async function prepare(batch) {
  validate(batch);
  const env = guessEnv(batch.env || {});
  const batchId = batch.batchId || "env_" + (await sha256hex(JSON.stringify(env))).slice(0, 16);
  const descriptors = [];
  for (const d of batch.descriptors) {
    const runId = d.runId || crypto.randomUUID();
    const secret = (d.payload && d.payload.secret) || (await deriveSecret(runId));
    descriptors.push({
      ...d,
      runId,
      batchId,
      payload: { ...(d.payload || {}), secret, carrier: (d.payload && d.payload.carrier) || "query" },
    });
  }
  return { ...batch, env, batchId, descriptors };
}
