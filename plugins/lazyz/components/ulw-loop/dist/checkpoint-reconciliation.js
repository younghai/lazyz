import { UlwLoopError } from "./types.js";
export function combineCheckpointValidationErrors(codexError, gateError) {
    return new UlwLoopError(`${codexError.message}\n${gateError.message}`, "ULW_LOOP_QUALITY_GATE_INVALID", {
        details: { ...(codexError.details ?? {}), ...(gateError.details ?? {}) },
    });
}
