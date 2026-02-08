import { GameState, PlayerState, PendingKingCommandResponse, PendingKingCommandCollect } from "../types";
import { parseCardType, cardDisplayName } from "../cards";
import {
  log,
  getPlayerBySeat,
  getOpponentSeatsInOrder,
  discardFromHand,
  applyAtonement,
} from "../engine";

// ============================================================
// 1. Play King's Command (territory action)
// ============================================================

/**
 * Territory Action: Play King's Command
 * Every opponent must discard a Stag (with atonement) or reveal no Stags.
 * Then the command player may collect any/all/none of those Stags.
 * KC goes to territory (+1 Hunt discard/draw on future Hunts).
 */
export function handlePlayKingsCommand(
  state: GameState,
  player: PlayerState,
  cardId: string
): string | null {
  if (state.turnPhase !== "territoryAction") {
    return "Not in territory action phase";
  }
  if (parseCardType(cardId) !== "kingscommand") {
    return "Not a King's Command card";
  }
  if (!player.hand.includes(cardId)) {
    return "Card not in your hand";
  }

  // Remove from hand, place in territory immediately
  const idx = player.hand.indexOf(cardId);
  player.hand.splice(idx, 1);
  player.territory.push(cardId);

  log(state, `${player.name} plays ${cardDisplayName(cardId)}!`);

  // Set up sequential opponent responses
  const opponentSeats = getOpponentSeatsInOrder(state, player.seatIndex);

  if (opponentSeats.length === 0) {
    // No opponents — just end turn
    state.turnPhase = "endOfTurn";
    return null;
  }

  state.pendingAction = {
    type: "kingCommandResponse",
    commandPlayerSeat: player.seatIndex,
    respondingSeat: opponentSeats[0],
    remainingResponderSeats: opponentSeats.slice(1),
    discardedStags: [],
  };

  return null;
}

// ============================================================
// 2. Opponent responds: discard a Stag or reveal no Stags
// ============================================================

export function handleKingCommandResponse(
  state: GameState,
  player: PlayerState,
  stagId: string | null
): string | null {
  const pending = state.pendingAction as PendingKingCommandResponse | null;
  if (!pending || pending.type !== "kingCommandResponse") {
    return "No pending king command response";
  }
  if (pending.respondingSeat !== player.seatIndex) {
    return "Not your turn to respond";
  }

  const stags = player.hand.filter((c) => parseCardType(c) === "stag");

  if (stagId === null) {
    // Player claims no Stags — verify
    if (stags.length > 0) {
      return "You have Stags in your hand and must discard one";
    }
    log(state, `${player.name} reveals no Stags.`);
  } else {
    // Player discards a Stag
    if (parseCardType(stagId) !== "stag") {
      return "Not a Stag card";
    }
    if (!player.hand.includes(stagId)) {
      return "Card not in your hand";
    }

    log(state, `${player.name} discards ${cardDisplayName(stagId)} to King's Command.`);

    // Remove from hand, put in discard (it'll be pulled out if command player takes it)
    discardFromHand(state, player, stagId);

    // Apply atonement
    applyAtonement(state, player, stagId);

    // Track the stag for collection (even if player was eliminated by atonement)
    pending.discardedStags.push(stagId);
  }

  // Advance to next responder or collection phase
  if (pending.remainingResponderSeats.length > 0) {
    // Skip eliminated players
    const nextSeats = [...pending.remainingResponderSeats];
    let nextSeat = nextSeats.shift()!;
    let nextPlayer = getPlayerBySeat(state, nextSeat);

    while (nextPlayer.eliminated && nextSeats.length > 0) {
      nextSeat = nextSeats.shift()!;
      nextPlayer = getPlayerBySeat(state, nextSeat);
    }

    if (nextPlayer.eliminated) {
      // All remaining responders eliminated — go to collection
      goToCollection(state, pending);
    } else {
      state.pendingAction = {
        ...pending,
        respondingSeat: nextSeat,
        remainingResponderSeats: nextSeats,
      };
    }
  } else {
    goToCollection(state, pending);
  }

  return null;
}

// ============================================================
// 3. Command player collects Stags
// ============================================================

export function handleKingCommandCollect(
  state: GameState,
  player: PlayerState,
  stagIds: string[]
): string | null {
  const pending = state.pendingAction as PendingKingCommandCollect | null;
  if (!pending || pending.type !== "kingCommandCollect") {
    return "No pending king command collect";
  }
  if (pending.commandPlayerSeat !== player.seatIndex) {
    return "Not your turn to collect";
  }

  // Validate all selected stags are in the discarded list
  for (const id of stagIds) {
    if (!pending.discardedStags.includes(id)) {
      return `Stag ${id} is not available to collect`;
    }
  }

  if (stagIds.length > 0) {
    // Remove taken stags from the discard pile and add to player's hand
    for (const id of stagIds) {
      const discIdx = state.discard.indexOf(id);
      if (discIdx !== -1) {
        state.discard.splice(discIdx, 1);
      }
      player.hand.push(id);
    }
    const names = stagIds.map(cardDisplayName).join(", ");
    log(state, `${player.name} takes ${names} from King's Command.`);
  } else {
    log(state, `${player.name} takes no Stags from King's Command.`);
  }

  state.pendingAction = null;
  state.turnPhase = "endOfTurn";
  return null;
}

// ============================================================
// Internal helpers
// ============================================================

function goToCollection(state: GameState, pending: PendingKingCommandResponse) {
  const commandPlayer = getPlayerBySeat(state, pending.commandPlayerSeat);

  if (pending.discardedStags.length === 0 || commandPlayer.eliminated) {
    // Nothing to collect or command player eliminated — just end turn
    state.pendingAction = null;
    state.turnPhase = "endOfTurn";
    return;
  }

  state.pendingAction = {
    type: "kingCommandCollect",
    commandPlayerSeat: pending.commandPlayerSeat,
    discardedStags: pending.discardedStags,
  };
}
