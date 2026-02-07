import { NextRequest, NextResponse } from "next/server";
import { getServiceClient } from "@/lib/supabase";
import { GameRow, GameState, PlayerState } from "@/lib/types";
import { createDeck } from "@/lib/cards";
import { buildPlayerView } from "@/lib/view";

export async function POST(
  request: NextRequest,
  { params }: { params: Promise<{ gameId: string }> }
) {
  const { gameId } = await params;
  const body = await request.json();
  const { action, playerId } = body;

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

  // ---- Lobby Actions ----

  if (action === "join") {
    if (game.phase !== "lobby") {
      return NextResponse.json({ error: "Game already started" }, { status: 400 });
    }
    const players: Partial<PlayerState>[] = game.state.players || [];
    if (players.length >= 6) {
      return NextResponse.json({ error: "Game is full (6 players max)" }, { status: 400 });
    }
    const { playerName } = body;
    if (!playerName || typeof playerName !== "string" || playerName.trim().length === 0) {
      return NextResponse.json({ error: "Name required" }, { status: 400 });
    }
    // Generate a player ID
    const newPlayerId = crypto.randomUUID();
    players.push({
      id: newPlayerId,
      name: playerName.trim().substring(0, 20),
      seatIndex: players.length,
    });

    await supabase
      .from("games")
      .update({ state: { ...game.state, players } })
      .eq("id", gameId);

    return NextResponse.json({ playerId: newPlayerId, gameId });
  }

  if (action === "start") {
    if (game.phase !== "lobby") {
      return NextResponse.json({ error: "Game already started" }, { status: 400 });
    }
    const players: Partial<PlayerState>[] = game.state.players || [];
    if (players.length < 2) {
      return NextResponse.json({ error: "Need at least 2 players" }, { status: 400 });
    }

    // Verify the requester is the host (first player)
    if (!playerId || players[0]?.id !== playerId) {
      return NextResponse.json({ error: "Only the host can start" }, { status: 403 });
    }

    // Initialize game state
    const initialState = initializeGame(players);

    await supabase
      .from("games")
      .update({ state: initialState, phase: "playing" })
      .eq("id", gameId);

    return NextResponse.json({ started: true });
  }

  // ---- Game Actions ----

  if (game.phase !== "playing") {
    return NextResponse.json({ error: "Game is not in progress" }, { status: 400 });
  }

  if (!playerId) {
    return NextResponse.json({ error: "Missing playerId" }, { status: 400 });
  }

  // TODO: Phase 3 will add the game engine here
  // For now, return an error for any game action
  return NextResponse.json(
    { error: `Action '${action}' not yet implemented` },
    { status: 501 }
  );
}

// ---- Game Initialization ----

function initializeGame(lobbyPlayers: Partial<PlayerState>[]): GameState {
  const deck = createDeck();

  // Set up full player state
  const players: PlayerState[] = lobbyPlayers.map((lp, i) => {
    const ante = i + 1; // first player antes 1, second antes 2, etc.
    const cardsToDrawCount = 2 + ante; // deal 2+ante cards

    // Draw starting hand from deck
    const hand: string[] = [];
    for (let c = 0; c < cardsToDrawCount; c++) {
      if (deck.length > 0) hand.push(deck.pop()!);
    }

    return {
      id: lp.id!,
      name: lp.name!,
      seatIndex: i,
      hand,
      territory: [],
      territoryMagiAsHealing: [],
      contributionsRemaining: 12,
      contributionsMade: ante,  // ante counts as contribution made
      ante,
      eliminated: false,
    };
  });

  // Burn 1 card
  const burned: string[] = [];
  if (deck.length > 0) burned.push(deck.pop()!);

  // Deal 3 cards to the Kingdom
  const kingdom: string[] = [];
  for (let i = 0; i < 3; i++) {
    if (deck.length > 0) kingdom.push(deck.pop()!);
  }

  const playerOrder = players.map((_, i) => i);

  const log = [{ msg: "Game started!", ts: Date.now() }];
  for (const p of players) {
    log.push({
      msg: `${p.name} antes ${p.ante} and receives ${p.hand.length} cards.`,
      ts: Date.now(),
    });
  }

  return {
    players,
    playerOrder,
    currentPlayerIndex: 0,
    turnPhase: "kingdomAction", // Kingdom starts with 3 cards, so refresh is skipped on turn 1
    deck,
    burned,
    kingdom,
    discard: [],
    pendingAction: null,
    log,
    winner: null,
    winReason: null,
  };
}
