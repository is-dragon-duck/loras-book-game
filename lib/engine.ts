import { GameState, PlayerState } from "./types";
import { parseCardType, shuffle } from "./cards";
import { getHandLimit } from "./view";

// ---- Logging ----

export function log(state: GameState, msg: string) {
  state.log.push({ msg, ts: Date.now() });
}

// ---- Deck Helpers ----

/**
 * Reshuffle discard pile into the deck if the deck is empty.
 * Returns true if the deck now has cards, false if both are empty (game should end).
 */
export function ensureDeck(state: GameState): boolean {
  if (state.deck.length > 0) return true;
  if (state.discard.length === 0) return false;
  state.deck = shuffle([...state.discard]);
  state.discard = [];
  log(state, "Discard pile shuffled into deck.");
  return true;
}

/**
 * Draw 1 card from the top of the deck.
 * Returns the card drawn, or null if deck is empty (game should end).
 */
export function drawCard(state: GameState): string | null {
  if (!ensureDeck(state)) return null;
  return state.deck.pop()!;
}

/**
 * Burn 1 card from the deck (face-down, out of game forever).
 * Returns false if deck is empty (game should end).
 */
export function burnCard(state: GameState): boolean {
  if (!ensureDeck(state)) return false;
  state.burned.push(state.deck.pop()!);
  return true;
}

/**
 * Deal 1 card from the deck face-up to the Kingdom.
 * Returns false if deck is empty (game should end).
 */
export function dealToKingdom(state: GameState): boolean {
  if (!ensureDeck(state)) return false;
  state.kingdom.push(state.deck.pop()!);
  return true;
}

/**
 * Discard all remaining Kingdom cards (no costs paid).
 */
export function discardKingdom(state: GameState) {
  if (state.kingdom.length > 0) {
    state.discard.push(...state.kingdom);
    state.kingdom = [];
  }
}

/**
 * Remove a card from a player's hand and put it in the discard pile.
 */
export function discardFromHand(state: GameState, player: PlayerState, cardId: string): boolean {
  const idx = player.hand.indexOf(cardId);
  if (idx === -1) return false;
  player.hand.splice(idx, 1);
  state.discard.push(cardId);
  return true;
}

/**
 * Move a card from a player's hand into their territory.
 */
export function playToTerritory(player: PlayerState, cardId: string): boolean {
  const idx = player.hand.indexOf(cardId);
  if (idx === -1) return false;
  player.hand.splice(idx, 1);
  player.territory.push(cardId);
  return true;
}

// ---- Player Lookup ----

export function getPlayerBySeat(state: GameState, seat: number): PlayerState {
  const p = state.players.find((p) => p.seatIndex === seat);
  if (!p) throw new Error(`No player at seat ${seat}`);
  return p;
}

export function getCurrentPlayer(state: GameState): PlayerState {
  const seat = state.playerOrder[state.currentPlayerIndex];
  return getPlayerBySeat(state, seat);
}

/**
 * Get non-eliminated opponent seat indices in clockwise order starting after the given seat.
 */
export function getOpponentSeatsInOrder(state: GameState, mySeat: number): number[] {
  const seats: number[] = [];
  const order = state.playerOrder;
  const myIdx = order.indexOf(mySeat);
  if (myIdx === -1) return seats;
  for (let i = 1; i < order.length; i++) {
    const seat = order[(myIdx + i) % order.length];
    const player = getPlayerBySeat(state, seat);
    if (!player.eliminated) seats.push(seat);
  }
  return seats;
}

// ---- Deck Exhaustion (Game End) ----

export function triggerDeckExhaustion(state: GameState) {
  log(state, "The deck has run out! Scoring final results...");

  const scores: { player: PlayerState; score: number; tiebreak: number[] }[] = [];

  for (const p of state.players) {
    if (p.eliminated) continue;

    let stagPoints = 0;
    let tithesInTerritory = 0;
    let magiCount = 0;
    let healingCount = 0;
    let huntCount = 0;
    let kcCount = 0;

    for (const cardId of p.territory) {
      const type = parseCardType(cardId);
      if (type === "stag") stagPoints += parseInt(cardId.split("-")[1], 10);
      else if (type === "tithe") tithesInTerritory++;
      else if (type === "magi") magiCount++;
      else if (type === "healing") healingCount++;
      else if (type === "hunt") huntCount++;
      else if (type === "kingscommand") kcCount++;
    }

    const score = stagPoints + (3 * tithesInTerritory) + p.contributionsMade;
    scores.push({ player: p, score, tiebreak: [magiCount, healingCount, huntCount, kcCount] });
    log(state, `${p.name}: ${stagPoints} Stag + ${3 * tithesInTerritory} Tithe(${tithesInTerritory}×3) + ${p.contributionsMade} contributions = ${score}`);
  }

  scores.sort((a, b) => {
    if (a.score !== b.score) return b.score - a.score;
    for (let i = 0; i < 4; i++) {
      if (a.tiebreak[i] !== b.tiebreak[i]) return b.tiebreak[i] - a.tiebreak[i];
    }
    return 0;
  });

  if (scores.length > 0) {
    state.winner = scores[0].player.id;
    state.winReason = "deckOut";
    log(state, `${scores[0].player.name} wins!`);
  }
}

// ---- Kingdom Refresh ----

/**
 * Returns false if the game should end due to deck exhaustion.
 */
export function refreshKingdom(state: GameState): boolean {
  if (state.kingdom.length >= 3) return true;
  discardKingdom(state);
  if (!burnCard(state)) { triggerDeckExhaustion(state); return false; }
  for (let i = 0; i < 3; i++) {
    if (!dealToKingdom(state)) { triggerDeckExhaustion(state); return false; }
  }
  return true;
}

// ---- Turn Advancement ----

export function advanceTurn(state: GameState) {
  state.currentPlayerIndex = (state.currentPlayerIndex + 1) % state.playerOrder.length;
  state.turnPhase = "refreshKingdom";
  state.pendingAction = null;
  const next = getCurrentPlayer(state);
  log(state, `--- ${next.name}'s turn ---`);
}

// ---- Auto-Advance ----

/**
 * After any action resolves, auto-advance through phases that need no player input.
 */
export function autoAdvance(state: GameState): void {
  if (state.winner) return;
  if (state.pendingAction) return;

  const player = getCurrentPlayer(state);

  switch (state.turnPhase) {
    case "refreshKingdom": {
      if (!refreshKingdom(state)) return; // game ended
      state.turnPhase = "kingdomAction";
      return; // needs player input
    }

    case "kingdomAction":
      return; // needs player input

    case "territoryAction":
      return; // needs player input

    case "endOfTurn": {
      const handLimit = getHandLimit(player);
      if (player.hand.length > handLimit) {
        state.pendingAction = {
          type: "discardToHandLimit",
          playerSeat: player.seatIndex,
          mustDiscard: player.hand.length - handLimit,
        };
        return;
      }
      advanceTurn(state);
      autoAdvance(state); // handle the next turn's refresh
      return;
    }
  }
}
