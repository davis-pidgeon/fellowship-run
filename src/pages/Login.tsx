import { stravaAuthUrl } from "../api-client";

export default function Login() {
  return (
    <div className="centered">
      <h1>The Fellowship's Run</h1>
      <p>Run from the Shire to Mount Doom.</p>
      <a className="sync-btn" href={stravaAuthUrl()}>Connect with Strava</a>
    </div>
  );
}
