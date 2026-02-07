import { GameState, PlayerState } from "../types";
import { drawCard, burnCard, dealToKingdom, triggerDeckExhaustion, log } from "../engine";
import { cardDisplayName } from "../cards";

/**
 * Kingdom Action A: Draw A Card
 * 1. Draw 1 card from the deck
 * 2. Burn 1 card
 * 3. Deal 1 card face-up to the Kingdom
 */
export function handleDrawCard(state: GameState, player: PlayerState): string | null {
  if (state.turnPhase !== "kingdomAction") {
    return "Not in kingdom action phase";
  }

  // 1. Draw 1
  const card = drawCard(state);
  if (card === null) {
    triggerDeckExhaustion(state);
    return null;
  }
  player.hand.push(card);
  log(state, `${player.name} drew a card.`);

  // 2. Burn 1
  if (!burnCard(state)) {
    triggerDeckExhaustion(state);
    return null;
  }

  // 3. Deal 1 to Kingdom
  if (!dealToKingdom(state)) {
    triggerDeckExhaustion(state);
    return null;
  }

  // Move to territory action phase
  state.turnPhase = "territoryAction";
  return null;
}
