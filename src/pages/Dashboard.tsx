import { useState } from "react";
import type { MeResponse } from "../api-client";
import { api } from "../api-client";
import type { Milestone } from "../../shared/types";
import { MapView } from "../components/MapView";
import { StatsPanel } from "../components/StatsPanel";
import { CelebrationModal } from "../components/CelebrationModal";

export default function Dashboard({ me, refresh }: { me: MeResponse; refresh: () => void }) {
  const [syncing, setSyncing] = useState(false);
  const [badges, setBadges] = useState<Milestone[]>([]);

  const onSync = async () => {
    setSyncing(true);
    try {
      const res = await api.sync();
      if (res.newBadges.length) setBadges(res.newBadges);
      refresh();
    } catch (e) {
      if (e instanceof Error && e.message === "409") alert("Please reconnect Strava.");
      else if (e instanceof Error && e.message === "429") alert("Strava is busy — try again shortly.");
      else alert("Sync failed — please try again shortly.");
    } finally {
      setSyncing(false);
    }
  };

  return (
    <div className="dashboard">
      <MapView members={me.members} fellowshipMiles={me.fellowshipMiles} />
      <StatsPanel me={me} onSync={onSync} syncing={syncing} />
      <CelebrationModal badges={badges} onClose={() => setBadges([])} />
    </div>
  );
}
