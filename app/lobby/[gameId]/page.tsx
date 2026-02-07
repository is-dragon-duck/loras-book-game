"use client";

import { useEffect, useState, useCallback } from "react";
import { useParams, useRouter } from "next/navigation";
import { getAnonClient } from "@/lib/supabase";

interface LobbyPlayer {
  name: string;
  seatIndex: number;
  ante: number;
  startingCards: number;
  isMe: boolean;
}

interface LobbyState {
  gameId: string;
  phase: string;
  players: LobbyPlayer[];
  myPlayerId: string;
  isHost: boolean;
}

export default function LobbyPage() {
  const params = useParams();
  const router = useRouter();
  const gameId = params.gameId as string;
  const [lobby, setLobby] = useState<LobbyState | null>(null);
  const [error, setError] = useState("");
  const [starting, setStarting] = useState(false);
  const [copied, setCopied] = useState(false);

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

  async function handleCopyCode() {
    try {
      await navigator.clipboard.writeText(gameId);
      setCopied(true);
      setTimeout(() => setCopied(false), 2000);
    } catch {
      // Fallback: select text
    }
  }

  if (!playerId) {
    return (
      <main className="flex min-h-screen flex-col items-center justify-center p-8">
        <p className="text-red-400 mb-2">No player session found for this game.</p>
        <p className="text-stone-400 text-sm mb-4">Go back and join using the game code.</p>
        <button
          onClick={() => router.push("/")}
          className="px-4 py-2 bg-stone-700 hover:bg-stone-600 rounded transition-colors"
        >
          Back to Home
        </button>
      </main>
    );
  }

  if (error) {
    return (
      <main className="flex min-h-screen flex-col items-center justify-center p-8">
        <p className="text-red-400 mb-4">{error}</p>
        <button
          onClick={() => router.push("/")}
          className="px-4 py-2 bg-stone-700 hover:bg-stone-600 rounded transition-colors"
        >
          Back to Home
        </button>
      </main>
    );
  }

  if (!lobby) {
    return (
      <main className="flex min-h-screen flex-col items-center justify-center p-8">
        <p className="text-stone-400">Loading lobby...</p>
      </main>
    );
  }

  const canStart = lobby.isHost && lobby.players.length >= 2;

  return (
    <main className="flex min-h-screen flex-col items-center justify-center p-8">
      <h1 className="text-3xl font-bold mb-6">Game Lobby</h1>

      {/* Game code with copy button */}
      <div className="mb-8 text-center">
        <p className="text-stone-400 text-sm mb-2">Share this code with your friends:</p>
        <div className="flex items-center gap-3">
          <p className="text-4xl font-mono font-bold tracking-[0.3em] text-amber-400">
            {gameId}
          </p>
          <button
            onClick={handleCopyCode}
            className="px-3 py-1.5 bg-stone-700 hover:bg-stone-600 rounded text-sm transition-colors"
            title="Copy game code"
          >
            {copied ? "✓ Copied" : "Copy"}
          </button>
        </div>
      </div>

      {/* Player list with seat details */}
      <div className="w-full max-w-md mb-6">
        <h2 className="text-sm text-stone-400 mb-3">
          Players ({lobby.players.length}/6)
        </h2>
        <div className="space-y-2">
          {lobby.players.map((p) => (
            <div
              key={p.seatIndex}
              className={`px-4 py-3 rounded ${
                p.isMe
                  ? "bg-amber-900/30 border border-amber-800"
                  : "bg-stone-800"
              }`}
            >
              <div className="flex items-center justify-between">
                <div>
                  <span className="font-semibold">
                    {p.name}
                  </span>
                  {p.isMe && (
                    <span className="text-amber-400 text-sm ml-2">(you)</span>
                  )}
                  {p.seatIndex === 0 && (
                    <span className="text-stone-500 text-xs ml-2 uppercase tracking-wide">
                      Host
                    </span>
                  )}
                </div>
                <div className="text-right text-sm text-stone-400">
                  <span>Seat {p.seatIndex + 1}</span>
                </div>
              </div>
              <div className="text-xs text-stone-500 mt-1">
                Antes {p.ante} · Starts with {p.startingCards} cards
              </div>
            </div>
          ))}

          {/* Empty seat slots */}
          {Array.from({ length: 6 - lobby.players.length }).map((_, i) => {
            const seatNum = lobby.players.length + i;
            return (
              <div
                key={`empty-${seatNum}`}
                className="px-4 py-3 rounded bg-stone-800/30 border border-dashed border-stone-700 text-stone-600"
              >
                <div className="flex items-center justify-between">
                  <span className="italic">Empty seat</span>
                  <span className="text-sm">Seat {seatNum + 1}</span>
                </div>
                <div className="text-xs mt-1">
                  Antes {seatNum + 1} · Starts with {2 + seatNum + 1} cards
                </div>
              </div>
            );
          })}
        </div>
      </div>

      {/* Note about later seats */}
      <p className="text-stone-500 text-xs mb-6 max-w-md text-center">
        Later seats ante more but start with more cards to compensate. Seat order is join order.
      </p>

      {/* Start / waiting */}
      {lobby.isHost ? (
        <button
          onClick={handleStart}
          disabled={!canStart || starting}
          className="px-8 py-3 bg-amber-700 hover:bg-amber-600 disabled:opacity-50 rounded font-semibold text-stone-100 transition-colors"
        >
          {starting
            ? "Starting..."
            : lobby.players.length < 2
            ? "Waiting for players..."
            : `Start Game (${lobby.players.length} players)`}
        </button>
      ) : (
        <div className="text-center">
          <p className="text-stone-400 text-sm">Waiting for the host to start the game...</p>
          <p className="text-stone-600 text-xs mt-1">The game will begin automatically when the host starts it.</p>
        </div>
      )}

      {error && (
        <p className="text-red-400 text-sm mt-4">{error}</p>
      )}
    </main>
  );
}
