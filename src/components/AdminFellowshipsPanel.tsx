import { useEffect, useState } from "react";
import { api, type AdminFellowship } from "../api-client";
import { ACTIVITY_TYPES } from "../../shared/activity-types";

const DEFAULT_TYPES = ["Run", "TrailRun", "VirtualRun", "Walk", "Hike"];

export function AdminFellowshipsPanel() {
  const [fellowships, setFellowships] = useState<AdminFellowship[]>([]);
  const [name, setName] = useState("");
  const [startDate, setStartDate] = useState("2026-07-01");
  const [types, setTypes] = useState<string[]>(DEFAULT_TYPES);
  const [clientId, setClientId] = useState("");
  const [clientSecret, setClientSecret] = useState("");
  const [saving, setSaving] = useState(false);

  const load = () => api.adminListFellowships().then((r) => setFellowships(r.fellowships));
  useEffect(() => { load(); }, []);

  const toggleType = (key: string) =>
    setTypes((prev) => (prev.includes(key) ? prev.filter((t) => t !== key) : [...prev, key]));

  const create = async () => {
    if (!name || types.length === 0) return;
    setSaving(true);
    try {
      await api.adminCreateFellowship({
        name, startDate, allowedActivityTypes: types,
        stravaClientId: clientId || undefined, stravaClientSecret: clientSecret || undefined,
      });
      setName(""); setClientId(""); setClientSecret(""); setTypes(DEFAULT_TYPES);
      await load();
    } finally {
      setSaving(false);
    }
  };

  return (
    <div className="admin-panel">
      <h2>Fellowships</h2>
      <ul className="admin-list">
        {fellowships.map((f) => (
          <li key={f.id} className="admin-list-row">
            <strong>{f.name}</strong> — {f.memberCount} member{f.memberCount === 1 ? "" : "s"}, starts {f.startDate}
            <div className="admin-list-sub">{f.allowedActivityTypes.join(", ")} {f.hasCustomStravaApp ? "· dedicated Strava app" : "· default Strava app"}</div>
            <button
              onClick={() => navigator.clipboard.writeText(`${window.location.origin}/join?token=${f.inviteToken}`)}
            >
              Copy invite link
            </button>
          </li>
        ))}
      </ul>

      <h3>Create a Fellowship</h3>
      <div className="admin-form">
        <label>Name <input value={name} onChange={(e) => setName(e.target.value)} /></label>
        <label>Start date <input type="date" value={startDate} onChange={(e) => setStartDate(e.target.value)} /></label>
        <div className="admin-type-checklist">
          {ACTIVITY_TYPES.map((t) => (
            <label key={t.key}>
              <input type="checkbox" checked={types.includes(t.key)} onChange={() => toggleType(t.key)} />
              {t.label}
            </label>
          ))}
        </div>
        <label>Strava client ID (optional — blank uses the default app)
          <input value={clientId} onChange={(e) => setClientId(e.target.value)} />
        </label>
        <label>Strava client secret (optional)
          <input value={clientSecret} onChange={(e) => setClientSecret(e.target.value)} type="password" />
        </label>
        <button onClick={create} disabled={saving || !name || types.length === 0}>Create Fellowship</button>
      </div>
    </div>
  );
}
