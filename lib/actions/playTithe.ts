import { GameState, PlayerState, PendingTitheDiscard, PendingTitheContribute } from "../types";
import { parseCardType, cardDisplayName } from "../cards";
import {
  log,
  drawCard,
  triggerDeckExhaustion,
  getPlayerBySeat,
  getOpponentSeatsInOrder,
  discardFromHandWithAtonement,
} from "../engine";

/**
 * Territory Action: Play Tithe
 * 1. Tithe player discards 2, draws 2
 * 2. Each opponent discards 2, draws 2 (sequentially)
 * 3. Tithe player may contribute 1 to cycle again (up to 2x, just themselves)
 * 4. If contributed ≥1, Tithe goes to territory (+3 for deck-out). Otherwise discarded.
 */
export function handlePlayTithe(
  state: GameState,
  player: PlayerState,
  cardId: string
): string | null {
  if (state.turnPhase !== "territoryAction") {
    return "Not in territory action phase";
  }
  if (parseCardType(cardId) !== "tithe") {
    return "Not a Tithe card";
  }
  if (!player.hand.includes(cardId)) {
    return "Card not in your hand";
  }

  // Remove tithe from hand (held until we know if it goes to territory or discard)
  const idx = player.hand.indexOf(cardId);
  player.hand.splice(idx, 1);

  log(state, `${player.name} plays ${cardDisplayName(cardId)}.`);

  // If player has cards to discard, start the discard flow with them
  const opponentSeats = getOpponentSeatsInOrder(state, player.seatIndex);

  if (player.hand.length > 0) {
    state.pendingAction = {
      type: "titheDiscard",
      tithePlayerSeat: player.seatIndex,
      titheCardId: cardId,
      currentDiscardSeat: player.seatIndex,
      remainingDiscardSeats: opponentSeats,
      contributionsSoFar: 0,
    };
  } else {
    // Player has no cards to discard — draw 2, then opponents
    drawForPlayer(state, player, 2);
    if (state.winner) return null; // deck exhaustion

    if (opponentSeats.length > 0) {
      state.pendingAction = {
        type: "titheDiscard",
        tithePlayerSeat: player.seatIndex,
        titheCardId: cardId,
        currentDiscardSeat: opponentSeats[0],
        remainingDiscardSeats: opponentSeats.slice(1),
        contributionsSoFar: 0,
      };
    } else {
      // No opponents — go to contribute phase
      state.pendingAction = {
        type: "titheContribute",
        playerSeat: player.seatIndex,
        titheCardId: cardId,
        contributionsSoFar: 0,
      };
    }
  }

  return null;
}

/**
 * Handle a titheDiscard: player selects cards to discard, then draws 2.
 */
export function handleTitheDiscard(
  state: GameState,
  player: PlayerState,
  cardIds: string[]
): string | null {
  const pending = state.pendingAction as PendingTitheDiscard | null;
  if (!pending || pending.type !== "titheDiscard") {
    return "No pending tithe discard";
  }
  if (pending.currentDiscardSeat !== player.seatIndex) {
    return "Not your turn to discard";
  }

  const mustDiscard = Math.min(2, player.hand.length);

  if (cardIds.length !== mustDiscard) {
    return `Must discard exactly ${mustDiscard} card(s), got ${cardIds.length}`;
  }
  if (new Set(cardIds).size !== cardIds.length) {
    return "Duplicate cards";
  }
  for (const id of cardIds) {
    if (!player.hand.includes(id)) {
      return `Card ${id} is not in your hand`;
    }
  }

  // Discard with atonement for Stags
  for (const id of cardIds) {
    discardFromHandWithAtonement(state, player, id);
    if (player.eliminated) break;
  }

  if (!player.eliminated) {
    log(state, `${player.name} discards ${mustDiscard} for Tithe.`);
    // Draw 2
    drawForPlayer(state, player, 2);
    if (state.winner) return null;
  }

  // Advance to next discarder or contribute phase
  if (pending.remainingDiscardSeats.length > 0) {
    const nextSeat = pending.remainingDiscardSeats[0];
    const nextPlayer = getPlayerBySeat(state, nextSeat);

    // Skip eliminated players
    if (nextPlayer.eliminated) {
      state.pendingAction = {
        ...pending,
        currentDiscardSeat: nextSeat,
        remainingDiscardSeats: pending.remainingDiscardSeats.slice(1),
      };
      // Recurse through auto-advance — but we need to skip. Let's just advance.
      return handleTitheSkipEliminated(state, pending);
    }

    if (nextPlayer.hand.length === 0) {
      // No cards to discard — just draw 2 and move on
      drawForPlayer(state, nextPlayer, 2);
      if (state.winner) return null;
      // Continue to next
      state.pendingAction = {
        ...pending,
        remainingDiscardSeats: pending.remainingDiscardSeats.slice(1),
      };
      return handleTitheAdvance(state);
    }

    state.pendingAction = {
      ...pending,
      currentDiscardSeat: nextSeat,
      remainingDiscardSeats: pending.remainingDiscardSeats.slice(1),
    };
  } else {
    // All done — move to contribute phase for the tithe player
    const tithePlayer = getPlayerBySeat(state, pending.tithePlayerSeat);
    if (tithePlayer.eliminated) {
      finishTithe(state, pending, false);
    } else {
      state.pendingAction = {
        type: "titheContribute",
        playerSeat: pending.tithePlayerSeat,
        titheCardId: pending.titheCardId,
        contributionsSoFar: pending.contributionsSoFar,
      };
    }
  }

  return null;
}

