import { GameState, PlayerState } from "../types";
import { parseCardType, parseCardValue, stagDiscardCost, cardDisplayName } from "../cards";
import {
  log,
  getOpponentSeatsInOrder,
  discardKingdom,
  discardFromHandWithAtonement,
  playToTerritory,
  checkStagWin,
} from "../engine";
import { getStagPoints } from "../view";

/**
 * Kingdom Action C: Play a Stag
 * 1. Play 1 Stag from hand to territory
 * 2. Discard cards from hand based on Stag value (with atonement for any Stags)
 * 3. Multi-round kingdom draft for other players, then stag player picks last
 */
export function handlePlayStag(
  state: GameState,
  player: PlayerState,
  stagCardId: string,
  discardIds: string[]
): string | null {
  if (state.turnPhase !== "kingdomAction") {
    return "Not in kingdom action phase";
  }

  // Validate card is a Stag in hand
  if (parseCardType(stagCardId) !== "stag") {
    return "Not a Stag card";
  }
  if (!player.hand.includes(stagCardId)) {
    return "Stag is not in your hand";
  }

  const stagValue = parseCardValue(stagCardId);
  const cost = stagDiscardCost(stagValue);

  // Validate discard selection
  if (discardIds.length !== cost) {
    return `Must discard exactly ${cost} card(s) for Stag ${stagValue}, got ${discardIds.length}`;
  }
  if (new Set(discardIds).size !== discardIds.length) {
    return "Duplicate cards in discard selection";
  }
  for (const id of discardIds) {
    if (id === stagCardId) {
      return "Cannot discard the Stag you're playing";
    }
    if (!player.hand.includes(id)) {
      return `Card ${id} is not in your hand`;
    }
  }

  // Verify player has enough cards (stag + cost cards)
  if (player.hand.length - 1 < cost) {
    return "Not enough cards to pay the discard cost";
  }

  // --- Execute ---

  // Place the Stag in territory
  playToTerritory(player, stagCardId);
  const points = getStagPoints(player);
  log(state, `${player.name} plays ${cardDisplayName(stagCardId)} to territory (${points} Stag Points).`);

  // Discard cost cards (with atonement for any Stags among them)
  for (const id of discardIds) {
    discardFromHandWithAtonement(state, player, id);
  }

  // Check win: 18 stag points
  checkStagWin(state, player);
  if (state.winner) return null;

  // Check if player was eliminated from atonement during discards
  if (player.eliminated) return null;

  // --- Set up Kingdom draft for other players ---
  setupStagKingdomDraft(state, player);

  return null;
}

/**
 * After playing a Stag, set up the multi-round kingdom draft.
 * Other players take turns picking from the Kingdom. After each full round,
 * check if there are still enough cards for another round (>= total players).
 * When done, the Stag player picks 1, then discard the rest.
 */
function setupStagKingdomDraft(state: GameState, stagPlayer: PlayerState) {
  const opponentSeats = getOpponentSeatsInOrder(state, stagPlayer.seatIndex);

  if (opponentSeats.length === 0 || state.kingdom.length === 0) {
    // No opponents or no kingdom cards — skip straight to end of turn
    discardKingdom(state);
    state.turnPhase = "endOfTurn";
    return;
  }

  // If there's only 1 card, stag player just picks it
  if (state.kingdom.length === 1) {
    // Actually no — opponents draft first. If 1 card and opponents exist,
    // we can't give opponents a card AND leave one for stag player.
    // So stag player just picks it themselves.
    state.pendingAction = {
      type: "stagKingdomPickSelf",
      stagPlayerSeat: stagPlayer.seatIndex,
    };
    return;
  }

  // Check if we have enough for opponents to take one each and still leave one for stag player
  const totalPlayers = opponentSeats.length + 1;
  if (state.kingdom.length < totalPlayers) {
    // Not enough for a full round + stag player's pick.
    // Stag player just picks 1, discard rest.
    state.pendingAction = {
      type: "stagKingdomPickSelf",
      stagPlayerSeat: stagPlayer.seatIndex,
    };
    return;
  }

  // Start the draft: first opponent picks
  state.pendingAction = {
    type: "stagKingdomDraft",
    stagPlayerSeat: stagPlayer.seatIndex,
    currentDrafterSeat: opponentSeats[0],
    remainingDrafterSeats: opponentSeats.slice(1),
    round: 1,
  };
}

