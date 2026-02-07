"use client";

import { useEffect, useState, useCallback } from "react";
import { useParams, useRouter } from "next/navigation";
import { getAnonClient } from "@/lib/supabase";
import { PlayerView } from "@/lib/types";
import { cardDisplayName } from "@/lib/cards";

export default function GamePage() {
  const params = useParams();
  const router = useRouter();
  const gameId = params.gameId as string;
  const [view, setView] = useState<PlayerView | null>(null);
  const [error, setError] = useState("");

  const playerId =
    typeof window !== "undefined"
      ? localStorage.getItem(`player-${gameId}`)
      : null;

  const fetchState = useCallback(async () => {
    if (!playerId) return;
    try {
      const res = await fetch(`/api/game/${gameId}/state?playerId=${playerId}`);
      const data = await res.json();
      if (!res.ok) {
        setError(data.error || "Failed to load game");
        return;
      }
      // If still in lobby, redirect back
      if (data.phase === "lobby") {
        router.push(`/lobby/${gameId}`);
        return;
      }
      setView(data as PlayerView);
    } catch {
      setError("Network error");
    }
  }, [gameId, playerId, router]);

  useEffect(() => {
    fetchState();

    const supabase = getAnonClient();
    const channel = supabase
      .channel(`game-${gameId}`)
      .on(
        "postgres_changes",
        { event: "UPDATE", schema: "public", table: "games", filter: `id=eq.${gameId}` },
        () => {
          fetchState();
        }
      )
      .subscribe();

    return () => {
      supabase.removeChannel(channel);
    };
  }, [gameId, fetchState]);

  if (!playerId) {
    return (
      <main className="flex min-h-screen flex-col items-center justify-center p-8">
        <p className="text-red-400">No player session found.</p>
        <button onClick={() => router.push("/")} className="mt-4 px-4 py-2 bg-stone-700 rounded">
          Back to Home
        </button>
      </main>
    );
  }

  if (error) {
    return (
      <main className="flex min-h-screen flex-col items-center justify-center p-8">
        <p className="text-red-400">{error}</p>
      </main>
    );
  }

  if (!view) {
    return (
      <main className="flex min-h-screen flex-col items-center justify-center p-8">
        <p className="text-stone-400">Loading game...</p>
      </main>
    );
  }

  return (
    <main className="min-h-screen p-4 max-w-4xl mx-auto">
      {/* Header */}
      <div className="flex items-center justify-between mb-4">
        <h1 className="text-xl font-bold">Game {gameId}</h1>
        <div className="text-sm text-stone-400">
          {view.isMyTurn ? (
            <span className="text-amber-400 font-semibold">Your turn!</span>
          ) : (
            <span>Waiting for {view.currentPlayerName}...</span>
          )}
        </div>
      </div>

      {/* Kingdom */}
      <section className="mb-4">
        <h2 className="text-sm text-stone-400 mb-1">Kingdom</h2>
        <div className="flex gap-2 flex-wrap">
          {view.kingdom.map((cardId) => (
            <CardChip key={cardId} cardId={cardId} />
          ))}
          {view.kingdom.length === 0 && (
            <span className="text-stone-600 text-sm">Empty</span>
          )}
        </div>
      </section>

      {/* Deck / Discard / Burned info */}
      <div className="flex gap-4 mb-4 text-sm text-stone-400">
        <span>Deck: {view.deckCount}</span>
        <span>Discard: {view.discardPile.length}</span>
        <span>Burned: {view.burnedCount}</span>
      </div>

      {/* Players */}
      <section className="mb-4 space-y-2">
        <h2 className="text-sm text-stone-400 mb-1">Players</h2>
        {view.players.map((p) => (
          <div
            key={p.seatIndex}
            className={`p-3 rounded ${
              p.isMe
                ? "bg-amber-900/30 border border-amber-800"
                : p.seatIndex === view.currentPlayerSeat
                ? "bg-stone-800 border border-stone-600"
                : "bg-stone-800/50"
            }`}
          >
            <div className="flex items-center justify-between mb-1">
              <span className="font-semibold">
                {p.name}
                {p.isMe && <span className="text-amber-400 text-sm ml-1">(you)</span>}
                {p.eliminated && <span className="text-red-400 text-sm ml-1">(eliminated)</span>}
              </span>
              <span className="text-sm text-stone-400">
                Hand: {p.handCount} | Contrib: {p.contributionsMade} | Remaining: {p.contributionsRemaining}
              </span>
            </div>
            {/* Territory */}
            <div className="flex gap-1 flex-wrap">
              {p.territory.map((cardId, i) => (
                <CardChip key={`${cardId}-${i}`} cardId={cardId} small />
              ))}
              {p.territory.length === 0 && (
                <span className="text-stone-600 text-xs">No territory</span>
              )}
            </div>
          </div>
        ))}
      </section>

      {/* My Hand */}
      <section className="mb-4">
        <h2 className="text-sm text-stone-400 mb-1">
          Your Hand ({view.myHand.length}/{view.myHandLimit})
        </h2>
        <div className="flex gap-2 flex-wrap">
          {view.myHand.map((cardId) => (
            <CardChip key={cardId} cardId={cardId} />
          ))}
          {view.myHand.length === 0 && (
            <span className="text-stone-600 text-sm">Empty</span>
          )}
        </div>
      </section>

      {/* Available Actions */}
      <section className="mb-4">
        <h2 className="text-sm text-stone-400 mb-1">Actions</h2>
        {view.availableActions.length > 0 ? (
          <div className="flex gap-2 flex-wrap">
            {view.availableActions.map((a) => (
              <span key={a} className="px-3 py-1 bg-amber-800 rounded text-sm">
                {a}
              </span>
            ))}
          </div>
        ) : (
          <p className="text-stone-600 text-sm">
            {view.winner ? "Game over!" : "Waiting for another player..."}
          </p>
        )}
      </section>

      {/* Game Log */}
      <section>
        <h2 className="text-sm text-stone-400 mb-1">Log</h2>
        <div className="bg-stone-800/50 rounded p-3 max-h-48 overflow-y-auto text-sm space-y-1">
          {view.log.map((entry, i) => (
            <p key={i} className="text-stone-300">{entry.msg}</p>
          ))}
        </div>
      </section>
    </main>
  );
}

// Simple card display chip
function CardChip({ cardId, small }: { cardId: string; small?: boolean }) {
  const name = cardDisplayName(cardId);
  const type = cardId.split("-")[0];
  const colors: Record<string, string> = {
    stag: "bg-green-900 text-green-200 border-green-700",
    hunt: "bg-red-900 text-red-200 border-red-700",
    healing: "bg-blue-900 text-blue-200 border-blue-700",
    magi: "bg-purple-900 text-purple-200 border-purple-700",
    tithe: "bg-yellow-900 text-yellow-200 border-yellow-700",
    kingscommand: "bg-orange-900 text-orange-200 border-orange-700",
  };
  const color = colors[type] || "bg-stone-700 text-stone-200";

  return (
    <span
      className={`${color} border rounded ${
        small ? "px-1.5 py-0.5 text-xs" : "px-2 py-1 text-sm"
      } font-medium`}
    >
      {name}
    </span>
  );
}
