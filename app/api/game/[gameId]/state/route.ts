import { NextRequest, NextResponse } from "next/server";
import { getServiceClient } from "@/lib/supabase";
import { buildPlayerView } from "@/lib/view";
import { GameRow } from "@/lib/types";

export async function GET(
  request: NextRequest,
  { params }: { params: Promise<{ gameId: string }> }
) {
  const { gameId } = await params;
  const playerId = request.nextUrl.searchParams.get("playerId");

  if (!playerId) {
    return NextResponse.json({ error: "Missing playerId" }, { status: 400 });
  }

  const supabase = getServiceClient();
  const { data, error } = await supabase
    .from("games")
    .select("*")
    .eq("id", gameId)
    .single();

  if (error || !data) {
    return NextResponse.json({ error: "Game not found" }, { status: 404 });
  }

  const game = data as GameRow;

  // In lobby phase, return basic lobby info
  if (game.phase === "lobby") {
    const players = (game.state.players || []).map(
      (p: { name: string; id: string }) => ({
        name: p.name,
        isMe: p.id === playerId,
      })
    );
    return NextResponse.json({
      gameId,
      phase: "lobby",
      players,
      myPlayerId: playerId,
    });
  }

  // In playing/finished phase, return filtered view
  try {
    const view = buildPlayerView(gameId, game.phase, game.state, playerId);
    return NextResponse.json(view);
  } catch (e) {
    const msg = e instanceof Error ? e.message : "Unknown error";
    return NextResponse.json({ error: msg }, { status: 400 });
  }
}
