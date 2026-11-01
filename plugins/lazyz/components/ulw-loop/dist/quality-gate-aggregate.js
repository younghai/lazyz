import { validateQualityGate } from "./quality-gate.js";
/**
 * Compatibility entry point for callers that used the former pre-pass API.
 * Validation is performed by the real parser, which collects defects across
 * every nested field before throwing one aggregate error.
 */
export function aggregateQualityGateDefects(input, opts) {
    validateQualityGate(input, opts);
}
