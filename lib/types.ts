import { CardId } from "./cards";

// ---- Player State ----

export interface PlayerState {
  id: string;             // random UUID, stored in player's browser
  name: string;
  seatIndex: number;      // 0-based position at the table
  hand: CardId[];
  territory: CardId[];
  // Magi in territory that were used for Healing (provide +1 healing, NOT +1 hand size)
  territoryMagiAsHealing: CardId[];
  contributionsRemaining: number;  // starts at 12
  contributionsMade: number;       // starts at 0
  ante: number;                    // 1 for first player, 2 for second, etc.
  eliminated: boolean;
}

// ---- Turn Phase ----

export type TurnPhase =
  | "refreshKingdom"
  | "kingdomAction"     // player chooses: drawCard, draftKingdom, or playStag
  | "territoryAction"   // player plays a non-Stag card
  | "endOfTurn";        // discard to hand limit, then advance

// ---- Pending Actions (multi-step interactions) ----

export type PendingAction =
  | PendingDraftKingdom
  | PendingHuntResponse
  | PendingHuntDiscard
  | PendingMagiChoice
  | PendingMagiPlaceCards
  | PendingTitheDiscard
  | PendingTitheContribute
  | PendingKingCommandResponse
  | PendingKingCommandCollect
  | PendingStagKingdomDraft
  | PendingStagKingdomPickSelf
  | PendingDiscardToHandLimit
  | PendingDiscardForCost;

export interface PendingDraftKingdom {
  type: "draftKingdom";
  currentDrafterSeat: number;     // seat index of who picks next
  remainingDrafterSeats: number[];
}

export interface PendingHuntResponse {
  type: "huntResponse";
  huntPlayerSeat: number;
  huntCardId: CardId;
  huntTotalValue: number;
  respondingSeat: number;          // who's currently deciding
  remainingResponderSeats: number[];
  discardsPerPlayer: number;       // 2 + king's commands
  drawsForHunter: number;          // 2 + king's commands
  averters: number;                // count of players who averted (reduces hunter draws)
  nonAverterSeats: number[];       // seats that failed to avert, need to discard
}

export interface PendingHuntDiscard {
  type: "huntDiscard";
  huntPlayerSeat: number;
  huntCardId: CardId;
  currentDiscardSeat: number;
  remainingDiscardSeats: number[];
  discardsPerPlayer: number;
  drawsForHunter: number;
  averters: number;
}

export interface PendingMagiChoice {
  type: "magiChoice";
  playerSeat: number;
}

export interface PendingMagiPlaceCards {
  type: "magiPlaceCards";
  playerSeat: number;
  placeBottomCount: number;        // how many cards to put on bottom
}

export interface PendingTitheDiscard {
  type: "titheDiscard";
  tithePlayerSeat: number;
  titheCardId: CardId;
  currentDiscardSeat: number;
  remainingDiscardSeats: number[];   // opponents who still need to discard/draw
  contributionsSoFar: number;        // track contribution count through discard flow
}

export interface PendingTitheContribute {
  type: "titheContribute";
  playerSeat: number;
  titheCardId: CardId;
  contributionsSoFar: number;      // 0, 1, or 2 max
}

export interface PendingKingCommandResponse {
  type: "kingCommandResponse";
  commandPlayerSeat: number;
  respondingSeat: number;
  remainingResponderSeats: number[];
  discardedStags: CardId[];        // accumulates as opponents discard
}

export interface PendingKingCommandCollect {
  type: "kingCommandCollect";
  commandPlayerSeat: number;
  discardedStags: CardId[];        // stags the command player can take
}

export interface PendingStagKingdomDraft {
  type: "stagKingdomDraft";
  stagPlayerSeat: number;
  currentDrafterSeat: number;
  remainingDrafterSeats: number[];
  round: number;
}

export interface PendingStagKingdomPickSelf {
  type: "stagKingdomPickSelf";
  stagPlayerSeat: number;
}

export interface PendingDiscardToHandLimit {
  type: "discardToHandLimit";
  playerSeat: number;
  mustDiscard: number;             // how many cards over limit
}

export interface PendingDiscardForCost {
  type: "discardForCost";
  playerSeat: number;
  mustDiscard: number;
  reason: string; // e.g. "hunt", "tithe"
}

// ---- Full Game State (server-side, contains hidden info) ----

export interface GameState {
  players: PlayerState[];
  playerOrder: number[];           // seat indices of non-eliminated players, in turn order
  currentPlayerIndex: number;      // index into playerOrder (NOT seat index)
  turnPhase: TurnPhase;
  deck: CardId[];                  // top of deck = last element (pop)
  burned: CardId[];
  kingdom: CardId[];
  discard: CardId[];
  pendingAction: PendingAction | null;
  log: LogEntry[];
  winner: string | null;           // player id of winner, or null
  winReason: string | null;        // "stag18" | "lastStanding" | "deckOut"
}

export interface LogEntry {
  msg: string;
  ts: number;
}

// ---- Database row ----

export interface GameRow {
  id: string;                      // 6-char game code
  state: GameState;
  phase: "lobby" | "playing" | "finished";
  updated_at: string;
}

// ---- Filtered View (what the client receives) ----

export interface PlayerView {
  gameId: string;
  phase: "lobby" | "playing" | "finished";

  // My info
  myPlayerId: string;
  mySeat: number;
  myHand: CardId[];
  myTerritory: CardId[];
  myTerritoryMagiAsHealing: CardId[];
  myContributionsRemaining: number;
  myContributionsMade: number;
  myAnte: number;
  myHandLimit: number;
  myEliminated: boolean;

  // All players (public info)
  players: PublicPlayerInfo[];

  // Shared zones
  kingdom: CardId[];
  discardPile: CardId[];           // full discard is public (face-up)
  deckCount: number;
  burnedCount: number;

  // Turn info
  currentPlayerSeat: number;
  currentPlayerName: string;
  isMyTurn: boolean;
  turnPhase: TurnPhase;
  pendingAction: PendingAction | null;

  // What can I do right now?
  availableActions: string[];

  // Game log
  log: LogEntry[];

  // End state
  winner: string | null;
  winReason: string | null;
}

export interface PublicPlayerInfo {
  name: string;
  seatIndex: number;
  handCount: number;
  territory: CardId[];
  territoryMagiAsHealing: CardId[];
  contributionsRemaining: number;
  contributionsMade: number;
  ante: number;
  eliminated: boolean;
  isMe: boolean;
}
