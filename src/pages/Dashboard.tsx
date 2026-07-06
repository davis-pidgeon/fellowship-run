import { useState } from "react";
import type { MeResponse } from "../api-client";
import { api } from "../api-client";
import type { Milestone } from "../../shared/types";
import { MapView, type MapFocus } from "../components/MapView";
import { StatsPanel } from "../components/StatsPanel";
import { CelebrationModal } from "../components/CelebrationModal";
import { Passport } from "../components/Passport";
import { Settings } from "../components/Settings";
import { QuestNote } from "../components/QuestNote";
import type { SideQuest } from "../../shared/sidequests";

export default function Dashboard({ me, refresh }: { me: MeResponse; refresh: () => void }) {
  const [syncing, setSyncing] = useState(false);
  const [badges, setBadges] = useState<Milestone[]>([]);
  const [focus, setFocus] = useState<MapFocus | null>(null);
  const [quest, setQuest] = useState<SideQuest | null>(null);
  const [panelCollapsed, setPanelCollapsed] = useState(true);

  // Notes the runner has opened: they leave the map and collect in the backpack.
  // Persisted server-side (per user) so the collection survives across devices.
  const [openedQuests, setOpenedQuests] = useState<string[]>(me.openedQuests ?? []);
  const openQuest = (q: SideQuest) => {
    setQuest(q);
    if (!openedQuests.includes(q.id)) {
      setOpenedQuests((prev) => [...prev, q.id]); // optimistic
      api.questOpen(q.id).catch(() => {}); // persist; transient failures are non-fatal
    }
  };

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
      <MapView
        members={me.members}
        fellowshipMiles={me.fellowshipMiles}
        focus={focus}
        myMiles={me.user.totalMiles}
        onOpenQuest={openQuest}
        onNavigate={() => setPanelCollapsed(true)}
        openedQuestIds={openedQuests}
      />
      <StatsPanel
        me={me}
        onSync={onSync}
        syncing={syncing}
        onSelectMember={(id) => setFocus({ id, nonce: Date.now() })}
        collapsed={panelCollapsed}
        onCollapsedChange={setPanelCollapsed}
      />
      <CelebrationModal badges={badges} onClose={() => setBadges([])} />
      <Passport totalMiles={me.user.totalMiles} openedQuestIds={openedQuests} />
      <Settings me={me} refresh={refresh} />
      <QuestNote quest={quest} onClose={() => setQuest(null)} />
    </div>
  );
}
