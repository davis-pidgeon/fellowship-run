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
  const FOOT = new Set(["Run", "TrailRun", "VirtualRun", "Walk", "Hike"]);

  it("converts meters to miles, stops on a short page, and records sportType", async () => {
    const page1 = [
      { id: 1, type: "Run", distance: 1609.344, start_date: "2026-07-01T00:00:00Z", name: "Morning" },
      { id: 2, type: "Ride", distance: 20000, start_date: "2026-07-01T00:00:00Z", name: "Bike" },
    ];
    const fetchImpl = vi.fn(() => jsonResponse(page1)) as unknown as typeof fetch;
    const runs = await fetchRunsSince("acc", 0, FOOT, fetchImpl);
    expect(runs).toHaveLength(1);
    expect(runs[0].stravaActivityId).toBe(1);
    expect(runs[0].sportType).toBe("Run");
    expect(runs[0].distanceMiles).toBeCloseTo(1, 6);
    expect(fetchImpl).toHaveBeenCalledTimes(1); // short page => no page 2
  });

  it("keeps all types passed in allowedTypes (e.g. the full foot-travel set)", async () => {
    const page = [
      { id: 1, type: "Run", distance: 1609.344, start_date: "2026-07-01T00:00:00Z", name: "Road" },
      { id: 2, type: "TrailRun", distance: 1609.344, start_date: "2026-07-01T00:00:00Z", name: "Trail" },
      { id: 3, type: "VirtualRun", distance: 1609.344, start_date: "2026-07-01T00:00:00Z", name: "Treadmill" },
      { id: 4, type: "Walk", distance: 1609.344, start_date: "2026-07-06T00:00:00Z", name: "USA BEAT BELGIUM" },
      { id: 5, type: "Hike", distance: 1609.344, start_date: "2026-07-01T00:00:00Z", name: "Mountain" },
    ];
    const fetchImpl = vi.fn(() => jsonResponse(page)) as unknown as typeof fetch;
    const runs = await fetchRunsSince("acc", 0, FOOT, fetchImpl);
    expect(runs.map((r) => r.stravaActivityId)).toEqual([1, 2, 3, 4, 5]);
  });

  it("drops types not in allowedTypes", async () => {
    const page = [
      { id: 1, type: "Run", distance: 1609.344, start_date: "2026-07-01T00:00:00Z", name: "Run" },
      { id: 2, type: "Ride", distance: 20000, start_date: "2026-07-01T00:00:00Z", name: "Bike" },
      { id: 3, type: "Swim", distance: 2000, start_date: "2026-07-01T00:00:00Z", name: "Pool" },
    ];
    const fetchImpl = vi.fn(() => jsonResponse(page)) as unknown as typeof fetch;
    const runs = await fetchRunsSince("acc", 0, FOOT, fetchImpl);
    expect(runs.map((r) => r.stravaActivityId)).toEqual([1]);
  });

  it("allows a cycling-only set when a fellowship is configured for it", async () => {
    const page = [
      { id: 1, type: "Run", distance: 1609.344, start_date: "2026-07-01T00:00:00Z", name: "Run" },
      { id: 2, type: "Ride", distance: 20000, start_date: "2026-07-01T00:00:00Z", name: "Bike" },
    ];
    const fetchImpl = vi.fn(() => jsonResponse(page)) as unknown as typeof fetch;
    const runs = await fetchRunsSince("acc", 0, new Set(["Ride"]), fetchImpl);
    expect(runs.map((r) => r.stravaActivityId)).toEqual([2]);
  });

  it("prefers sport_type over legacy type when classifying", async () => {
    const page = [
      { id: 1, type: "Run", sport_type: "TrailRun", distance: 1609.344, start_date: "2026-07-01T00:00:00Z", name: "Trail" },
      { id: 2, type: "Run", sport_type: "Ride", distance: 20000, start_date: "2026-07-01T00:00:00Z", name: "E-bike" },
    ];
    const fetchImpl = vi.fn(() => jsonResponse(page)) as unknown as typeof fetch;
    const runs = await fetchRunsSince("acc", 0, FOOT, fetchImpl);
    expect(runs.map((r) => r.stravaActivityId)).toEqual([1]);
  });
});
