import { describe, it, expect, vi } from "vitest";
import { exchangeCode, refreshTokens, fetchRunsSince } from "./strava";

const deps = { clientId: "cid", clientSecret: "secret" };

function jsonResponse(body: unknown) {
  return Promise.resolve(new Response(JSON.stringify(body), { status: 200 }));
}

describe("exchangeCode", () => {
  it("posts the code and returns tokens + athlete", async () => {
    const fetchImpl = vi.fn(() =>
      jsonResponse({
        access_token: "acc", refresh_token: "ref", expires_at: 1000,
        athlete: { id: 42, firstname: "Sam", lastname: "G", profile: "http://x/p.png" },
      })
    ) as unknown as typeof fetch;
    const res = await exchangeCode("thecode", { ...deps, fetchImpl });
    expect(res.tokens).toEqual({ accessToken: "acc", refreshToken: "ref", expiresAt: 1000 });
    expect(res.athlete.id).toBe(42);
    expect(fetchImpl).toHaveBeenCalledWith(
      "https://www.strava.com/oauth/token",
      expect.objectContaining({ method: "POST" })
    );
  });
});

describe("refreshTokens", () => {
  it("returns refreshed tokens", async () => {
    const fetchImpl = vi.fn(() =>
      jsonResponse({ access_token: "a2", refresh_token: "r2", expires_at: 2000 })
    ) as unknown as typeof fetch;
    expect(await refreshTokens("oldref", { ...deps, fetchImpl })).toEqual({
      accessToken: "a2", refreshToken: "r2", expiresAt: 2000,
    });
  });
});

describe("fetchRunsSince", () => {
  it("keeps only runs, converts meters to miles, and stops on a short page", async () => {
    const page1 = [
      { id: 1, type: "Run", distance: 1609.344, start_date: "2026-07-01T00:00:00Z", name: "Morning" },
      { id: 2, type: "Ride", distance: 20000, start_date: "2026-07-01T00:00:00Z", name: "Bike" },
    ];
    const fetchImpl = vi.fn(() => jsonResponse(page1)) as unknown as typeof fetch;
    const runs = await fetchRunsSince("acc", 0, fetchImpl);
    expect(runs).toHaveLength(1);
    expect(runs[0].stravaActivityId).toBe(1);
    expect(runs[0].distanceMiles).toBeCloseTo(1, 6);
    expect(fetchImpl).toHaveBeenCalledTimes(1); // short page => no page 2
  });
});
