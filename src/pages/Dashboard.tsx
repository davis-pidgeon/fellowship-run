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
import { GlobalRankingPanel } from "../components/GlobalRankingPanel";
import { FellowshipCard } from "../components/FellowshipCard";
import type { Member } from "../api-client";
import type { SideQuest } from "../../shared/sidequests";
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
  const [cardFellowshipId, setCardFellowshipId] = useState<string | null>(null);

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

  // Detect newly-earned member-of-the-week badges and pop a toast, mirroring the
  // achievements effect above: first pass seeds silently, later passes toast.
  const badgeSeenRef = useRef<Set<string>>(new Set());
  const badgeSeededRef = useRef(false);
  useEffect(() => {
    if (!me) return;
    const weeks = (me.weeklyBadges ?? []).map((b) => b.week_start);
    const fresh = weeks.filter((w) => !badgeSeenRef.current.has(w));
    fresh.forEach((w) => badgeSeenRef.current.add(w));
    if (badgeSeededRef.current && fresh.length) {
      setToasts((prev) => [...prev, ...fresh.map((w) => ({ id: `week-${w}`, name: "Member of the Week!", description: `You logged the most miles the week of ${w}.`, icon: "🏅", earned: true }))]);
    }
    badgeSeededRef.current = true;
  }, [me]);

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
      />
      {me && view !== "global" && (
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
      {view === "global" && globalData && (
        <GlobalRankingPanel
          rankings={globalData.rankings}
          myFellowshipId={fellowshipId}
          onSelectFellowship={(id) => setCardFellowshipId(id)}
        />
      )}
      {me && view !== "global" && fellowshipId && (
        <button className="trophy-btn" onClick={() => setCardFellowshipId(fellowshipId)} title="Your trophy case" aria-label="Open your fellowship card">
          <img src="/trophy.png" alt="Trophy case" onError={(e) => ((e.currentTarget as HTMLImageElement).style.display = "none")} />
        </button>
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
        onViewDetails={(m) => { setProfile(null); setProfileDetail({ ...m, fellowshipName: me?.fellowship.name }); }}
      />
      <ClusterPicker
        target={cluster}
        onClose={() => setCluster(null)}
        onPick={(m) => setCluster((c) => { setProfile({ member: m, pt: c!.pt }); return null; })}
      />
      <ProfileDetail member={profileDetail} onClose={() => setProfileDetail(null)} />
      <FellowshipCard
        fellowshipId={cardFellowshipId}
        isLeader={!!globalData?.rankings.find((r) => r.id === cardFellowshipId)?.isProgressLeader}
        onClose={() => setCardFellowshipId(null)}
      />
      <AchievementToasts toasts={toasts} onDismiss={(id) => setToasts((prev) => prev.filter((t) => t.id !== id))} />
    </div>
  );
}