/**
 * Handle titheContribute: player decides whether to contribute 1 to cycle again.
 */
export function handleTitheContribute(
  state: GameState,
  player: PlayerState,
  contribute: boolean
): string | null {
  const pending = state.pendingAction as PendingTitheContribute | null;
  if (!pending || pending.type !== "titheContribute") {
    return "No pending tithe contribute";
  }
  if (pending.playerSeat !== player.seatIndex) {
    return "Not your turn";
  }

  if (!contribute || pending.contributionsSoFar >= 2) {
    // Decline or maxed out — finish
    finishTithe(state, pending, pending.contributionsSoFar > 0);
    return null;
  }

  // Check they can afford it
  if (player.contributionsRemaining < 1) {
    return "Not enough contributions remaining";
  }

  // Pay 1 contribution
  player.contributionsRemaining -= 1;
  player.contributionsMade += 1;
  const newContributions = pending.contributionsSoFar + 1;

  log(state, `${player.name} contributes 1 for Tithe cycle (${newContributions}/2).`);

  // Player discards 2 and draws 2 again (just themselves)
  if (player.hand.length > 0) {
    state.pendingAction = {
      type: "titheDiscard",
      tithePlayerSeat: pending.playerSeat,
      titheCardId: pending.titheCardId,
      currentDiscardSeat: pending.playerSeat,
      remainingDiscardSeats: [], // just the player, no opponents
      contributionsSoFar: newContributions,
    };
  } else {
    // No cards to discard — just draw 2
    drawForPlayer(state, player, 2);
    if (state.winner) return null;

    // Back to contribute decision
    if (newContributions < 2) {
      state.pendingAction = {
        type: "titheContribute",
        playerSeat: pending.playerSeat,
        titheCardId: pending.titheCardId,
        contributionsSoFar: newContributions,
      };
    } else {
      finishTithe(state, pending, true);
    }
  }

  return null;
}

// ============================================================
// Internal helpers
// ============================================================

function drawForPlayer(state: GameState, player: PlayerState, count: number) {
  for (let i = 0; i < count; i++) {
    const card = drawCard(state);
    if (card === null) {
      triggerDeckExhaustion(state);
      return;
    }
    player.hand.push(card);
  }
}

function finishTithe(
  state: GameState,
  pending: { titheCardId: string; playerSeat?: number },
  contributed: boolean
) {
  if (contributed) {
    // Tithe goes to territory
    const seat = pending.playerSeat ?? 0;
    const player = getPlayerBySeat(state, seat);
    player.territory.push(pending.titheCardId);
    log(state, `Tithe enters ${player.name}'s territory (+3 contribution for deck-out scoring).`);
  } else {
    // Tithe is discarded
    state.discard.push(pending.titheCardId);
    log(state, `Tithe is discarded (no contributions made).`);
  }

  state.pendingAction = null;
  state.turnPhase = "endOfTurn";
}

/**
 * Skip eliminated players in the tithe discard chain.
 */
function handleTitheSkipEliminated(state: GameState, pending: PendingTitheDiscard): string | null {
  // Keep advancing past eliminated/empty-hand players
  let remaining = pending.remainingDiscardSeats;
  while (remaining.length > 0) {
    const nextSeat = remaining[0];
    remaining = remaining.slice(1);
    const nextPlayer = getPlayerBySeat(state, nextSeat);

    if (nextPlayer.eliminated) continue;

    if (nextPlayer.hand.length === 0) {
      drawForPlayer(state, nextPlayer, 2);
      if (state.winner) return null;
      continue;
    }

    // This player needs to discard
    state.pendingAction = {
      ...pending,
      currentDiscardSeat: nextSeat,
      remainingDiscardSeats: remaining,
    };
    return null;
  }

  // All opponents processed — move to contribute
  const tithePlayer = getPlayerBySeat(state, pending.tithePlayerSeat);
  if (tithePlayer.eliminated) {
    finishTithe(state, pending, false);
  } else {
    state.pendingAction = {
      type: "titheContribute",
      playerSeat: pending.tithePlayerSeat,
      titheCardId: pending.titheCardId,
      contributionsSoFar: pending.contributionsSoFar,
    };
  }
  return null;
}

/**
 * After a titheDiscard resolves, check if we need to advance to next or contribute.
 */
function handleTitheAdvance(state: GameState): string | null {
  const pending = state.pendingAction as PendingTitheDiscard;
  return handleTitheSkipEliminated(state, pending);
}
