// registry.js — convention auto-registration (doc 03 §3): any export whose name ends in
// Method / Target / Observer / Reporter is registered, NOT a hardcoded guard list.
// (Static ES imports here; the offline batch-compiler does true filesystem auto-discovery later.)
import * as fetchMethodMod from "./methods/fetchMethod.js";
import * as literalTargetMod from "./targets/literalTarget.js";
import * as clientEventMod from "./observers/clientEventObserver.js";
import * as clientTimingMod from "./observers/clientTimingObserver.js";
import * as callbackReporterMod from "./reporter/callbackReporter.js";

const methods = {};
const targets = {};
const observers = {};
let reporter = null;

function ingest(mod) {
  for (const [name, val] of Object.entries(mod)) {
    if (!val || typeof val !== "object") continue;
    if (name.endsWith("Method")) methods[val.id()] = val;
    else if (name.endsWith("Target")) targets[val.id()] = val;
    else if (name.endsWith("Observer")) observers[val.id()] = val;
    else if (name.endsWith("Reporter")) reporter = val;
  }
}

[fetchMethodMod, literalTargetMod, clientEventMod, clientTimingMod, callbackReporterMod].forEach(ingest);

export const registry = {
  method: (id) => methods[id],
  target: (id) => targets[id],
  observer: (id) => observers[id],
  observersFor: (ids) => ids.map((id) => observers[id]).filter(Boolean), // server-receipt has no client Observer
  reporter: () => reporter,
  all: () => ({ methods, targets, observers, reporter }),
};
