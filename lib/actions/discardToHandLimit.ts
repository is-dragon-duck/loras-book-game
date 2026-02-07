import { GameState, PlayerState, PendingDiscardToHandLimit } from "../types";
import { cardDisplayName } from "../cards";
import { discardFromHandWithAtonement, log } from "../engine";
import { getHandLimit } from "../view";

/**
 * Discard cards to get down to hand limit at end of turn.
 * Stags discarded this way trigger atonement (which can cause elimination).
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
    state.pendingAction = null;
    return null;
  }

  if (cardIds.length !== mustDiscard) {
    return `Must discard exactly ${mustDiscard} card(s), got ${cardIds.length}`;
  }

  // Verify all cards are in hand and no duplicates
  if (new Set(cardIds).size !== cardIds.length) {
    return "Duplicate cards in discard selection";
  }
  for (const cardId of cardIds) {
    if (!player.hand.includes(cardId)) {
      return `Card ${cardId} is not in your hand`;
    }
  }

  // Discard them with atonement for Stags
  const discardedNames: string[] = [];
  for (const cardId of cardIds) {
    discardedNames.push(cardDisplayName(cardId));
    discardFromHandWithAtonement(state, player, cardId);
    // Player may have been eliminated by atonement
    if (player.eliminated) break;
  }

  log(state, `${player.name} discarded ${discardedNames.join(", ")} to hand limit.`);

  state.pendingAction = null;
  return null;
}
