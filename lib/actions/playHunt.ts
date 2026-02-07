import { GameState, PlayerState, PendingHuntResponse, PendingHuntDiscard } from "../types";
import { parseCardType, parseCardValue, cardDisplayName } from "../cards";
import {
  log,
  burnCard,
  drawCard,
  triggerDeckExhaustion,
  getPlayerBySeat,
  getOpponentSeatsInOrder,
  playToTerritory,
  discardFromHandWithAtonement,
} from "../engine";
import { countTerritoryType, getTerritoryHealingValue } from "../view";

// ============================================================
// 1. Play Hunt (territory action)
// ============================================================

/**
 * Territory Action: Play a Hunt card.
 * 1. Burn a card
 * 2. Set up sequential opponent responses
 */
export function handlePlayHunt(
  state: GameState,
  player: PlayerState,
  cardId: string
): string | null {
  if (state.turnPhase !== "territoryAction") {
    return "Not in territory action phase";
  }
  if (parseCardType(cardId) !== "hunt") {
    return "Not a Hunt card";
  }
  if (!player.hand.includes(cardId)) {
    return "Card not in your hand";
  }

  // 1. Burn a card
  if (!burnCard(state)) {
    triggerDeckExhaustion(state);
    return null;
  }

  // Calculate hunt total value: card value + hunts already in territory
  const huntCardValue = parseCardValue(cardId);
  const huntsInTerritory = countTerritoryType(player, "hunt");
  const huntTotalValue = huntCardValue + huntsInTerritory;

  // KC bonus: each King's Command in territory adds to discard/draw count
  const kcCount = countTerritoryType(player, "kingscommand");
  const discardsPerPlayer = 2 + kcCount;
  const drawsForHunter = 2 + kcCount;

  log(state, `${player.name} plays ${cardDisplayName(cardId)} (total Hunt value: ${huntTotalValue}).`);

  // Remove from hand (don't put in territory yet — goes there after resolution)
  const idx = player.hand.indexOf(cardId);
  player.hand.splice(idx, 1);

  // Set up opponent responses
  const opponentSeats = getOpponentSeatsInOrder(state, player.seatIndex);

  if (opponentSeats.length === 0) {
    // No opponents — just draw and place hunt
    finishHunt(state, player, cardId, drawsForHunter, 0);
    return null;
  }

  state.pendingAction = {
    type: "huntResponse",
    huntPlayerSeat: player.seatIndex,
    huntCardId: cardId,
    huntTotalValue,
    respondingSeat: opponentSeats[0],
    remainingResponderSeats: opponentSeats.slice(1),
    discardsPerPlayer,
    drawsForHunter,
    averters: 0,
    nonAverterSeats: [],
  };

  return null;
}

// ============================================================
// 2. Hunt Response (opponent decides: avert or accept)
// ============================================================

/**
 * An opponent responds to a Hunt.
 * They can:
 *   - Accept (healingId: null) → they'll discard later
 *   - Reveal Healing (healingId: cardId) optionally with Magi (magiId: cardId)
 *     → if total >= huntTotalValue, they avert
 */
export function handleHuntResponse(
  state: GameState,
  player: PlayerState,
  healingId: string | null,
  magiId: string | null
): string | null {
  const pending = state.pendingAction as PendingHuntResponse | null;
  if (!pending || pending.type !== "huntResponse") {
    return "No pending hunt response";
  }
  if (pending.respondingSeat !== player.seatIndex) {
    return "Not your turn to respond";
  }

  let averted = false;

  if (healingId) {
    // Validate healing card
    if (parseCardType(healingId) !== "healing") {
      return "Not a Healing card";
    }
    if (!player.hand.includes(healingId)) {
      return "Healing card not in your hand";
    }

    // Validate magi card if provided
    if (magiId) {
      if (parseCardType(magiId) !== "magi") {
        return "Not a Magi card";
      }
      if (!player.hand.includes(magiId)) {
        return "Magi card not in your hand";
      }
    }

    // Calculate healing total
    const healingCardValue = parseCardValue(healingId);
    const healingInTerritory = countTerritoryType(player, "healing");
    const magiAsHealingCount = player.territoryMagiAsHealing.length;
    const magiBonus = magiId ? 6 : 0;
    const healingTotal = healingCardValue + healingInTerritory + magiAsHealingCount + magiBonus;

    if (healingTotal >= pending.huntTotalValue) {
      averted = true;
      log(state, `${player.name} averts the Hunt with ${cardDisplayName(healingId)}${magiId ? " + Magi" : ""} (Healing ${healingTotal} ≥ Hunt ${pending.huntTotalValue}).`);

      // Move healing card from hand to territory
      const hIdx = player.hand.indexOf(healingId);
      player.hand.splice(hIdx, 1);
      player.territory.push(healingId);

      // If magi was used, move it to territory as Magi-as-Healing
      if (magiId) {
        const mIdx = player.hand.indexOf(magiId);
        player.hand.splice(mIdx, 1);
        player.territory.push(magiId);
        player.territoryMagiAsHealing.push(magiId);
      }
    } else {
      log(state, `${player.name} tries to avert with ${cardDisplayName(healingId)}${magiId ? " + Magi" : ""} (Healing ${healingTotal} < Hunt ${pending.huntTotalValue}) — fails!`);
      // Cards stay in hand, player must discard as normal
    }
  }

  if (!averted) {
    if (!healingId) {
      log(state, `${player.name} accepts the Hunt.`);
    }
  }

  // Update pending state
  const newAverters = averted ? pending.averters + 1 : pending.averters;
  const newNonAverterSeats = averted
    ? [...pending.nonAverterSeats]
    : [...pending.nonAverterSeats, player.seatIndex];

  // Advance to next responder or move to discard phase
  if (pending.remainingResponderSeats.length > 0) {
    state.pendingAction = {
      ...pending,
      respondingSeat: pending.remainingResponderSeats[0],
      remainingResponderSeats: pending.remainingResponderSeats.slice(1),
      averters: newAverters,
      nonAverterSeats: newNonAverterSeats,
    };
  } else {
    // All opponents have responded — move to discard phase or finish
    startDiscardPhaseOrFinish(state, pending, newAverters, newNonAverterSeats);
  }

  return null;
}

