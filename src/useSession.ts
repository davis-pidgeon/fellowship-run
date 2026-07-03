import { useCallback, useEffect, useState } from "react";
import { api, type MeResponse } from "./api-client";

export function useSession() {
  const [data, setData] = useState<MeResponse | null>(null);
  const [loading, setLoading] = useState(true);

  const refresh = useCallback(() => {
    setLoading(true);
    api.me().then((d) => setData(d)).catch(() => setData(null)).finally(() => setLoading(false));
  }, []);

  useEffect(() => { refresh(); }, [refresh]);
  return { data, loading, refresh };
}
