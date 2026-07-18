import { useState, useEffect, useRef } from "react";
import type { MeResponse, GlobalResponse } from "../api-client";
import { api } from "../api-client";
import { computeAchievements, type EarnedAchievement } from "../achievements";
import { AchievementToasts } from "../components/AchievementToasts";
import type { FellowshipBadge } from "../../shared/types";
import { MapView, type MapFocus } from "../components/MapView";
import { StatsPanel } from "../components/StatsPanel";
import { CelebrationModal } from "../components/CelebrationModal";
import { Passport } from "../components/Passport";
import { Settings } from "../components/Settings";
import { QuestNote } from "../components/QuestNote";
import { ProfilePopover, ClusterPicker, type ProfileTarget, type ClusterTarget } from "../components/ProfilePopover";
import { ProfileDetail } from "../components/ProfileDetail";
import type { Member } from "../api-client";
import type { SideQuest } from "../../shared/sidequests";
import { FellowshipSwitcher } from "../components/FellowshipSwitcher";
import type { DashboardView } from "../useSession";

export default function Dashboard({
  me, refresh, globalData, fellowshipId, setFellowshipId, view, setView,
}: {
  me: MeResponse | null;
  refresh: () => void;
  globalData: GlobalResponse | null;
  fellowshipId: string | undefined;
  setFellowshipId: (id: string) => void;
  view: DashboardView;
  setView: (v: DashboardView) => void;
}) {
  const [syncing, setSyncing] = useState(false);
  const [badges, setBadges] = useState<FellowshipBadge[]>([]);
  const [focus, setFocus] = useState<MapFocus | null>(null);
  const [quest, setQuest] = useState<SideQuest | null>(null);
  const [panelCollapsed, setPanelCollapsed] = useState(true);
  const [profile, setProfile] = useState<ProfileTarget | null>(null);
  const [cluster, setCluster] = useState<ClusterTarget | null>(null);
  const [profileDetail, setProfileDetail] = useState<Member | null>(null);

  const onSelectRunner = (members: Member[], pt: { x: number; y: number }) => {
    if (members.length <= 1) setProfile({ member: members[0], pt });
    else setCluster({ members, pt });
  };

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

  // Detect newly-earned achievements for the current user and pop a toast.
  // notifiedRef seeds from the server so nothing already-seen re-fires; the first
  // pass seeds silently (no flood of pre-existing badges), later passes toast.
  const [toasts, setToasts] = useState<EarnedAchievement[]>([]);
  const notifiedRef = useRef<Set<string>>(new Set(me.notifiedAchievements));
  const seededRef = useRef(false);
  useEffect(() => {
    const base = me.members.find((m) => m.id === me.user.id);
    if (!base) return;
    const earned = computeAchievements({ ...base, openedQuests }).filter((a) => a.earned);
    const fresh = earned.filter((a) => !notifiedRef.current.has(a.id));
    if (fresh.length) {
      fresh.forEach((a) => notifiedRef.current.add(a.id));
      api.achievementsSeen(fresh.map((a) => a.id)).catch(() => {});
      if (seededRef.current) setToasts((prev) => [...prev, ...fresh]);
    }
    seededRef.current = true;
  }, [me, openedQuests]);

  const onSync = async () => {
    if (!fellowshipId) return;
    setSyncing(true);
    try {
      const res = await api.sync(fellowshipId);
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
      <FellowshipSwitcher
        fellowships={(view === "global" ? globalData?.fellowships : me?.fellowships) ?? []}
        fellowshipId={fellowshipId}
        view={view}
        onSelect={(id) => { setFellowshipId(id); setView("fellowship"); }}
        onGlobal={() => setView("global")}
      />
      <MapView
        members={me.members}
        fellowshipMiles={me.fellowshipMiles}
        focus={focus}
        myMiles={me.user.totalMiles}
        onOpenQuest={openQuest}
        onNavigate={() => setPanelCollapsed(true)}
        openedQuestIds={openedQuests}
        onSelectRunner={onSelectRunner}
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
      <ProfilePopover
        target={profile}
        onClose={() => setProfile(null)}
        onViewDetails={(m) => { setProfile(null); setProfileDetail(m); }}
      />
      <ClusterPicker
        target={cluster}
        onClose={() => setCluster(null)}
        onPick={(m) => setCluster((c) => { setProfile({ member: m, pt: c!.pt }); return null; })}
      />
      <ProfileDetail member={profileDetail} onClose={() => setProfileDetail(null)} />
      <AchievementToasts toasts={toasts} onDismiss={(id) => setToasts((prev) => prev.filter((t) => t.id !== id))} />
    </div>
  );
}
