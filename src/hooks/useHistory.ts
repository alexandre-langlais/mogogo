import { useState, useEffect, useCallback } from "react";
import {
  fetchHistory,
  deleteSession as deleteSessionService,
} from "@/services/history";
import type { SessionHistory } from "@/types";

export function useHistory() {
  const [sessions, setSessions] = useState<SessionHistory[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [page, setPage] = useState(0);
  const [hasMore, setHasMore] = useState(true);

  const load = useCallback(async (pageNum: number, replace: boolean) => {
    try {
      setLoading(true);
      setError(null);
      const data = await fetchHistory(pageNum);
      setSessions((prev) => (replace ? data : [...prev, ...data]));
      setHasMore(data.length === 20);
    } catch (e: any) {
      setError(e.message ?? "Unknown error");
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    load(0, true);
  }, [load]);

  const loadMore = useCallback(() => {
    if (!hasMore || loading) return;
    const nextPage = page + 1;
    setPage(nextPage);
    load(nextPage, false);
  }, [hasMore, loading, page, load]);

  const refresh = useCallback(() => {
    setPage(0);
    setHasMore(true);
    load(0, true);
  }, [load]);

  const remove = useCallback(async (id: string) => {
    try {
      await deleteSessionService(id);
      setSessions((prev) => prev.filter((s) => s.id !== id));
    } catch (e: any) {
      setError(e.message ?? "Unknown error");
    }
  }, []);

  return { sessions, loading, error, hasMore, loadMore, refresh, remove };
}
