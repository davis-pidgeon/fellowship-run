import { describe, it, expect } from "vitest";
import { encrypt, decrypt } from "./crypto";

// 32 bytes as 64 hex chars
const KEY = "0".repeat(64);

describe("crypto", () => {
  it("round-trips a secret", () => {
    const enc = encrypt("my-strava-refresh-token", KEY);
    expect(enc).not.toContain("my-strava-refresh-token");
    expect(decrypt(enc, KEY)).toBe("my-strava-refresh-token");
  });
  it("produces different ciphertext each call (random IV)", () => {
    expect(encrypt("same", KEY)).not.toBe(encrypt("same", KEY));
  });
});
