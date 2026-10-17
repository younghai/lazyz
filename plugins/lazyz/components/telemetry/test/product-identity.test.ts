import { describe, expect, it } from "vitest";

import { createComponentTelemetryProductConfig } from "../src/product-identity.js";

describe("createComponentTelemetryProductConfig", () => {
	it("preserves additional event properties without changing product identity", () => {
		// Given: additional structured telemetry properties.
		const additionalProperties = { source: "session-start" };

		// When: the product configuration is created.
		const config = createComponentTelemetryProductConfig(additionalProperties);

		// Then: the stable machine identity and caller properties are present.
		expect(config.productName).toBe("lazyz");
		expect(config.packageName).toBe("@lazyz/plugin");
		expect(config.additionalProperties).toEqual(additionalProperties);
	});
});
