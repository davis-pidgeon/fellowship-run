import { describe, it, expect } from "vitest";
import { parseCookies, sessionCookie, CLEAR_COOKIE, readSessionUserId, SESSION_COOKIE } from "./http";
import { signSession } from "./session";

describe("parseCookies", () => {
  it("parses a cookie header", () => {
    expect(parseCookies("a=1; b=two")).toEqual({ a: "1", b: "two" });
  });
  it("handles undefined", () => {
    expect(parseCookies(undefined)).toEqual({});
  });
});

describe("cookie builders", () => {
  it("marks the session cookie HttpOnly and Lax", () => {
    const c = sessionCookie("tok");
    expect(c).toContain(`${SESSION_COOKIE}=tok`);
    expect(c).toContain("HttpOnly");
    expect(c).toContain("SameSite=Lax");
  });
  it("clears with Max-Age=0", () => {
    expect(CLEAR_COOKIE).toContain("Max-Age=0");
  });
});

describe("readSessionUserId", () => {
  it("returns the userId from a valid session cookie", async () => {
    process.env.SESSION_SECRET = "a-test-secret-that-is-long-enough!!";
    const token = await signSession("u-9", process.env.SESSION_SECRET);
    const req = { headers: { cookie: `${SESSION_COOKIE}=${token}` } };
    expect(await readSessionUserId(req)).toBe("u-9");
  });
  it("returns null when no cookie is present", async () => {
    expect(await readSessionUserId({ headers: {} })).toBeNull();
  });
});
