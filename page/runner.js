// runner.js — the Runner (doc 03 §3). For each descriptor:
//   TargetProvider.resolve -> Method.run -> Observer.observe(all) -> Reporter.emit(row)
// Streams each row as it completes (doc 03 §2 programmatic API) with a per-probe timeout so one hung
// probe never loses the batch.
import { registry } from "./registry.js";
import { prepare } from "./descriptor.js";

// nameResolution -> TargetProvider id. `dns` (dnsTarget.js) returns the FQDN so the browser resolves it;
// dns_control.py provisions the matching Route 53 record (D2 arms, 2026-07-06).
const PROVIDER_FOR = {
  literal: "literal",
  "static-dns": "dns",
  "dynamic-dns-to-self": "dns",
  "wildcard": "dns",
  "dns-rebind": "dns",
};

// Per-probe backstop: resolve to a sentinel if method.run hangs, so one stuck probe never stalls the
// whole batch (the docstring promises this). Methods still get their own ctx.timeoutMs; this is the floor.
function withTimeout(promise, ms) {
  return new Promise((resolve) => {
    let done = false;
    const finish = (v) => { if (!done) { done = true; clearTimeout(timer); resolve(v); } };
    const timer = setTimeout(() => finish({ __runnerTimeout: true }), ms);
    Promise.resolve(promise).then(finish, (e) => finish({ __runnerError: String((e && e.message) || e) }));
  });
}

function assembleRow(env, d, target, result, signals) {
  return {
    // correlation
    runId: d.runId, batchId: d.batchId, deviceId: d.deviceId, seq: d.seq, timestamp: result.timestamp,
    // environment (C1-C6)
    embedder: env.embedder, os: env.os, os_ver: env.osVer, browser: env.browser,
    browser_ver: env.browserVer, build_id: env.buildId,
    permission_state: env.permissionState, permission_mechanism: env.permissionMechanism,
    network: env.network, endpoint_trust: env.endpointTrust, validity_tier: env.validityTier,
    // provenance (filled by orchestrator/faithfulness for a real run)
    pref_snapshot: null, field_trial_state: null, policy_snapshot: null,
    listener_manifest_hash: null, dns_state_id: d.dnsStateId || null, cert_fingerprint: null,
    ap_model_firmware: null, ipv6_mode: null,
    // page sweep (D1-D5)
    address_class: d.target.addressClass, host_resolved: target.host, literal_form: d.target.literalForm,
    port: target.port, name_resolution: d.nameResolution, scenario: d.target.scenario,
    origin_scheme: d.originScheme, in_page_context: d.inPageContext,
    method_type: d.method.type,
    method_subparams: JSON.stringify({
      verb: d.method.verb, mode: d.method.mode,
      targetAddressSpace: d.method.targetAddressSpace,
    }),
    // observations (M1) + native co-probe (M5, waived in slice-1)
    client_event: signals.client_event, client_timing_ms: signals.client_timing_ms,
    failure_class: result.failureClass, block_reason: signals.block_reason || result.blockReason,
    mixed_content_blocked: result.failureClass === "mixed-content-blocked",
    name_resolution_gated: result.failureClass === "dns-fail", transport_gated: null,
    server_received: null, server_receipt_carrier: null, sni_seen: null, tls_ok: null,
    native_coprobe_reached: null, join_confidence: null,
    // derived slices
    address_space_mismatch: null, carrier_succeeded: null,
    redirect_via: d.redirect ? d.redirect.via : "none", redirect_prompt_fired_on: null,
    // self-leak covariate
    secret_in_logs: null,
    // attribution
    script_source: result.source, stack: result.stack,
    // scoring (filled in post-processing)
    expected_id: null, web_layer_gated_expected: null, os_layer_gated_expected: null,
    reachable_expected: null, pass_fail: null,
  };
}

export function runBatch(rawBatch, opts = {}) {
  const cbs = [];
  const reporter = registry.reporter();
  const api = {
    onRow(cb) { cbs.push(cb); return api; },
    rows: [],
    completed: null,
  };

  api.completed = (async () => {
    const batch = await prepare(rawBatch);
    const env = batch.env;
    for (const d of batch.descriptors) {
      const method = registry.method(d.method.type);
      const provider = registry.target(PROVIDER_FOR[d.nameResolution] || "literal");
      let row;
      if (!method || !method.applicable(d)) {
        // First-class "unsupported": the engine/method can't run this probe. Must NOT look like a gate.
        row = assembleRow(env, d, { host: d.target.host, port: d.target.port }, {
          failureClass: "unsupported", blockReason: null, source: "runner", stack: "",
          timestamp: Date.now(), clientTimingMs: 0,
        }, { client_event: "unsupported" });
      } else {
        const target = await provider.resolve(d);
        const ctx = { target, env, timeoutMs: opts.timeoutMs || 5000 };
        // Backstop a bit beyond the method's own budget so the method gets its chance first.
        const result = await withTimeout(method.run(d, ctx), ctx.timeoutMs + 2000);
        if (result && result.__runnerTimeout) {
          // client_timing_ms must ride in the signals arg (assembleRow reads it from there, not result).
          row = assembleRow(env, d, target, {
            failureClass: "timeout", blockReason: "runner-timeout", source: "runner", stack: "",
            timestamp: Date.now(),
          }, { client_event: "timeout", client_timing_ms: ctx.timeoutMs });
        } else if (result && result.__runnerError) {
          row = assembleRow(env, d, target, {
            failureClass: "refused", blockReason: result.__runnerError, source: "runner", stack: "",
            timestamp: Date.now(),
          }, { client_event: "error", client_timing_ms: 0 });
        } else if (!result || typeof result !== "object") {
          // a method that resolved with nothing/garbage must not crash the observers (and the whole batch).
          row = assembleRow(env, d, target, {
            failureClass: "refused", blockReason: "runner-bad-result", source: "runner", stack: "",
            timestamp: Date.now(),
          }, { client_event: "error", client_timing_ms: 0 });
        } else {
          const probe = { descriptor: d, ctx, result };
          const signals = {};
          for (const obs of registry.observersFor(d.observer)) {
            Object.assign(signals, await obs.observe(probe));
          }
          row = assembleRow(env, d, target, result, signals);
        }
      }
      api.rows.push(row);
      if (reporter) await reporter.emit(row);
      cbs.forEach((cb) => { try { cb(row); } catch (_) {} });
    }
    return api.rows;
  })();

  return api;
}