// ============================================================
// 3. Hunt Discard (non-averters discard cards)
// ============================================================

/**
 * A non-averter discards cards due to Hunt.
 */
export function handleHuntDiscard(
  state: GameState,
  player: PlayerState,
  cardIds: string[]
): string | null {
  const pending = state.pendingAction as PendingHuntDiscard | null;
  if (!pending || pending.type !== "huntDiscard") {
    return "No pending hunt discard";
  }
  if (pending.currentDiscardSeat !== player.seatIndex) {
    return "Not your turn to discard";
  }

  const mustDiscard = Math.min(pending.discardsPerPlayer, player.hand.length);

  if (cardIds.length !== mustDiscard) {
    return `Must discard exactly ${mustDiscard} card(s), got ${cardIds.length}`;
  }
  if (new Set(cardIds).size !== cardIds.length) {
    return "Duplicate cards in discard selection";
  }
  for (const id of cardIds) {
    if (!player.hand.includes(id)) {
      return `Card ${id} is not in your hand`;
    }
  }

  // Discard with atonement for any Stags
  for (const id of cardIds) {
    discardFromHandWithAtonement(state, player, id);
    if (player.eliminated) break;
  }

  log(state, `${player.name} discards ${mustDiscard} card(s) from the Hunt.`);

  // Advance to next discarder or finish
  if (pending.remainingDiscardSeats.length > 0) {
    state.pendingAction = {
      ...pending,
      currentDiscardSeat: pending.remainingDiscardSeats[0],
      remainingDiscardSeats: pending.remainingDiscardSeats.slice(1),
    };
  } else {
    finishHuntAfterDiscards(state, pending);
  }

  return null;
}

// ============================================================
// Internal helpers
// ============================================================

function startDiscardPhaseOrFinish(
  state: GameState,
  pending: PendingHuntResponse,
  averters: number,
  nonAverterSeats: number[]
) {
  if (nonAverterSeats.length > 0) {
    state.pendingAction = {
      type: "huntDiscard",
      huntPlayerSeat: pending.huntPlayerSeat,
      huntCardId: pending.huntCardId,
      currentDiscardSeat: nonAverterSeats[0],
      remainingDiscardSeats: nonAverterSeats.slice(1),
      discardsPerPlayer: pending.discardsPerPlayer,
      drawsForHunter: pending.drawsForHunter,
      averters,
    };
  } else {
    const huntPlayer = getPlayerBySeat(state, pending.huntPlayerSeat);
    finishHunt(state, huntPlayer, pending.huntCardId, pending.drawsForHunter, averters);
  }
}

function finishHuntAfterDiscards(
  state: GameState,
  pending: PendingHuntDiscard
) {
  const huntPlayer = getPlayerBySeat(state, pending.huntPlayerSeat);
  finishHunt(state, huntPlayer, pending.huntCardId, pending.drawsForHunter, pending.averters);
}

/**
 * Final step: hunter draws cards, hunt goes to territory, move to endOfTurn.
 */
function finishHunt(
  state: GameState,
  huntPlayer: PlayerState,
  huntCardId: string,
  drawsBase: number,
  averters: number
) {
  // Hunter draws: base draws minus 1 per averter (minimum 0)
  const drawCount = Math.max(0, drawsBase - averters);

  if (drawCount > 0) {
    let drawn = 0;
    for (let i = 0; i < drawCount; i++) {
      const card = drawCard(state);
      if (card === null) {
        triggerDeckExhaustion(state);
        return;
      }
      huntPlayer.hand.push(card);
      drawn++;
    }
    log(state, `${huntPlayer.name} draws ${drawn} card(s) from the Hunt.`);
  } else {
    log(state, `${huntPlayer.name} draws no cards (all opponents averted).`);
  }

  // Place the Hunt card into territory
  if (huntCardId) {
    huntPlayer.territory.push(huntCardId);
  }

  state.pendingAction = null;
  state.turnPhase = "endOfTurn";
}
