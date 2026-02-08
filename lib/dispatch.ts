import { GameState } from "./types";
import { parseCardType } from "./cards";
import { getCurrentPlayer, autoAdvance } from "./engine";
import { handleDrawCard } from "./actions/drawCard";
import { handlePlayHealing } from "./actions/playHealing";
import { handleNoTerritory } from "./actions/noTerritory";
import { handleDiscardToHandLimit } from "./actions/discardToHandLimit";
import { handleDraftKingdom, handleDraftKingdomPick } from "./actions/draftKingdom";
import { handlePlayStag, handleStagKingdomPick } from "./actions/playStag";
import { handlePlayHunt, handleHuntResponse, handleHuntDiscard } from "./actions/playHunt";
import { handlePlayMagi, handleMagiChoice, handleMagiPlaceCards } from "./actions/playMagi";
import { handlePlayTithe, handleTitheDiscard, handleTitheContribute } from "./actions/playTithe";

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

      case "draftKingdomPick":
        error = handleDraftKingdomPick(state, player, body.cardId as string);
        break;

      case "stagKingdomPick":
        error = handleStagKingdomPick(state, player, body.cardId as string);
        break;

      case "huntResponse":
        error = handleHuntResponse(state, player, body.healingId as string | null, body.magiId as string | null);
        break;

      case "huntDiscard":
        error = handleHuntDiscard(state, player, body.cardIds as string[]);
        break;

      case "magiChoice":
        error = handleMagiChoice(state, player, body.drawTop as number, body.drawBottom as number, body.placeBottom as number);
        break;

      case "magiPlaceCards":
        error = handleMagiPlaceCards(state, player, body.cardIds as string[]);
        break;

      case "titheDiscard":
        error = handleTitheDiscard(state, player, body.cardIds as string[]);
        break;

      case "titheContribute":
        error = handleTitheContribute(state, player, body.contribute as boolean);
        break;

      // Future milestones:
      // case "kingCommandResponse":
      // case "kingCommandCollect":

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

    case "draftKingdom":
      error = handleDraftKingdom(state, player, body.cardId as string);
      break;

    case "playStag":
      error = handlePlayStag(state, player, body.cardId as string, body.discardIds as string[]);
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
        case "hunt":
          error = handlePlayHunt(state, player, cardId);
          break;
        case "magi":
          error = handlePlayMagi(state, player, cardId);
          break;
        case "tithe":
          error = handlePlayTithe(state, player, cardId);
          break;
        // Future milestones:
        // case "kingscommand":
        default:
          return { error: `Playing ${cardType} cards is not yet implemented` };
      }
      break;
    }

    case "noTerritory":
      error = handleNoTerritory(state, player);
      break;

    default:
      return { error: `Unknown action '${action}'` };
  }

  if (error) return { error };
  autoAdvance(state);
  return {};
}
