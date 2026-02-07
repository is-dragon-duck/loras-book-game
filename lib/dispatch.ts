import { GameState } from "./types";
import { parseCardType } from "./cards";
import { getCurrentPlayer, autoAdvance } from "./engine";
import { handleDrawCard } from "./actions/drawCard";
import { handlePlayHealing } from "./actions/playHealing";
import { handleNoTerritory } from "./actions/noTerritory";
import { handleDiscardToHandLimit } from "./actions/discardToHandLimit";

export interface ActionResult {
  error?: string;
}

/**
 * Main action dispatcher. Validates the player, routes to the correct handler,
 * then auto-advances the state machine.
 */
export function dispatchAction(
  state: GameState,
  playerId: string,
  action: string,
  body: Record<string, unknown>
): ActionResult {
  // Game already over?
  if (state.winner) {
    return { error: "Game is already over" };
  }

  // Find the player
  const player = state.players.find((p) => p.id === playerId);
  if (!player) {
    return { error: "Player not found in game" };
  }
  if (player.eliminated) {
    return { error: "You have been eliminated" };
  }

  let error: string | null = null;

  // --- Pending action responses (can come from non-current players) ---
  if (state.pendingAction) {
    switch (action) {
      case "discardToHandLimit":
        error = handleDiscardToHandLimit(state, player, body.cardIds as string[]);
        break;

      // Future milestones will add more pending action handlers here:
      // case "draftKingdomPick":
      // case "huntResponse":
      // case "magiChoice":
      // case "magiPlaceCards":
      // case "titheContribute":
      // case "kingCommandResponse":
      // case "kingCommandCollect":
      // case "stagKingdomPick":

      default:
        return { error: `Unknown or invalid action '${action}' for pending ${state.pendingAction.type}` };
    }

    if (error) return { error };
    autoAdvance(state);
    return {};
  }

  // --- Turn actions (must be current player) ---
  const currentSeat = state.playerOrder[state.currentPlayerIndex];
  if (player.seatIndex !== currentSeat) {
    return { error: "It's not your turn" };
  }

  switch (action) {
    // Kingdom actions
    case "drawCard":
      error = handleDrawCard(state, player);
      break;

    // Territory actions
    case "playTerritory": {
      const cardId = body.cardId as string;
      if (!cardId) return { error: "Missing cardId" };
      const cardType = parseCardType(cardId);
      switch (cardType) {
        case "healing":
          error = handlePlayHealing(state, player, cardId);
          break;
        // Future milestones:
        // case "hunt":
        // case "magi":
        // case "tithe":
        // case "kingscommand":
        default:
          return { error: `Playing ${cardType} cards is not yet implemented` };
      }
      break;
    }

    case "noTerritory":
      error = handleNoTerritory(state, player);
      break;

    // Future milestones:
    // case "draftKingdom":
    // case "playStag":

    default:
      return { error: `Unknown action '${action}'` };
  }

  if (error) return { error };
  autoAdvance(state);
  return {};
}
