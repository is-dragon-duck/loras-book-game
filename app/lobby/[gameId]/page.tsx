"use client";

import { useEffect, useState, useCallback } from "react";
import { useParams, useRouter } from "next/navigation";
import { getAnonClient } from "@/lib/supabase";

interface LobbyPlayer {
  name: string;
  isMe: boolean;
}

interface LobbyState {
  gameId: string;
  phase: string;
  players: LobbyPlayer[];
  myPlayerId: string;
}

export default function LobbyPage() {
  const params = useParams();
  const router = useRouter();
  const gameId = params.gameId as string;
  const [lobby, setLobby] = useState<LobbyState | null>(null);
  const [error, setError] = useState("");
  const [starting, setStarting] = useState(false);

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
      if (data.phase === "playing" || data.phase === "finished") {
        router.push(`/game/${gameId}`);
        return;
      }
      setLobby(data);
    } catch {
      setError("Network error");
    }
  }, [gameId, playerId, router]);

  useEffect(() => {
    fetchState();

    // Subscribe to real-time changes on this game row
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

  async function handleStart() {
    if (!playerId) return;
    setStarting(true);
    setError("");
    try {
      const res = await fetch(`/api/game/${gameId}/action`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ action: "start", playerId }),
      });
      const data = await res.json();
      if (!res.ok) {
        setError(data.error || "Failed to start game");
        setStarting(false);
        return;
      }
      // Real-time subscription will trigger redirect to /game
    } catch {
      setError("Network error");
      setStarting(false);
    }
  }

  if (!playerId) {
    return (
      <main className="flex min-h-screen flex-col items-center justify-center p-8">
        <p className="text-red-400">No player session found. Go back and join the game.</p>
        <button
          onClick={() => router.push("/")}
          className="mt-4 px-4 py-2 bg-stone-700 rounded"
        >
          Back to Home
        </button>
      </main>
    );
  }

  if (error) {
    return (
      <main className="flex min-h-screen flex-col items-center justify-center p-8">
        <p className="text-red-400">{error}</p>
        <button
          onClick={() => router.push("/")}
          className="mt-4 px-4 py-2 bg-stone-700 rounded"
        >
          Back to Home
        </button>
      </main>
    );
  }

  if (!lobby) {
    return (
      <main className="flex min-h-screen flex-col items-center justify-center p-8">
        <p className="text-stone-400">Loading...</p>
      </main>
    );
  }

  const isHost = lobby.players[0]?.isMe;
  const canStart = isHost && lobby.players.length >= 2;

  return (
    <main className="flex min-h-screen flex-col items-center justify-center p-8">
      <h1 className="text-3xl font-bold mb-2">Game Lobby</h1>

      {/* Game code */}
      <div className="mb-6 text-center">
        <p className="text-stone-400 text-sm mb-1">Share this code with your friends:</p>
        <p className="text-4xl font-mono font-bold tracking-[0.3em] text-amber-400">
          {gameId}
        </p>
      </div>

      {/* Player list */}
      <div className="w-full max-w-sm mb-6">
        <h2 className="text-sm text-stone-400 mb-2">
          Players ({lobby.players.length}/6)
        </h2>
        <div className="space-y-2">
          {lobby.players.map((p, i) => (
            <div
              key={i}
              className={`px-4 py-2 rounded flex items-center justify-between ${
                p.isMe ? "bg-amber-900/40 border border-amber-700" : "bg-stone-800"
              }`}
            >
              <span>
                {p.name}
                {p.isMe && (
                  <span className="text-amber-400 text-sm ml-2">(you)</span>
                )}
              </span>
              {i === 0 && (
                <span className="text-xs text-stone-500 uppercase tracking-wide">
                  Host
                </span>
              )}
            </div>
          ))}
        </div>
      </div>

      {/* Seat order info */}
      <p className="text-stone-500 text-xs mb-4 max-w-sm text-center">
        Seat order is join order. Player 1 antes 1 and gets 3 cards, player 2 antes 2 and gets 4, etc.
      </p>

      {/* Start button (host only) */}
      {isHost && (
        <button
          onClick={handleStart}
          disabled={!canStart || starting}
          className="px-8 py-3 bg-amber-700 hover:bg-amber-600 disabled:opacity-50 rounded font-semibold text-stone-100 transition-colors"
        >
          {starting
            ? "Starting..."
            : !canStart
            ? "Need at least 2 players"
            : "Start Game"}
        </button>
      )}
      {!isHost && (
        <p className="text-stone-400 text-sm">Waiting for the host to start...</p>
      )}
    </main>
  );
}
