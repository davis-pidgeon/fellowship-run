import { describe, it, expect } from "vitest";
import { requireAdminUserId } from "./admin";
import { signSession } from "./session";
import { SESSION_COOKIE } from "./http";

function fakeDb(isAdmin: boolean | null) {
  return {
    from: () => ({
      select: () => ({
        eq: () => ({
          maybeSingle: async () => ({ data: isAdmin === null ? null : { is_admin: isAdmin } }),
        }),
      }),
    }),
  };
}

describe("requireAdminUserId", () => {
  process.env.SESSION_SECRET = "a-test-secret-that-is-long-enough!!";

  it("returns the userId when the session is valid and the user is an admin", async () => {
    const token = await signSession("u-1", process.env.SESSION_SECRET!);
    const req = { headers: { cookie: `${SESSION_COOKIE}=${token}` } };
    expect(await requireAdminUserId(req, fakeDb(true))).toBe("u-1");
  });

  it("returns null when the user is not an admin", async () => {
    const token = await signSession("u-2", process.env.SESSION_SECRET!);
    const req = { headers: { cookie: `${SESSION_COOKIE}=${token}` } };
    expect(await requireAdminUserId(req, fakeDb(false))).toBeNull();
  });

  it("returns null when there is no session", async () => {
    expect(await requireAdminUserId({ headers: {} }, fakeDb(true))).toBeNull();
  });

  it("returns null when the user row is missing", async () => {
    const token = await signSession("u-3", process.env.SESSION_SECRET!);
    const req = { headers: { cookie: `${SESSION_COOKIE}=${token}` } };
    expect(await requireAdminUserId(req, fakeDb(null))).toBeNull();
  });
});
