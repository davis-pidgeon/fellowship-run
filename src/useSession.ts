import { useCallback, useEffect, useState } from "react";
import { api, type MeResponse, type GlobalResponse } from "./api-client";

export type DashboardView = "fellowship" | "global";

export function useSession() {
  const [data, setData] = useState<MeResponse | null>(null);
  const [globalData, setGlobalData] = useState<GlobalResponse | null>(null);
  const [loading, setLoading] = useState(true);
  const [fellowshipId, setFellowshipId] = useState<string | undefined>(undefined);
  const [view, setView] = useState<DashboardView>("fellowship");

  const load = useCallback((initial: boolean) => {
    if (initial) setLoading(true);
    const request = view === "global" ? api.meGlobal().then((d) => { setGlobalData(d); return null; }) : api.me(fellowshipId).then((d) => { setData(d); if (d && !fellowshipId) setFellowshipId(d.fellowship.id); return d; });
    request.catch(() => { setData(null); setGlobalData(null); }).finally(() => { if (initial) setLoading(false); });
  }, [fellowshipId, view]);

  useEffect(() => { load(true); }, [load]);

  const refresh = useCallback(() => load(false), [load]);
  return { data, globalData, loading, refresh, fellowshipId, setFellowshipId, view, setView };
}
