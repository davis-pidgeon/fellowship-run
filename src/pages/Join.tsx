import { useEffect, useState } from "react";
import { api, stravaAuthUrl } from "../api-client";
import { LoadingRing } from "../components/LoadingRing";

export default function Join() {
  const token = new URLSearchParams(window.location.search).get("token") ?? "";
  const [state, setState] = useState<{ valid: boolean; name?: string } | null>(null);

  useEffect(() => {
    if (!token) { setState({ valid: false }); return; }
    api.checkInvite(token).then((r) => setState({ valid: r.valid, name: r.fellowshipName }));
  }, [token]);

  if (!state) return <LoadingRing label="Checking your invite…" />;
  if (!state.valid) return <div className="centered"><h1>Invalid invite</h1><p>Ask your friend for a fresh link.</p></div>;

  return (
    <div className="centered">
      <h1>Join {state.name}</h1>
      <p>Connect Strava to join the fellowship.</p>
      <a className="sync-btn" href={stravaAuthUrl(token)}>Join with Strava</a>
    </div>
  );
}
