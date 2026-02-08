import { GameState, PlayerState, PendingMagiChoice, PendingMagiPlaceCards } from "../types";
import { parseCardType, cardDisplayName } from "../cards";
import { log, drawCard, triggerDeckExhaustion, ensureDeck } from "../engine";

/**
 * Territory Action: Play Magi (step 1)
 * Remove Magi from hand, set up pending magiChoice so player picks their split.
 */
export function handlePlayMagi(
  state: GameState,
  player: PlayerState,
  cardId: string
): string | null {
  if (state.turnPhase !== "territoryAction") {
    return "Not in territory action phase";
  }
  if (parseCardType(cardId) !== "magi") {
    return "Not a Magi card";
  }
  if (!player.hand.includes(cardId)) {
    return "Card not in your hand";
  }

  // Remove from hand — we'll place it in territory after the choice resolves
  const idx = player.hand.indexOf(cardId);
  player.hand.splice(idx, 1);

  log(state, `${player.name} plays ${cardDisplayName(cardId)}.`);

  // Set pending for the split choice
  state.pendingAction = {
    type: "magiChoice",
    playerSeat: player.seatIndex,
    magiCardId: cardId,
  };

  return null;
}

/**
 * Magi step 2: Player chooses their split of 6.
 * drawTop + drawBottom + placeBottom must equal 6.
 * Execute draws immediately, then if placeBottom > 0 set up pending.
 */
export function handleMagiChoice(
  state: GameState,
  player: PlayerState,
  drawTop: number,
  drawBottom: number,
  placeBottom: number
): string | null {
  const pending = state.pendingAction as PendingMagiChoice | null;
  if (!pending || pending.type !== "magiChoice") {
    return "No pending magi choice";
  }
  if (pending.playerSeat !== player.seatIndex) {
    return "Not your turn";
  }

  // Validate split
  if (!Number.isInteger(drawTop) || !Number.isInteger(drawBottom) || !Number.isInteger(placeBottom)) {
    return "Split values must be integers";
  }
  if (drawTop < 0 || drawBottom < 0 || placeBottom < 0) {
    return "Split values must be non-negative";
  }
  if (drawTop + drawBottom + placeBottom !== 6) {
    return "Split must total exactly 6";
  }

  const magiCardId = pending.magiCardId;

  // Draw from top
  if (drawTop > 0) {
    for (let i = 0; i < drawTop; i++) {
      const card = drawCard(state);
      if (card === null) {
        // Place magi in territory before ending
        player.territory.push(magiCardId);
        triggerDeckExhaustion(state);
        return null;
      }
      player.hand.push(card);
    }
    log(state, `${player.name} draws ${drawTop} from the top.`);
  }

  // Draw from bottom
  if (drawBottom > 0) {
    for (let i = 0; i < drawBottom; i++) {
      if (!ensureDeck(state)) {
        player.territory.push(magiCardId);
        triggerDeckExhaustion(state);
        return null;
      }
      // Bottom of deck = index 0
      const card = state.deck.shift()!;
      player.hand.push(card);
    }
    log(state, `${player.name} draws ${drawBottom} from the bottom.`);
  }

  // Place cards from hand to bottom of deck
  if (placeBottom > 0) {
    if (player.hand.length < placeBottom) {
      // Place what they can, then finish
      const count = player.hand.length;
      state.deck.unshift(...player.hand);
      player.hand = [];
      log(state, `${player.name} places ${count} card(s) on the bottom of the deck (all remaining).`);
      // Magi to territory
      player.territory.push(magiCardId);
      state.pendingAction = null;
      state.turnPhase = "endOfTurn";
      return null;
    }

    // Need player to choose which cards
    state.pendingAction = {
      type: "magiPlaceCards",
      playerSeat: player.seatIndex,
      placeBottomCount: placeBottom,
      magiCardId,
    };
    return null;
  }

  // No cards to place — done
  player.territory.push(magiCardId);
  log(state, `Magi enters ${player.name}'s territory (+1 hand size).`);
  state.pendingAction = null;
  state.turnPhase = "endOfTurn";
  return null;
}

/**
 * Magi step 3: Player chooses which cards to place on bottom of deck.
 */
export function handleMagiPlaceCards(
  state: GameState,
  player: PlayerState,
  cardIds: string[]
): string | null {
  const pending = state.pendingAction as PendingMagiPlaceCards | null;
  if (!pending || pending.type !== "magiPlaceCards") {
    return "No pending magi place cards";
  }
  if (pending.playerSeat !== player.seatIndex) {
    return "Not your turn";
  }

  const count = pending.placeBottomCount;
  if (cardIds.length !== count) {
    return `Must select exactly ${count} card(s), got ${cardIds.length}`;
  }
  if (new Set(cardIds).size !== cardIds.length) {
    return "Duplicate cards";
  }
  for (const id of cardIds) {
    if (!player.hand.includes(id)) {
      return `Card ${id} is not in your hand`;
    }
  }

  // Remove from hand and place on bottom of deck (in order given)
  for (const id of cardIds) {
    const idx = player.hand.indexOf(id);
    player.hand.splice(idx, 1);
    state.deck.unshift(id); // unshift = bottom of deck
  }

  log(state, `${player.name} places ${count} card(s) on the bottom of the deck.`);

  // Magi to territory
  const magiCardId = pending.magiCardId;
  player.territory.push(magiCardId);
  log(state, `Magi enters ${player.name}'s territory (+1 hand size).`);

  state.pendingAction = null;
  state.turnPhase = "endOfTurn";
  return null;
}
