import { describe, expect, test } from "bun:test"
import { parseConfigSections } from "./config-section-parser"

type TestConfig = {
  nested?: { label: string }
  names?: string[]
}

const ConfigSchema = {
  safeParse(input: unknown) {
    const record = typeof input === "object" && input !== null ? input as Record<string, unknown> : {}
    const data: TestConfig = {}
    const issues: Array<{ path: Array<string | number>; message: string }> = []

    if (record.nested !== undefined) {
      const nested = record.nested
      if (typeof nested === "object" && nested !== null && typeof (nested as Record<string, unknown>).label === "string") {
        data.nested = { label: (nested as Record<string, string>).label }
      } else {
        issues.push({ path: ["nested"], message: "Invalid nested section" })
      }
    }

    if (record.names !== undefined) {
      if (Array.isArray(record.names) && record.names.every((name) => typeof name === "string")) {
        data.names = record.names
      } else {
        const invalidIndex = Array.isArray(record.names)
          ? record.names.findIndex((name) => typeof name !== "string")
          : 0
        issues.push({ path: ["names", Math.max(invalidIndex, 0)], message: "Invalid input: expected string, received number" })
      }
    }

    return issues.length === 0
      ? { success: true as const, data }
      : { success: false as const, error: { issues } }
  },
}

describe("parseConfigSections", () => {
  test("#given one invalid config section #when parsing section-wise #then valid sections are preserved", () => {
    // given
    const invalidSections: string[] = []
    const rawConfig = {
      nested: { label: "kept" },
      names: ["valid", 42],
    }

    // when
    const result = parseConfigSections(ConfigSchema, rawConfig, {
      onInvalidSections: (sections) => invalidSections.push(...sections),
    })

    // then
    expect(result).toEqual({ nested: { label: "kept" } })
    expect(invalidSections).toEqual(["names: names.1: Invalid input: expected string, received number"])
  })

  test("#given prototype pollution keys #when parsing section-wise #then unsafe keys are ignored", () => {
    // given
    const rawConfig = JSON.parse('{"__proto__":{"polluted":true},"constructor":{"polluted":true},"nested":{"label":"kept"}}') as Record<string, unknown>

    // when
    const result = parseConfigSections(ConfigSchema, rawConfig)

    // then
    expect(result).toEqual({ nested: { label: "kept" } })
    expect(({} as Record<string, unknown>).polluted).toBeUndefined()
    expect(Object.prototype.hasOwnProperty.call(result, "__proto__")).toBe(false)
    expect(Object.prototype.hasOwnProperty.call(result, "constructor")).toBe(false)
  })
})
