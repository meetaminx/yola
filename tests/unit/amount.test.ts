import { describe, expect, it } from "vitest";
import { compareAmounts, formatZecFixed, formatZecTrimmed, parseZec } from "@/lib/payments/amount";

describe("parseZec", () => {
  it.each([
    ["0.01", 1_000_000n],
    ["1", 100_000_000n],
    ["050", 5_000_000_000n],
    ["00.500", 50_000_000n],
    ["0.00000001", 1n],
    ["21000000", 2_100_000_000_000_000n],
  ])("parses %s exactly", (input, expected) => {
    const r = parseZec(input);
    expect(r.ok && r.zatoshis).toBe(expected);
  });

  it("avoids float drift (0.1 + 0.2)", () => {
    const a = parseZec("0.1");
    const b = parseZec("0.2");
    expect(a.ok && b.ok && formatZecTrimmed(a.zatoshis + b.zatoshis)).toBe("0.3");
  });

  it.each([
    ["", "amount_empty"],
    ["abc", "amount_format"],
    ["1e3", "amount_format"],
    ["-1", "amount_format"],
    [".5", "amount_format"],
    ["50.", "amount_format"],
    ["50,000", "amount_format"],
    ["0.123456789", "amount_precision"],
    ["0", "amount_not_positive"],
    ["21000000.00000001", "amount_too_large"],
  ])("rejects %j with %s", (input, code) => {
    const r = parseZec(input);
    expect(r.ok).toBe(false);
    if (!r.ok) expect(r.code).toBe(code);
  });
});

describe("formatting", () => {
  it("formats fixed and trimmed", () => {
    expect(formatZecFixed(1_000_000n)).toBe("0.01000000");
    expect(formatZecTrimmed(1_000_000n)).toBe("0.01");
    expect(formatZecTrimmed(100_000_000n)).toBe("1");
    expect(formatZecTrimmed(1n)).toBe("0.00000001");
  });

  it("compares amounts", () => {
    expect(compareAmounts(5n, 5n)).toBe("exact");
    expect(compareAmounts(4n, 5n)).toBe("under");
    expect(compareAmounts(6n, 5n)).toBe("over");
  });
});
