import { GameState, PlayerState } from "./types";
import { parseCardType, shuffle, cardDisplayName, stagAtonementCost } from "./cards";
import { getHandLimit, getTerritoryHealingValue, getStagPoints } from "./view";

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

// ---- Stag Atonement ----

/**
 * When a Stag is discarded from hand for any reason, the player must atone
 * (contribute) based on the Stag's value, UNLESS their territory Healing
 * value is >= the Stag's value.
 *
 * Returns an error string if the player cannot pay (and was eliminated),
 * or null on success.
 */
export function applyAtonement(state: GameState, player: PlayerState, stagCardId: string): void {
  const stagValue = parseInt(stagCardId.split("-")[1], 10);
  const healingValue = getTerritoryHealingValue(player);

  if (healingValue >= stagValue) {
    log(state, `${player.name} discards ${cardDisplayName(stagCardId)} — Healing (${healingValue}) covers atonement.`);
    return;
  }

  const cost = stagAtonementCost(stagValue);

  if (player.contributionsRemaining >= cost) {
    player.contributionsRemaining -= cost;
    player.contributionsMade += cost;
    log(state, `${player.name} atones ${cost} for discarding ${cardDisplayName(stagCardId)}.`);
  } else {
    // Can't pay — eliminated
    log(state, `${player.name} cannot atone for ${cardDisplayName(stagCardId)} and is eliminated!`);
    eliminatePlayer(state, player);
  }
}

// ---- Elimination ----

export function eliminatePlayer(state: GameState, player: PlayerState) {
  player.eliminated = true;

  // Remove from player order
  state.playerOrder = state.playerOrder.filter((s) => s !== player.seatIndex);

  // Discard their hand
  state.discard.push(...player.hand);
  player.hand = [];

  // Check last-standing win condition
  checkLastStanding(state);
}

// ---- Win Conditions ----

/**
 * Check if a player has reached 18 stag points. Call after placing a Stag in territory.
 */
export function checkStagWin(state: GameState, player: PlayerState) {
  if (state.winner) return;
  const points = getStagPoints(player);
  if (points >= 18) {
    state.winner = player.id;
    state.winReason = "stag18";
    log(state, `${player.name} has ${points} Stag Points and wins the game!`);
  }
}

/**
 * Check if only one player remains (all others eliminated).
 */
export function checkLastStanding(state: GameState) {
  if (state.winner) return;
  const alive = state.players.filter((p) => !p.eliminated);
  if (alive.length === 1) {
    state.winner = alive[0].id;
    state.winReason = "lastStanding";
    log(state, `${alive[0].name} is the last player standing and wins the game!`);
  }
}

/**
 * Discard a card from a player's hand with atonement if it's a Stag.
 */
export function discardFromHandWithAtonement(state: GameState, player: PlayerState, cardId: string) {
  discardFromHand(state, player, cardId);
  if (parseCardType(cardId) === "stag") {
    applyAtonement(state, player, cardId);
  }
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

  // Safety: if playerOrder is empty, everyone's eliminated (shouldn't happen, but guard)
  if (state.playerOrder.length === 0) return;

  // Fix currentPlayerIndex if it's out of bounds (player was removed from order)
  if (state.currentPlayerIndex >= state.playerOrder.length) {
    state.currentPlayerIndex = state.currentPlayerIndex % state.playerOrder.length;
  }

  const player = getCurrentPlayer(state);

  // If the current player was eliminated mid-turn, advance to next
  if (player.eliminated) {
    advanceTurn(state);
    autoAdvance(state);
    return;
  }

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
