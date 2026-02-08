"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";

export default function Home() {
  const router = useRouter();
  const [name, setName] = useState("");
  const [joinCode, setJoinCode] = useState("");
  const [error, setError] = useState("");
  const [loading, setLoading] = useState(false);

  async function handleCreate() {
    if (!name.trim()) {
      setError("Enter your name first");
      return;
    }
    setLoading(true);
    setError("");
    try {
      const res = await fetch("/api/game/create", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ playerName: name.trim() }),
      });
      const data = await res.json();
      if (!res.ok) {
        setError(data.error || "Failed to create game");
        return;
      }
      // Store player ID in localStorage
      localStorage.setItem(`player-${data.gameId}`, data.playerId);
      router.push(`/lobby/${data.gameId}`);
    } catch {
      setError("Network error");
    } finally {
      setLoading(false);
    }
  }

  async function handleJoin() {
    if (!name.trim()) {
      setError("Enter your name first");
      return;
    }
    const code = joinCode.trim().toUpperCase();
    if (!code) {
      setError("Enter a game code");
      return;
    }

    // If we already have a session for this game, go straight to lobby
    const existingId = localStorage.getItem(`player-${code}`);
    if (existingId) {
      // Verify we're still in the game by trying to rejoin
      setLoading(true);
      setError("");
      try {
        const res = await fetch(`/api/game/${code}/action`, {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ action: "join", playerId: existingId, playerName: name.trim() }),
        });
        const data = await res.json();
        if (res.ok && data.rejoined) {
          router.push(`/lobby/${code}`);
          return;
        }
        // If rejoin failed, clear stale session and fall through to normal join
        localStorage.removeItem(`player-${code}`);
      } catch {
        // Fall through to normal join
        localStorage.removeItem(`player-${code}`);
      } finally {
        setLoading(false);
      }
    }

    setLoading(true);
    setError("");
    try {
      const res = await fetch(`/api/game/${code}/action`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ action: "join", playerName: name.trim() }),
      });
      const data = await res.json();
      if (!res.ok) {
        setError(data.error || "Failed to join game");
        return;
      }
      localStorage.setItem(`player-${code}`, data.playerId);
      router.push(`/lobby/${code}`);
    } catch {
      setError("Network error");
    } finally {
      setLoading(false);
    }
  }

  return (
    <main className="flex min-h-screen flex-col items-center justify-center p-8">
      <h1 className="text-4xl font-bold mb-2">No More Tarot</h1>
      <p className="text-stone-400 mb-8">Online Playtest</p>

      <div className="w-full max-w-sm space-y-6">
        {/* Name input */}
        <div>
          <label className="block text-sm text-stone-400 mb-1">Your Name</label>
          <input
            type="text"
            value={name}
            onChange={(e) => setName(e.target.value)}
            maxLength={20}
            placeholder="Enter your name"
            className="w-full px-3 py-2 bg-stone-800 border border-stone-700 rounded text-stone-100 placeholder-stone-500 focus:outline-none focus:border-amber-500"
          />
        </div>

        {/* Create game */}
        <button
          onClick={handleCreate}
          disabled={loading}
          className="w-full py-3 bg-amber-700 hover:bg-amber-600 disabled:opacity-50 rounded font-semibold text-stone-100 transition-colors"
        >
          {loading ? "..." : "Create New Game"}
        </button>

        {/* Divider */}
        <div className="flex items-center gap-3">
          <div className="flex-1 border-t border-stone-700" />
          <span className="text-stone-500 text-sm">or join</span>
          <div className="flex-1 border-t border-stone-700" />
        </div>

        {/* Join game */}
        <div className="flex gap-2">
          <input
            type="text"
            value={joinCode}
            onChange={(e) => setJoinCode(e.target.value.toUpperCase())}
            maxLength={6}
            placeholder="GAME CODE"
            className="flex-1 px-3 py-2 bg-stone-800 border border-stone-700 rounded text-stone-100 placeholder-stone-500 focus:outline-none focus:border-amber-500 tracking-widest text-center font-mono"
          />
          <button
            onClick={handleJoin}
            disabled={loading}
            className="px-6 py-2 bg-stone-700 hover:bg-stone-600 disabled:opacity-50 rounded font-semibold text-stone-100 transition-colors"
          >
            Join
          </button>
        </div>

        {/* Error */}
        {error && (
          <p className="text-red-400 text-sm text-center">{error}</p>
        )}
      </div>
    </main>
  );
}
