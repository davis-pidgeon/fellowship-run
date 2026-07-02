import { describe, it, expect } from "vitest";
import { signSession, verifySession } from "./session";

const SECRET = "test-secret-value-32-chars-min-len!";

describe("session", () => {
  it("round-trips a signed session", async () => {
    const token = await signSession("user-123", SECRET);
    expect(await verifySession(token, SECRET)).toEqual({ userId: "user-123" });
  });
  it("rejects a token signed with a different secret", async () => {
    const token = await signSession("user-123", SECRET);
    expect(await verifySession(token, "another-secret-value-least-32chars!!")).toBeNull();
  });
  it("rejects garbage", async () => {
    expect(await verifySession("not.a.jwt", SECRET)).toBeNull();
  });
});
