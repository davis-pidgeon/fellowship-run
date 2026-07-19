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
import type { Member, Ghost } from "../api-client";
import type { SideQuest } from "../../shared/sidequests";
import type { DashboardView } from "../useSession";

// Ghosts carry everything the player card needs, minus a recent-activity list
// (which isn't shipped across fellowships) — map them into the `Member` shape
// `ProfileDetail` expects so the same card can be reused for both.
function ghostToMember(ghost: Ghost): Member {
  return {
    id: ghost.userId,
    displayName: ghost.displayName,
    chosenCharacter: ghost.chosenCharacter,
    color: ghost.color,
    totalMiles: ghost.totalMiles,
    openedQuests: ghost.openedQuests,
    stats: ghost.stats,
    activities: [],
  };
}

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
  const [openedQuests, setOpenedQuests] = useState<string[]>(me?.openedQuests ?? []);
  const openQuest = (q: SideQuest) => {
    setQuest(q);
    if (!openedQuests.includes(q.id)) {
      setOpenedQuests((prev) => [...prev, q.id]); // optimistic
      if (fellowshipId) api.questOpen(q.id, fellowshipId).catch(() => {}); // persist; transient failures are non-fatal
    }
  };

  // Detect newly-earned achievements for the current user and pop a toast.
  // notifiedRef seeds from the server so nothing already-seen re-fires; the first
  // pass seeds silently (no flood of pre-existing badges), later passes toast.
  const [toasts, setToasts] = useState<EarnedAchievement[]>([]);
  const notifiedRef = useRef<Set<string>>(new Set(me?.notifiedAchievements ?? []));
  const seededRef = useRef(false);
  useEffect(() => {
    if (!me) return;
    const base = me.members.find((m) => m.id === me.user.id);
    if (!base) return;
    const earned = computeAchievements({ ...base, openedQuests }).filter((a) => a.earned);
    const fresh = earned.filter((a) => !notifiedRef.current.has(a.id));
    if (fresh.length) {
      fresh.forEach((a) => notifiedRef.current.add(a.id));
      if (fellowshipId) api.achievementsSeen(fresh.map((a) => a.id), fellowshipId).catch(() => {});
      if (seededRef.current) setToasts((prev) => [...prev, ...fresh]);
    }
    seededRef.current = true;
  }, [me, openedQuests, fellowshipId]);

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
      <MapView
        members={me?.members ?? []}
        fellowshipMiles={me?.fellowshipMiles ?? 0}
        ghosts={view === "global" ? (globalData?.ghosts ?? []).filter((g) => g.fellowshipId !== fellowshipId) : undefined}
        focus={focus}
        myMiles={me?.user.totalMiles ?? 0}
        onOpenQuest={openQuest}
        onNavigate={() => setPanelCollapsed(true)}
        openedQuestIds={openedQuests}
        onSelectRunner={onSelectRunner}
        onSelectGhost={(g) => setProfileDetail(ghostToMember(g))}
      />
      {me && (
        <StatsPanel
          me={me}
          onSync={onSync}
          syncing={syncing}
          onSelectMember={(id) => setFocus({ id, nonce: Date.now() })}
          collapsed={panelCollapsed}
          onCollapsedChange={setPanelCollapsed}
          fellowships={me.fellowships}
          fellowshipId={fellowshipId}
          onSelectFellowship={(id) => { setFellowshipId(id); setView("fellowship"); }}
        />
      )}
      <CelebrationModal badges={badges} onClose={() => setBadges([])} />
      {me && <Passport totalMiles={me.user.totalMiles} openedQuestIds={openedQuests} />}
      {me && (
        <button
          className={"globe-btn" + (view === "global" ? " active" : "")}
          onClick={() => setView(view === "global" ? "fellowship" : "global")}
          title={view === "global" ? "Back to your fellowship" : "Global view"}
          aria-label="Toggle global view"
          aria-pressed={view === "global"}
        >
          <img src="/globe.png" alt="Global view" />
        </button>
      )}
      {me && <Settings me={me} refresh={refresh} />}
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
