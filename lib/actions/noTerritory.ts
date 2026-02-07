import { GameState, PlayerState } from "../types";
import { parseCardType, cardDisplayName } from "../cards";
import { burnCard, drawCard, triggerDeckExhaustion, log } from "../engine";

/**
 * Territory Action Fallback: No non-Stag cards to play.
 * Reveal hand, burn 1 card, draw 3 cards.
 */
export function handleNoTerritory(state: GameState, player: PlayerState): string | null {
  if (state.turnPhase !== "territoryAction") {
    return "Not in territory action phase";
  }

  // Verify player truly has no non-Stag cards
  const nonStags = player.hand.filter((c) => parseCardType(c) !== "stag");
  if (nonStags.length > 0) {
    return "You have non-Stag cards you must play";
  }

  const handDesc = player.hand.length === 0
    ? "an empty hand"
    : player.hand.map(cardDisplayName).join(", ");
  log(state, `${player.name} reveals ${handDesc} (no non-Stag cards to play).`);

  // Burn 1
  if (!burnCard(state)) {
    triggerDeckExhaustion(state);
    return null;
  }

  // Draw 3
  for (let i = 0; i < 3; i++) {
    const card = drawCard(state);
    if (card === null) {
      triggerDeckExhaustion(state);
      return null;
    }
    player.hand.push(card);
  }

  log(state, `${player.name} drew 3 cards.`);
  state.turnPhase = "endOfTurn";
  return null;
}
