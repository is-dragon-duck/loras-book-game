import { parseCardType } from "./cards";
import { GameState, PlayerView, PublicPlayerInfo, PlayerState } from "./types";

/**
 * Compute a player's hand limit.
 * Base 6, +1 per Magi in territory that is NOT used as healing.
 */
export function getHandLimit(player: PlayerState): number {
  let limit = 6;
  for (const cardId of player.territory) {
    if (
      parseCardType(cardId) === "magi" &&
      !player.territoryMagiAsHealing.includes(cardId)
    ) {
      limit += 1;
    }
  }
  return limit;
}

/**
 * Compute the total Healing value in a player's territory.
 * +1 per Healing card, +1 per Magi-as-Healing card.
 */
export function getTerritoryHealingValue(player: PlayerState): number {
  let total = 0;
  for (const cardId of player.territory) {
    if (parseCardType(cardId) === "healing") total += 1;
  }
  total += player.territoryMagiAsHealing.length;
  return total;
}

/**
 * Compute total Stag points in a player's territory.
 */
export function getStagPoints(player: PlayerState): number {
  let total = 0;
  for (const cardId of player.territory) {
    if (parseCardType(cardId) === "stag") {
      const val = parseInt(cardId.split("-")[1], 10);
      total += val;
    }
  }
  return total;
}

/**
 * Count cards of a given type in a player's territory.
 */
export function countTerritoryType(player: PlayerState, type: string): number {
  return player.territory.filter((c) => parseCardType(c) === type).length;
}

/**
 * Build the filtered view a specific player receives.
 */
export function buildPlayerView(
  gameId: string,
  phase: "lobby" | "playing" | "finished",
  state: GameState,
  playerId: string
): PlayerView {
  const me = state.players.find((p) => p.id === playerId);
  if (!me) throw new Error("Player not found in game");

  const currentSeat = state.playerOrder[state.currentPlayerIndex];
  const currentPlayer = state.players.find((p) => p.seatIndex === currentSeat)!;

  const players: PublicPlayerInfo[] = state.players.map((p) => ({
    name: p.name,
    seatIndex: p.seatIndex,
    handCount: p.hand.length,
    territory: [...p.territory],
    territoryMagiAsHealing: [...p.territoryMagiAsHealing],
    contributionsRemaining: p.contributionsRemaining,
    contributionsMade: p.contributionsMade,
    ante: p.ante,
    eliminated: p.eliminated,
    isMe: p.id === playerId,
  }));

  // Determine available actions
  const availableActions = computeAvailableActions(state, me);

  return {
    gameId,
    phase,
    myPlayerId: me.id,
    mySeat: me.seatIndex,
    myHand: [...me.hand],
    myTerritory: [...me.territory],
    myTerritoryMagiAsHealing: [...me.territoryMagiAsHealing],
    myContributionsRemaining: me.contributionsRemaining,
    myContributionsMade: me.contributionsMade,
    myAnte: me.ante,
    myHandLimit: getHandLimit(me),
    myEliminated: me.eliminated,
    players,
    kingdom: [...state.kingdom],
    discardPile: [...state.discard],
    deckCount: state.deck.length,
    burnedCount: state.burned.length,
    currentPlayerSeat: currentSeat,
    currentPlayerName: currentPlayer.name,
    isMyTurn: currentSeat === me.seatIndex,
    turnPhase: state.turnPhase,
    pendingAction: state.pendingAction,
    availableActions,
    log: state.log.slice(-50), // last 50 entries
    winner: state.winner,
    winReason: state.winReason,
  };
}

/**
 * Figure out what actions this player can take right now.
 */
function computeAvailableActions(state: GameState, me: PlayerState): string[] {
  // If game is over, nothing to do
  if (state.winner) return [];

  // If there's a pending action, check if it's waiting on me
  if (state.pendingAction) {
    return computePendingActions(state.pendingAction, me);
  }

  const currentSeat = state.playerOrder[state.currentPlayerIndex];
  const isMyTurn = currentSeat === me.seatIndex;
  if (!isMyTurn) return [];

  const actions: string[] = [];

  if (state.turnPhase === "kingdomAction") {
    // Can always draw a card (if deck has cards, but that's checked at action time)
    actions.push("drawCard");

    // Can always draft kingdom (if kingdom has cards)
    if (state.kingdom.length > 0) {
      actions.push("draftKingdom");
    }

    // Can play a Stag if we have one and enough cards to pay the discard cost
    const stags = me.hand.filter((c) => parseCardType(c) === "stag");
    for (const stagId of stags) {
      const val = parseInt(stagId.split("-")[1], 10);
      const cost = val <= 3 ? 1 : val <= 6 ? 2 : val <= 9 ? 4 : 8;
      // Need at least `cost` OTHER cards in hand (not counting the stag itself)
      if (me.hand.length - 1 >= cost) {
        actions.push("playStag");
        break; // just need to know it's possible, UI will let them pick which
      }
    }
  }

  if (state.turnPhase === "territoryAction") {
    const nonStags = me.hand.filter((c) => parseCardType(c) !== "stag");
    if (nonStags.length > 0) {
      actions.push("playTerritory");
    } else {
      actions.push("noTerritory");
    }
  }

  if (state.turnPhase === "endOfTurn") {
    const limit = getHandLimit(me);
    if (me.hand.length > limit) {
      actions.push("discardToHandLimit");
    }
    // Otherwise end-of-turn auto-advances (handled server-side)
  }

  return actions;
}

function computePendingActions(pending: NonNullable<GameState["pendingAction"]>, me: PlayerState): string[] {
  switch (pending.type) {
    case "draftKingdom":
      if (pending.currentDrafterSeat === me.seatIndex) return ["draftKingdomPick"];
      return [];

    case "huntResponse":
      if (pending.respondingSeat === me.seatIndex) return ["huntResponse"];
      return [];

    case "magiChoice":
      if (pending.playerSeat === me.seatIndex) return ["magiChoice"];
      return [];

    case "magiPlaceCards":
      if (pending.playerSeat === me.seatIndex) return ["magiPlaceCards"];
      return [];

    case "titheContribute":
      if (pending.playerSeat === me.seatIndex) return ["titheContribute"];
      return [];

    case "kingCommandResponse":
      if (pending.respondingSeat === me.seatIndex) return ["kingCommandResponse"];
      return [];

    case "kingCommandCollect":
      if (pending.commandPlayerSeat === me.seatIndex) return ["kingCommandCollect"];
      return [];

    case "stagKingdomDraft":
      if (pending.currentDrafterSeat === me.seatIndex) return ["stagKingdomPick"];
      return [];

    case "stagKingdomPickSelf":
      if (pending.stagPlayerSeat === me.seatIndex) return ["stagKingdomPick"];
      return [];

    case "discardToHandLimit":
      if (pending.playerSeat === me.seatIndex) return ["discardToHandLimit"];
      return [];

    case "discardForCost":
      if (pending.playerSeat === me.seatIndex) return ["discardForCost"];
      return [];

    default:
      return [];
  }
}
