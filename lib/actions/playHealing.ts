import { GameState, PlayerState } from "../types";
import { playToTerritory, log } from "../engine";
import { parseCardType, cardDisplayName } from "../cards";

/**
 * Territory Action: Play Healing
 * No on-play effect. Card goes to territory for ongoing +1 Healing value.
 */
export function handlePlayHealing(state: GameState, player: PlayerState, cardId: string): string | null {
  if (state.turnPhase !== "territoryAction") {
    return "Not in territory action phase";
  }

  if (parseCardType(cardId) !== "healing") {
    return "Not a Healing card";
  }

  if (!player.hand.includes(cardId)) {
    return "Card not in your hand";
  }

  playToTerritory(player, cardId);
  log(state, `${player.name} played ${cardDisplayName(cardId)} to territory.`);

  state.turnPhase = "endOfTurn";
  return null;
}