/**
 * Handle a pending stagKingdomDraft pick by an opponent.
 */
export function handleStagKingdomPick(
  state: GameState,
  player: PlayerState,
  cardId: string
): string | null {
  const pending = state.pendingAction;
  if (!pending) return "No pending action";

  // Handle both opponent draft and stag player self-pick
  if (pending.type === "stagKingdomPickSelf") {
    return handleStagSelfPick(state, player, cardId);
  }

  if (pending.type !== "stagKingdomDraft") {
    return "No pending stag kingdom draft";
  }
  if (pending.currentDrafterSeat !== player.seatIndex) {
    return "Not your turn to pick";
  }

  const idx = state.kingdom.indexOf(cardId);
  if (idx === -1) {
    return "Card is not in the Kingdom";
  }

  state.kingdom.splice(idx, 1);
  player.hand.push(cardId);
  log(state, `${player.name} picks ${cardDisplayName(cardId)} from the Kingdom.`);

  const stagPlayerSeat = pending.stagPlayerSeat;

  if (pending.remainingDrafterSeats.length > 0 && state.kingdom.length > 0) {
    // More opponents to pick in this round
    state.pendingAction = {
      type: "stagKingdomDraft",
      stagPlayerSeat,
      currentDrafterSeat: pending.remainingDrafterSeats[0],
      remainingDrafterSeats: pending.remainingDrafterSeats.slice(1),
      round: pending.round,
    };
  } else {
    // Round complete. Check if another round is possible.
    finishRoundOrDraft(state, stagPlayerSeat);
  }

  return null;
}

/**
 * After a round of opponent picks, check if another round should happen.
 */
function finishRoundOrDraft(state: GameState, stagPlayerSeat: number) {
  const opponentSeats = getOpponentSeatsInOrder(state, stagPlayerSeat);
  const totalPlayers = opponentSeats.length + 1;

  // Need at least totalPlayers cards for another round (opponents + 1 left for stag player)
  if (state.kingdom.length >= totalPlayers && opponentSeats.length > 0) {
    // Another round
    const pending = state.pendingAction as { round: number };
    state.pendingAction = {
      type: "stagKingdomDraft" as const,
      stagPlayerSeat,
      currentDrafterSeat: opponentSeats[0],
      remainingDrafterSeats: opponentSeats.slice(1),
      round: (pending?.round || 0) + 1,
    };
  } else if (state.kingdom.length > 0) {
    // Stag player picks last
    state.pendingAction = {
      type: "stagKingdomPickSelf",
      stagPlayerSeat,
    };
  } else {
    // Kingdom empty — done
    state.pendingAction = null;
    state.turnPhase = "endOfTurn";
  }
}

/**
 * The stag player picks their 1 card from whatever's left, then discard the rest.
 */
function handleStagSelfPick(
  state: GameState,
  player: PlayerState,
  cardId: string
): string | null {
  const pending = state.pendingAction;
  if (!pending || pending.type !== "stagKingdomPickSelf") {
    return "No pending stag self pick";
  }
  if (pending.stagPlayerSeat !== player.seatIndex) {
    return "Not your turn to pick";
  }

  const idx = state.kingdom.indexOf(cardId);
  if (idx === -1) {
    return "Card is not in the Kingdom";
  }

  state.kingdom.splice(idx, 1);
  player.hand.push(cardId);
  log(state, `${player.name} picks ${cardDisplayName(cardId)} from the Kingdom.`);

  // Discard remaining kingdom cards
  discardKingdom(state);

  state.pendingAction = null;
  state.turnPhase = "endOfTurn";
  return null;
}
