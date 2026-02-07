import { NextRequest, NextResponse } from "next/server";
import { getServiceClient } from "@/lib/supabase";

function generateGameCode(): string {
  const chars = "ABCDEFGHJKLMNPQRSTUVWXYZ23456789"; // no ambiguous chars (0/O, 1/I)
  let code = "";
  for (let i = 0; i < 6; i++) {
    code += chars[Math.floor(Math.random() * chars.length)];
  }
  return code;
}

export async function POST(request: NextRequest) {
  const body = await request.json();
  const { playerName } = body;

  if (!playerName || typeof playerName !== "string" || playerName.trim().length === 0) {
    return NextResponse.json({ error: "Name required" }, { status: 400 });
  }

  const supabase = getServiceClient();
  const hostId = crypto.randomUUID();
  const name = playerName.trim().substring(0, 20);

  // Try a few codes in case of collision
  for (let attempt = 0; attempt < 5; attempt++) {
    const gameId = generateGameCode();

    const { error } = await supabase.from("games").insert({
      id: gameId,
      phase: "lobby",
      state: {
        players: [
          {
            id: hostId,
            name,
            seatIndex: 0,
          },
        ],
      },
    });

    if (!error) {
      return NextResponse.json({ gameId, playerId: hostId });
    }

    // If it's a unique constraint violation, try another code
    if (error.code === "23505") continue;

    // Otherwise it's a real error
    return NextResponse.json({ error: error.message }, { status: 500 });
  }

  return NextResponse.json({ error: "Could not generate unique game code" }, { status: 500 });
}
