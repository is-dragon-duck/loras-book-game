import { GameState, PlayerState, PendingDiscardToHandLimit } from "../types";
import { cardDisplayName } from "../cards";
import { discardFromHand, log } from "../engine";
import { getHandLimit } from "../view";

/**
 * Discard cards to get down to hand limit at end of turn.
 * For Milestone 1: no Stag atonement. Milestone 2 will add it.
 */
export function handleDiscardToHandLimit(
  state: GameState,
  player: PlayerState,
  cardIds: string[]
): string | null {
  const pending = state.pendingAction as PendingDiscardToHandLimit | null;
  if (!pending || pending.type !== "discardToHandLimit") {
    return "No pending discard to hand limit";
  }
  if (pending.playerSeat !== player.seatIndex) {
    return "Not your turn to discard";
  }

  const handLimit = getHandLimit(player);
  const mustDiscard = player.hand.length - handLimit;

  if (mustDiscard <= 0) {
    // Shouldn't happen, but clear the pending action
    state.pendingAction = null;
    return null;
  }

  if (cardIds.length !== mustDiscard) {
    return `Must discard exactly ${mustDiscard} card(s), got ${cardIds.length}`;
  }

  // Verify all cards are in hand
  for (const cardId of cardIds) {
    if (!player.hand.includes(cardId)) {
      return `Card ${cardId} is not in your hand`;
    }
  }

  // Check for duplicates
  if (new Set(cardIds).size !== cardIds.length) {
    return "Duplicate cards in discard selection";
  }

  // Discard them
  const discardedNames: string[] = [];
  for (const cardId of cardIds) {
    discardFromHand(state, player, cardId);
    discardedNames.push(cardDisplayName(cardId));
  }

  log(state, `${player.name} discarded ${discardedNames.join(", ")} to hand limit.`);

  // Clear pending action so autoAdvance continues
  state.pendingAction = null;
  return null;
}
