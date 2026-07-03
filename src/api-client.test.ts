import { describe, it, expect, vi, beforeEach } from "vitest";
import { stravaAuthUrl, api } from "./api-client";

beforeEach(() => {
  vi.stubEnv("VITE_STRAVA_CLIENT_ID", "12345");
  vi.stubEnv("VITE_STRAVA_REDIRECT_URI", "http://localhost:5173/api/auth/strava-callback");
});

describe("stravaAuthUrl", () => {
  it("includes client id, scope, and invite token as state", () => {
    const url = stravaAuthUrl("inv-abc");
    expect(url).toContain("client_id=12345");
    expect(url).toContain("scope=activity%3Aread");
    expect(url).toContain("state=inv-abc");
    expect(url).toContain("response_type=code");
  });
});

describe("api.sync", () => {
  it("POSTs to /api/sync with credentials", async () => {
    const fetchMock = vi.fn(() =>
      Promise.resolve(new Response(JSON.stringify({ importedCount: 0, totalMiles: 0, fellowshipMiles: 0, newBadges: [] }), { status: 200 }))
    );
    vi.stubGlobal("fetch", fetchMock);
    const res = await api.sync();
    expect(res.importedCount).toBe(0);
    expect(fetchMock).toHaveBeenCalledWith("/api/sync", expect.objectContaining({ method: "POST", credentials: "include" }));
  });
});
