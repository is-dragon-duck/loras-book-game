// ---- Card types and definitions ----

export type CardType = "stag" | "hunt" | "healing" | "magi" | "tithe" | "kingscommand";

// Card IDs are strings like "stag-7", "hunt-3", "magi-2", "kingscommand-1"
export type CardId = string;

export interface CardDef {
  id: CardId;
  type: CardType;
  value: number; // 1-12 for stag/hunt/healing, 1-6 for magi/tithe, 1-3 for kingscommand
}

// All 51 cards in the game
const ALL_CARDS: CardDef[] = [];

// Stag 1-12 (Spades A-Q)
for (let i = 1; i <= 12; i++) ALL_CARDS.push({ id: `stag-${i}`, type: "stag", value: i });
// Hunt 1-12 (Clubs A-Q)
for (let i = 1; i <= 12; i++) ALL_CARDS.push({ id: `hunt-${i}`, type: "hunt", value: i });
// Healing 1-12 (Hearts A-Q)
for (let i = 1; i <= 12; i++) ALL_CARDS.push({ id: `healing-${i}`, type: "healing", value: i });
// Magi 1-6 (Diamonds 7-Q)
for (let i = 1; i <= 6; i++) ALL_CARDS.push({ id: `magi-${i}`, type: "magi", value: i });
// Tithe 1-6 (Diamonds A-6)
for (let i = 1; i <= 6; i++) ALL_CARDS.push({ id: `tithe-${i}`, type: "tithe", value: i });
// King's Command 1-3 (3 remaining Kings)
for (let i = 1; i <= 3; i++) ALL_CARDS.push({ id: `kingscommand-${i}`, type: "kingscommand", value: i });

export function getAllCards(): CardDef[] {
  return ALL_CARDS.map((c) => ({ ...c }));
}

export function getCard(id: CardId): CardDef {
  const card = ALL_CARDS.find((c) => c.id === id);
  if (!card) throw new Error(`Unknown card: ${id}`);
  return { ...card };
}

export function parseCardType(id: CardId): CardType {
  const dash = id.indexOf("-");
  return id.substring(0, dash) as CardType;
}

export function parseCardValue(id: CardId): number {
  const dash = id.indexOf("-");
  return parseInt(id.substring(dash + 1), 10);
}

// ---- Deck operations ----

/** Fisher-Yates shuffle (in place, returns same array) */
export function shuffle<T>(arr: T[]): T[] {
  for (let i = arr.length - 1; i > 0; i--) {
    const j = Math.floor(Math.random() * (i + 1));
    [arr[i], arr[j]] = [arr[j], arr[i]];
  }
  return arr;
}

/** Create a shuffled 51-card deck */
export function createDeck(): CardId[] {
  return shuffle(ALL_CARDS.map((c) => c.id));
}

// ---- Game rule helpers ----

/** How many cards must be discarded from hand to play a Stag of this value */
export function stagDiscardCost(stagValue: number): number {
  if (stagValue <= 3) return 1;
  if (stagValue <= 6) return 2;
  if (stagValue <= 9) return 4;
  return 8;
}

/** How much atonement (contribution) is required when discarding a Stag of this value */
export function stagAtonementCost(stagValue: number): number {
  if (stagValue <= 4) return 1;
  if (stagValue <= 8) return 2;
  return 3;
}

/** Display name for a card */
export function cardDisplayName(id: CardId): string {
  const type = parseCardType(id);
  const value = parseCardValue(id);
  const typeNames: Record<CardType, string> = {
    stag: "Stag",
    hunt: "Hunt",
    healing: "Healing",
    magi: "Magi",
    tithe: "Tithe",
    kingscommand: "King's Command",
  };
  // Magi, Tithe, and King's Command don't really need their instance number shown to players
  if (type === "magi" || type === "tithe" || type === "kingscommand") {
    return typeNames[type];
  }
  return `${typeNames[type]} ${value}`;
}
