"use client";

import { useEffect, useState, useCallback, useRef } from "react";
import { getAnonClient } from "@/lib/supabase";
import { PlayerView } from "@/lib/types";

export function useGame(gameId: string, playerId: string | null) {
  const [view, setView] = useState<PlayerView | null>(null);
  const [error, setError] = useState("");
  const [submitting, setSubmitting] = useState(false);
  const viewRef = useRef(view);
  viewRef.current = view;

  const fetchState = useCallback(async () => {
    if (!playerId) return;
    try {
      const res = await fetch(`/api/game/${gameId}/state?playerId=${playerId}`);
      const data = await res.json();
      if (!res.ok) {
        setError(data.error || "Failed to load game");
        return;
      }
      setView(data as PlayerView);
      setError("");
    } catch {
      setError("Network error");
    }
  }, [gameId, playerId]);

  useEffect(() => {
    fetchState();

    const supabase = getAnonClient();
    const channel = supabase
      .channel(`game-${gameId}`)
      .on(
        "postgres_changes",
        {
          event: "UPDATE",
          schema: "public",
          table: "games",
          filter: `id=eq.${gameId}`,
        },
        () => {
          fetchState();
        }
      )
      .subscribe();

    return () => {
      supabase.removeChannel(channel);
    };
  }, [gameId, fetchState]);

  const submitAction = useCallback(
    async (body: Record<string, unknown>) => {
      if (!playerId || submitting) return;
      setSubmitting(true);
      setError("");
      try {
        const res = await fetch(`/api/game/${gameId}/action`, {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ ...body, playerId }),
        });
        const data = await res.json();
        if (!res.ok) {
          setError(data.error || "Action failed");
          return;
        }
        // Update view immediately from response
        if (data.myHand) {
          setView(data as PlayerView);
        }
      } catch {
        setError("Network error");
      } finally {
        setSubmitting(false);
      }
    },
    [gameId, playerId, submitting]
  );

  return { view, error, submitting, submitAction, fetchState };
}
