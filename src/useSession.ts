import { useCallback, useEffect, useState } from "react";
import { api, type MeResponse } from "./api-client";

export function useSession() {
  const [data, setData] = useState<MeResponse | null>(null);
  const [loading, setLoading] = useState(true);

  // `initial` shows the full-screen loading state (first load / gating). A
  // background refresh (after a sync) updates data in place WITHOUT toggling
  // loading, so the dashboard — and any open celebration modal — stays mounted.
  const load = useCallback((initial: boolean) => {
    if (initial) setLoading(true);
    api.me()
      .then((d) => setData(d))
      .catch(() => setData(null))
      .finally(() => {
        if (initial) setLoading(false);
      });
  }, []);

  useEffect(() => { load(true); }, [load]);

  const refresh = useCallback(() => load(false), [load]);
  return { data, loading, refresh };
}
