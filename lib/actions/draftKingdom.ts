import { GameState, PlayerState } from "../types";
import { cardDisplayName } from "../cards";
import { log, getOpponentSeatsInOrder, discardKingdom } from "../engine";

/**
 * Kingdom Action B: Draft the Kingdom
 * 1. Active player takes 1 card from the Kingdom
 * 2. In clockwise order, each other player takes 1 card
 * 3. Discard remaining Kingdom cards
 *
 * The active player picks first (this handler), then we set up a pending
 * action for opponents to pick sequentially.
 */
export function handleDraftKingdom(
  state: GameState,
  player: PlayerState,
  cardId: string
): string | null {
  if (state.turnPhase !== "kingdomAction") {
    return "Not in kingdom action phase";
  }
  if (state.kingdom.length === 0) {
    return "Kingdom is empty";
  }

  const idx = state.kingdom.indexOf(cardId);
  if (idx === -1) {
    return "Card is not in the Kingdom";
  }

  // Active player takes their pick
  state.kingdom.splice(idx, 1);
  player.hand.push(cardId);
  log(state, `${player.name} drafts ${cardDisplayName(cardId)} from the Kingdom.`);

  // Set up sequential draft for opponents
  const opponentSeats = getOpponentSeatsInOrder(state, player.seatIndex);

  if (opponentSeats.length > 0 && state.kingdom.length > 0) {
    state.pendingAction = {
      type: "draftKingdom",
      currentDrafterSeat: opponentSeats[0],
      remainingDrafterSeats: opponentSeats.slice(1),
    };
  } else {
    // No opponents or no cards left — discard remainder, move on
    discardKingdom(state);
    state.turnPhase = "territoryAction";
  }

  return null;
}

/**
 * Handle a pending draftKingdom pick by a non-active player.
 */
export function handleDraftKingdomPick(
  state: GameState,
  player: PlayerState,
  cardId: string
): string | null {
  const pending = state.pendingAction;
  if (!pending || pending.type !== "draftKingdom") {
    return "No pending draft";
  }
  if (pending.currentDrafterSeat !== player.seatIndex) {
    return "Not your turn to draft";
  }

  const idx = state.kingdom.indexOf(cardId);
  if (idx === -1) {
    return "Card is not in the Kingdom";
  }

  state.kingdom.splice(idx, 1);
  player.hand.push(cardId);
  log(state, `${player.name} drafts ${cardDisplayName(cardId)} from the Kingdom.`);

  // Advance to next drafter or finish
  if (pending.remainingDrafterSeats.length > 0 && state.kingdom.length > 0) {
    state.pendingAction = {
      type: "draftKingdom",
      currentDrafterSeat: pending.remainingDrafterSeats[0],
      remainingDrafterSeats: pending.remainingDrafterSeats.slice(1),
    };
  } else {
    // All done — discard remaining, move to territory action
    discardKingdom(state);
    state.pendingAction = null;
    state.turnPhase = "territoryAction";
  }

  return null;
}
