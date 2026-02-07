"use client";

import { useState } from "react";
import { useParams, useRouter } from "next/navigation";
import { useGame } from "@/lib/useGame";
import { PlayerView } from "@/lib/types";
import { cardDisplayName, parseCardType, parseCardValue, stagDiscardCost } from "@/lib/cards";

export default function GamePage() {
  const params = useParams();
  const router = useRouter();
  const gameId = params.gameId as string;
  const playerId =
    typeof window !== "undefined"
      ? localStorage.getItem(`player-${gameId}`)
      : null;

  const { view, error, submitting, submitAction } = useGame(gameId, playerId);

  if (!playerId) {
    return (
      <main className="flex min-h-screen flex-col items-center justify-center p-8">
        <p className="text-red-400">No player session found.</p>
        <button onClick={() => router.push("/")} className="mt-4 px-4 py-2 bg-stone-700 rounded">
          Back to Home
        </button>
      </main>
    );
  }

  if (!view) {
    return (
      <main className="flex min-h-screen flex-col items-center justify-center p-8">
        <p className="text-stone-400">{error || "Loading game..."}</p>
      </main>
    );
  }

  return (
    <GameBoard
      view={view}
      error={error}
      submitting={submitting}
      submitAction={submitAction}
    />
  );
}

// ============================================================
// Main Game Board
// ============================================================

function GameBoard({
  view,
  error,
  submitting,
  submitAction,
}: {
  view: PlayerView;
  error: string;
  submitting: boolean;
  submitAction: (body: Record<string, unknown>) => Promise<void>;
}) {
  const [selectedCards, setSelectedCards] = useState<string[]>([]);
  const [magiSplit, setMagiSplit] = useState({ drawTop: 3, drawBottom: 3, placeBottom: 0 });

  const actions = view.availableActions;
  const pending = view.pendingAction;
  const isFinished = view.phase === "finished";

  function toggleCard(cardId: string) {
    setSelectedCards((prev) =>
      prev.includes(cardId) ? prev.filter((c) => c !== cardId) : [...prev, cardId]
    );
  }

  function clearSelection() {
    setSelectedCards([]);
  }

  async function doAction(body: Record<string, unknown>) {
    clearSelection();
    await submitAction(body);
  }

  // ---- Determine what UI to show ----
  let actionPanel: React.ReactNode = null;

  if (isFinished) {
    actionPanel = <WinPanel view={view} />;
  } else if (actions.length === 0 && !pending) {
    actionPanel = (
      <div className="text-stone-400 text-sm py-2">
        Waiting for {view.currentPlayerName}...
      </div>
    );
  } else if (actions.includes("drawCard") || actions.includes("draftKingdom") || actions.includes("playStag")) {
    actionPanel = (
      <KingdomActionPanel
        view={view}
        selectedCards={selectedCards}
        toggleCard={toggleCard}
        clearSelection={clearSelection}
        doAction={doAction}
        submitting={submitting}
      />
    );
  } else if (actions.includes("playTerritory") || actions.includes("noTerritory")) {
    actionPanel = (
      <TerritoryActionPanel
        view={view}
        doAction={doAction}
        submitting={submitting}
      />
    );
  } else if (actions.includes("draftKingdomPick") || actions.includes("stagKingdomPick")) {
    actionPanel = (
      <KingdomPickPanel
        view={view}
        doAction={doAction}
        submitting={submitting}
        actionName={actions.includes("draftKingdomPick") ? "draftKingdomPick" : "stagKingdomPick"}
      />
    );
  } else if (actions.includes("huntResponse")) {
    actionPanel = (
      <HuntResponsePanel
        view={view}
        doAction={doAction}
        submitting={submitting}
      />
    );
  } else if (actions.includes("huntDiscard") || actions.includes("titheDiscard") || actions.includes("discardToHandLimit") || actions.includes("discardForCost")) {
    const discardAction = actions[0];
    let count = 2;
    if (pending?.type === "discardToHandLimit") count = pending.mustDiscard;
    else if (pending?.type === "huntDiscard") count = pending.discardsPerPlayer;
    else if (pending?.type === "discardForCost") count = pending.mustDiscard;
    count = Math.min(count, view.myHand.length);
    actionPanel = (
      <DiscardPanel
        view={view}
        selectedCards={selectedCards}
        toggleCard={toggleCard}
        clearSelection={clearSelection}
        doAction={doAction}
        submitting={submitting}
        count={count}
        actionName={discardAction}
        reason={pending?.type === "huntDiscard" ? "Hunt" : pending?.type === "titheDiscard" ? "Tithe" : pending?.type === "discardToHandLimit" ? "Hand limit" : "Cost"}
      />
    );
  } else if (actions.includes("magiChoice")) {
    actionPanel = (
      <MagiChoicePanel
        magiSplit={magiSplit}
        setMagiSplit={setMagiSplit}
        doAction={doAction}
        submitting={submitting}
      />
    );
  } else if (actions.includes("magiPlaceCards")) {
    const count = pending?.type === "magiPlaceCards" ? pending.placeBottomCount : 1;
    actionPanel = (
      <DiscardPanel
        view={view}
        selectedCards={selectedCards}
        toggleCard={toggleCard}
        clearSelection={clearSelection}
        doAction={async (body) => {
          await doAction({ action: "magiPlaceCards", cardIds: body.cardIds });
        }}
        submitting={submitting}
        count={count}
        actionName="magiPlaceCards"
        reason="Place on bottom of deck"
      />
    );
  } else if (actions.includes("titheContribute")) {
    actionPanel = (
      <TitheContributePanel
        view={view}
        pending={pending as { type: "titheContribute"; contributionsSoFar: number }}
        doAction={doAction}
        submitting={submitting}
      />
    );
  } else if (actions.includes("kingCommandResponse")) {
    actionPanel = (
      <KingCommandResponsePanel
        view={view}
        doAction={doAction}
        submitting={submitting}
      />
    );
  } else if (actions.includes("kingCommandCollect")) {
    actionPanel = (
      <KingCommandCollectPanel
        view={view}
        selectedCards={selectedCards}
        toggleCard={toggleCard}
        clearSelection={clearSelection}
        doAction={doAction}
        submitting={submitting}
      />
    );
  } else if (actions.length > 0) {
    actionPanel = (
      <div className="text-stone-400 text-sm">
        Available: {actions.join(", ")}
      </div>
    );
  }

  return (
    <main className="min-h-screen p-3 max-w-5xl mx-auto pb-64">
      {/* Header */}
      <div className="flex items-center justify-between mb-3">
        <h1 className="text-lg font-bold text-stone-300">Game {view.gameId}</h1>
        <div className="text-sm">
          {view.isMyTurn && !isFinished ? (
            <span className="text-amber-400 font-semibold">Your turn!</span>
          ) : isFinished ? (
            <span className="text-green-400 font-semibold">Game Over</span>
          ) : (
            <span className="text-stone-400">Waiting for {view.currentPlayerName}</span>
          )}
        </div>
      </div>

      {/* Zone info bar */}
      <div className="flex gap-4 mb-3 text-xs text-stone-500">
        <span>Deck: {view.deckCount}</span>
        <span>Discard: {view.discardPile.length}</span>
        <span>Burned: {view.burnedCount}</span>
        <span>Phase: {view.turnPhase}</span>
      </div>

      {/* Kingdom */}
      <section className="mb-3">
        <h2 className="text-xs text-stone-500 mb-1 uppercase tracking-wide">Kingdom</h2>
        <div className="flex gap-2 flex-wrap min-h-[2.5rem]">
          {view.kingdom.length > 0 ? (
            view.kingdom.map((cardId) => (
              <CardChip key={cardId} cardId={cardId} />
            ))
          ) : (
            <span className="text-stone-600 text-sm">Empty</span>
          )}
        </div>
      </section>

      {/* Players */}
      <section className="mb-3 space-y-1.5">
        <h2 className="text-xs text-stone-500 uppercase tracking-wide">Players</h2>
        {view.players.map((p) => (
          <div
            key={p.seatIndex}
            className={`px-3 py-2 rounded text-sm ${
              p.isMe
                ? "bg-amber-900/20 border border-amber-900/50"
                : p.seatIndex === view.currentPlayerSeat && !isFinished
                ? "bg-stone-800 border border-stone-600"
                : "bg-stone-800/40"
            } ${p.eliminated ? "opacity-50" : ""}`}
          >
            <div className="flex items-center justify-between">
              <span className="font-medium">
                {p.name}
                {p.isMe && <span className="text-amber-400 text-xs ml-1">(you)</span>}
                {p.eliminated && <span className="text-red-400 text-xs ml-1">✗ eliminated</span>}
              </span>
              <span className="text-stone-500 text-xs">
                Hand: {p.handCount} · Coins: {p.contributionsRemaining}/{p.contributionsRemaining + p.contributionsMade}
              </span>
            </div>
            {p.territory.length > 0 && (
              <div className="flex gap-1 flex-wrap mt-1">
                {p.territory.map((cardId, i) => (
                  <CardChip key={`${cardId}-${i}`} cardId={cardId} small />
                ))}
              </div>
            )}
          </div>
        ))}
      </section>

      {/* My Hand */}
      <section className="mb-3">
        <h2 className="text-xs text-stone-500 mb-1 uppercase tracking-wide">
          Your Hand ({view.myHand.length}/{view.myHandLimit})
        </h2>
        <div className="flex gap-2 flex-wrap">
          {view.myHand.length > 0 ? (
            view.myHand.map((cardId) => {
              const isSelected = selectedCards.includes(cardId);
              return (
                <CardChip
                  key={cardId}
                  cardId={cardId}
                  selected={isSelected}
                  onClick={() => toggleCard(cardId)}
                  interactive
                />
              );
            })
          ) : (
            <span className="text-stone-600 text-sm">Empty hand</span>
          )}
        </div>
      </section>

      {/* Error */}
      {error && <p className="text-red-400 text-sm mb-3">{error}</p>}

      {/* Action panel (sticky at bottom) */}
      <div className="fixed bottom-0 left-0 right-0 bg-stone-900/95 border-t border-stone-700 p-3 backdrop-blur">
        <div className="max-w-5xl mx-auto">{actionPanel}</div>
      </div>

      {/* Game Log */}
      <section className="mb-3">
        <h2 className="text-xs text-stone-500 mb-1 uppercase tracking-wide">Log</h2>
        <div className="bg-stone-800/40 rounded p-2 max-h-40 overflow-y-auto text-xs space-y-0.5">
          {view.log.slice().reverse().map((entry, i) => (
            <p key={i} className="text-stone-400">{entry.msg}</p>
          ))}
        </div>
      </section>
    </main>
  );
}

// ============================================================
// Action Panels
// ============================================================

function KingdomActionPanel({
  view,
  selectedCards,
  toggleCard,
  clearSelection,
  doAction,
  submitting,
}: {
  view: PlayerView;
  selectedCards: string[];
  toggleCard: (id: string) => void;
  clearSelection: () => void;
  doAction: (body: Record<string, unknown>) => Promise<void>;
  submitting: boolean;
}) {
  const [mode, setMode] = useState<"choose" | "stag">("choose");
  const [selectedStag, setSelectedStag] = useState<string | null>(null);

  const stags = view.myHand.filter((c) => parseCardType(c) === "stag");
  const playableStags = stags.filter((s) => {
    const cost = stagDiscardCost(parseCardValue(s));
    return view.myHand.length - 1 >= cost;
  });

  if (mode === "stag" && selectedStag) {
    const cost = stagDiscardCost(parseCardValue(selectedStag));
    const canConfirm = selectedCards.length === cost && !selectedCards.includes(selectedStag);

    return (
      <div>
        <p className="text-sm text-stone-300 mb-2">
          Playing {cardDisplayName(selectedStag)} — select {cost} card{cost !== 1 ? "s" : ""} to discard:
        </p>
        <div className="flex gap-2 flex-wrap">
          <button
            onClick={() => { setMode("choose"); setSelectedStag(null); clearSelection(); }}
            className="px-3 py-1.5 bg-stone-700 rounded text-sm"
          >
            ← Cancel
          </button>
          <button
            onClick={() => doAction({ action: "playStag", cardId: selectedStag, discardIds: selectedCards })}
            disabled={!canConfirm || submitting}
            className="px-4 py-1.5 bg-green-800 hover:bg-green-700 disabled:opacity-40 rounded text-sm font-medium"
          >
            Confirm Stag ({selectedCards.length}/{cost})
          </button>
        </div>
      </div>
    );
  }

  return (
    <div>
      <p className="text-sm text-stone-300 mb-2">Kingdom Action — choose one:</p>
      <div className="flex gap-2 flex-wrap">
        <button
          onClick={() => doAction({ action: "drawCard" })}
          disabled={submitting}
          className="px-4 py-1.5 bg-blue-800 hover:bg-blue-700 disabled:opacity-40 rounded text-sm font-medium"
        >
          Draw from Deck
        </button>
        {view.kingdom.length > 0 && (
          <DraftKingdomButton view={view} doAction={doAction} submitting={submitting} />
        )}
        {playableStags.length > 0 && (
          <div className="flex gap-1 flex-wrap">
            {playableStags.map((s) => (
              <button
                key={s}
                onClick={() => { setMode("stag"); setSelectedStag(s); clearSelection(); }}
                disabled={submitting}
                className="px-3 py-1.5 bg-green-900 hover:bg-green-800 disabled:opacity-40 rounded text-sm font-medium"
              >
                Play {cardDisplayName(s)}
              </button>
            ))}
          </div>
        )}
      </div>
    </div>
  );
}

function DraftKingdomButton({
  view,
  doAction,
  submitting,
}: {
  view: PlayerView;
  doAction: (body: Record<string, unknown>) => Promise<void>;
  submitting: boolean;
}) {
  const [picking, setPicking] = useState(false);

  if (picking) {
    return (
      <div className="flex gap-1 flex-wrap items-center">
        <span className="text-sm text-stone-400 mr-1">Pick:</span>
        {view.kingdom.map((c) => (
          <button
            key={c}
            onClick={() => { doAction({ action: "draftKingdom", cardId: c }); setPicking(false); }}
            disabled={submitting}
            className="hover:ring-2 ring-amber-400 rounded"
          >
            <CardChip cardId={c} interactive />
          </button>
        ))}
        <button onClick={() => setPicking(false)} className="px-2 py-1 text-xs text-stone-500">
          Cancel
        </button>
      </div>
    );
  }

  return (
    <button
      onClick={() => setPicking(true)}
      disabled={submitting}
      className="px-4 py-1.5 bg-amber-800 hover:bg-amber-700 disabled:opacity-40 rounded text-sm font-medium"
    >
      Draft Kingdom
    </button>
  );
}

function TerritoryActionPanel({
  view,
  doAction,
  submitting,
}: {
  view: PlayerView;
  doAction: (body: Record<string, unknown>) => Promise<void>;
  submitting: boolean;
}) {
  const nonStags = view.myHand.filter((c) => parseCardType(c) !== "stag");

  if (nonStags.length === 0) {
    return (
      <div>
        <p className="text-sm text-stone-300 mb-2">No playable cards — reveal hand:</p>
        <button
          onClick={() => doAction({ action: "noTerritory" })}
          disabled={submitting}
          className="px-4 py-1.5 bg-stone-700 hover:bg-stone-600 disabled:opacity-40 rounded text-sm"
        >
          Reveal Hand (burn 1, draw 3)
        </button>
      </div>
    );
  }

  return (
    <div>
      <p className="text-sm text-stone-300 mb-2">Territory Action — play a card:</p>
      <div className="flex gap-1.5 flex-wrap">
        {nonStags.map((c) => (
          <button
            key={c}
            onClick={() => doAction({ action: "playTerritory", cardId: c })}
            disabled={submitting}
            className="hover:ring-2 ring-amber-400 rounded"
          >
            <CardChip cardId={c} interactive />
          </button>
        ))}
      </div>
    </div>
  );
}

function KingdomPickPanel({
  view,
  doAction,
  submitting,
  actionName,
}: {
  view: PlayerView;
  doAction: (body: Record<string, unknown>) => Promise<void>;
  submitting: boolean;
  actionName: string;
}) {
  return (
    <div>
      <p className="text-sm text-stone-300 mb-2">Pick a card from the Kingdom:</p>
      <div className="flex gap-1.5 flex-wrap">
        {view.kingdom.map((c) => (
          <button
            key={c}
            onClick={() => doAction({ action: actionName, cardId: c })}
            disabled={submitting}
            className="hover:ring-2 ring-amber-400 rounded"
          >
            <CardChip cardId={c} interactive />
          </button>
        ))}
      </div>
    </div>
  );
}

function HuntResponsePanel({
  view,
  doAction,
  submitting,
}: {
  view: PlayerView;
  doAction: (body: Record<string, unknown>) => Promise<void>;
  submitting: boolean;
}) {
  const pending = view.pendingAction as { type: "huntResponse"; huntTotalValue: number };
  const huntVal = pending.huntTotalValue;
  const healings = view.myHand.filter((c) => parseCardType(c) === "healing");
  const magis = view.myHand.filter((c) => parseCardType(c) === "magi");

  const [selectedHealing, setSelectedHealing] = useState<string | null>(null);
  const [useMagi, setUseMagi] = useState(false);

  // Calculate if selection would avert
  let healingTotal = 0;
  if (selectedHealing) {
    const myInfo = view.players.find((p) => p.isMe)!;
    const healInTerritory = myInfo.territory.filter((c) => parseCardType(c) === "healing").length;
    const magiAsHealing = myInfo.territoryMagiAsHealing.length;
    healingTotal = parseCardValue(selectedHealing) + healInTerritory + magiAsHealing + (useMagi ? 6 : 0);
  }

  return (
    <div>
      <p className="text-sm text-stone-300 mb-2">
        Hunt incoming! (value: {huntVal}) — Avert or accept?
      </p>
      <div className="space-y-2">
        {healings.length > 0 && (
          <div>
            <p className="text-xs text-stone-400 mb-1">Select Healing card to avert:</p>
            <div className="flex gap-1 flex-wrap">
              {healings.map((h) => (
                <button
                  key={h}
                  onClick={() => setSelectedHealing(selectedHealing === h ? null : h)}
                  className={`rounded ${selectedHealing === h ? "ring-2 ring-amber-400" : ""}`}
                >
                  <CardChip cardId={h} interactive />
                </button>
              ))}
            </div>
            {selectedHealing && magis.length > 0 && (
              <label className="flex items-center gap-2 mt-1 text-sm text-stone-300">
                <input
                  type="checkbox"
                  checked={useMagi}
                  onChange={(e) => setUseMagi(e.target.checked)}
                  className="rounded"
                />
                Add Magi (+6)
              </label>
            )}
            {selectedHealing && (
              <p className="text-xs mt-1 text-stone-400">
                Your healing total: {healingTotal} vs hunt: {huntVal} —{" "}
                {healingTotal >= huntVal ? (
                  <span className="text-green-400">Will avert!</span>
                ) : (
                  <span className="text-red-400">Not enough</span>
                )}
              </p>
            )}
          </div>
        )}
        <div className="flex gap-2">
          {selectedHealing && (
            <button
              onClick={() =>
                doAction({
                  action: "huntResponse",
                  healingId: selectedHealing,
                  magiId: useMagi ? magis[0] : null,
                })
              }
              disabled={submitting}
              className="px-4 py-1.5 bg-blue-800 hover:bg-blue-700 disabled:opacity-40 rounded text-sm font-medium"
            >
              Attempt Avert
            </button>
          )}
          <button
            onClick={() => doAction({ action: "huntResponse", healingId: null, magiId: null })}
            disabled={submitting}
            className="px-4 py-1.5 bg-red-900 hover:bg-red-800 disabled:opacity-40 rounded text-sm"
          >
            Accept (discard cards)
          </button>
        </div>
      </div>
    </div>
  );
}

function DiscardPanel({
  view,
  selectedCards,
  toggleCard,
  clearSelection,
  doAction,
  submitting,
  count,
  actionName,
  reason,
}: {
  view: PlayerView;
  selectedCards: string[];
  toggleCard: (id: string) => void;
  clearSelection: () => void;
  doAction: (body: Record<string, unknown>) => Promise<void>;
  submitting: boolean;
  count: number;
  actionName: string;
  reason: string;
}) {
  return (
    <div>
      <p className="text-sm text-stone-300 mb-2">
        {reason}: Select {count} card{count !== 1 ? "s" : ""} to discard ({selectedCards.length}/{count}):
      </p>
      <div className="flex gap-2 items-center flex-wrap">
        <button
          onClick={() => {
            doAction({ action: actionName, cardIds: selectedCards });
            clearSelection();
          }}
          disabled={selectedCards.length !== count || submitting}
          className="px-4 py-1.5 bg-red-800 hover:bg-red-700 disabled:opacity-40 rounded text-sm font-medium"
        >
          Confirm Discard
        </button>
        {selectedCards.length > 0 && (
          <button onClick={clearSelection} className="px-3 py-1 text-xs text-stone-500">
            Clear
          </button>
        )}
      </div>
    </div>
  );
}

function MagiChoicePanel({
  magiSplit,
  setMagiSplit,
  doAction,
  submitting,
}: {
  magiSplit: { drawTop: number; drawBottom: number; placeBottom: number };
  setMagiSplit: (s: { drawTop: number; drawBottom: number; placeBottom: number }) => void;
  doAction: (body: Record<string, unknown>) => Promise<void>;
  submitting: boolean;
}) {
  const total = magiSplit.drawTop + magiSplit.drawBottom + magiSplit.placeBottom;

  function adjust(field: "drawTop" | "drawBottom" | "placeBottom", delta: number) {
    const newVal = Math.max(0, Math.min(6, magiSplit[field] + delta));
    const newSplit = { ...magiSplit, [field]: newVal };
    const newTotal = newSplit.drawTop + newSplit.drawBottom + newSplit.placeBottom;
    if (newTotal <= 6) setMagiSplit(newSplit);
  }

  return (
    <div>
      <p className="text-sm text-stone-300 mb-2">Magi — split 6 effects:</p>
      <div className="space-y-1 mb-2">
        {(["drawTop", "drawBottom", "placeBottom"] as const).map((field) => (
          <div key={field} className="flex items-center gap-2 text-sm">
            <button onClick={() => adjust(field, -1)} className="w-6 h-6 bg-stone-700 rounded text-center">-</button>
            <span className="w-4 text-center">{magiSplit[field]}</span>
            <button onClick={() => adjust(field, 1)} className="w-6 h-6 bg-stone-700 rounded text-center">+</button>
            <span className="text-stone-400">
              {field === "drawTop" ? "Draw from top" : field === "drawBottom" ? "Draw from bottom" : "Place from hand to bottom"}
            </span>
          </div>
        ))}
      </div>
      <button
        onClick={() =>
          doAction({
            action: "magiChoice",
            drawTop: magiSplit.drawTop,
            drawBottom: magiSplit.drawBottom,
            placeBottom: magiSplit.placeBottom,
          })
        }
        disabled={total !== 6 || submitting}
        className="px-4 py-1.5 bg-purple-800 hover:bg-purple-700 disabled:opacity-40 rounded text-sm font-medium"
      >
        Confirm Split ({total}/6)
      </button>
    </div>
  );
}

function TitheContributePanel({
  view,
  pending,
  doAction,
  submitting,
}: {
  view: PlayerView;
  pending: { type: "titheContribute"; contributionsSoFar: number };
  doAction: (body: Record<string, unknown>) => Promise<void>;
  submitting: boolean;
}) {
  const canContribute = view.myContributionsRemaining >= 1 && pending.contributionsSoFar < 2;
  return (
    <div>
      <p className="text-sm text-stone-300 mb-2">
        Tithe: Contribute 1 to discard 2 and draw 2 again? ({pending.contributionsSoFar}/2 contributed)
      </p>
      <div className="flex gap-2">
        {canContribute && (
          <button
            onClick={() => doAction({ action: "titheContribute", contribute: true })}
            disabled={submitting}
            className="px-4 py-1.5 bg-yellow-800 hover:bg-yellow-700 disabled:opacity-40 rounded text-sm font-medium"
          >
            Contribute (cost: 1 coin)
          </button>
        )}
        <button
          onClick={() => doAction({ action: "titheContribute", contribute: false })}
          disabled={submitting}
          className="px-4 py-1.5 bg-stone-700 hover:bg-stone-600 disabled:opacity-40 rounded text-sm"
        >
          Decline
        </button>
      </div>
    </div>
  );
}

function KingCommandResponsePanel({
  view,
  doAction,
  submitting,
}: {
  view: PlayerView;
  doAction: (body: Record<string, unknown>) => Promise<void>;
  submitting: boolean;
}) {
  const stags = view.myHand.filter((c) => parseCardType(c) === "stag");

  if (stags.length === 0) {
    return (
      <div>
        <p className="text-sm text-stone-300 mb-2">King&apos;s Command — you have no stags.</p>
        <button
          onClick={() => doAction({ action: "kingCommandResponse", stagId: null })}
          disabled={submitting}
          className="px-4 py-1.5 bg-stone-700 hover:bg-stone-600 disabled:opacity-40 rounded text-sm"
        >
          Reveal (no stags)
        </button>
      </div>
    );
  }

  return (
    <div>
      <p className="text-sm text-stone-300 mb-2">King&apos;s Command — you must discard a stag:</p>
      <div className="flex gap-1.5 flex-wrap">
        {stags.map((s) => (
          <button
            key={s}
            onClick={() => doAction({ action: "kingCommandResponse", stagId: s })}
            disabled={submitting}
            className="hover:ring-2 ring-red-400 rounded"
          >
            <CardChip cardId={s} interactive />
          </button>
        ))}
      </div>
    </div>
  );
}

function KingCommandCollectPanel({
  view,
  selectedCards,
  toggleCard,
  clearSelection,
  doAction,
  submitting,
}: {
  view: PlayerView;
  selectedCards: string[];
  toggleCard: (id: string) => void;
  clearSelection: () => void;
  doAction: (body: Record<string, unknown>) => Promise<void>;
  submitting: boolean;
}) {
  const pending = view.pendingAction as { type: "kingCommandCollect"; discardedStags: string[] };
  const stags = pending.discardedStags;

  return (
    <div>
      <p className="text-sm text-stone-300 mb-2">
        King&apos;s Command — select stags to take (click to toggle, then confirm):
      </p>
      <div className="flex gap-1.5 flex-wrap mb-2">
        {stags.map((s) => (
          <button
            key={s}
            onClick={() => toggleCard(s)}
            className={`rounded ${selectedCards.includes(s) ? "ring-2 ring-amber-400" : ""}`}
          >
            <CardChip cardId={s} interactive />
          </button>
        ))}
      </div>
      <div className="flex gap-2">
        <button
          onClick={() => { doAction({ action: "kingCommandCollect", stagIds: selectedCards }); clearSelection(); }}
          disabled={submitting}
          className="px-4 py-1.5 bg-green-800 hover:bg-green-700 disabled:opacity-40 rounded text-sm font-medium"
        >
          Take {selectedCards.length} stag{selectedCards.length !== 1 ? "s" : ""}
        </button>
        <button
          onClick={() => { doAction({ action: "kingCommandCollect", stagIds: [] }); clearSelection(); }}
          disabled={submitting}
          className="px-4 py-1.5 bg-stone-700 hover:bg-stone-600 disabled:opacity-40 rounded text-sm"
        >
          Take none
        </button>
      </div>
    </div>
  );
}

function WinPanel({ view }: { view: PlayerView }) {
  // Winner info is in the log
  const lastLog = view.log[view.log.length - 1]?.msg || "Game over!";

  return (
    <div className="text-center py-4">
      <p className="text-xl font-bold text-amber-400 mb-2">Game Over!</p>
      <p className="text-stone-300">{lastLog}</p>
      <a href="/" className="inline-block mt-4 px-4 py-2 bg-stone-700 hover:bg-stone-600 rounded text-sm">
        Back to Home
      </a>
    </div>
  );
}

// ============================================================
// Card Chip Component
// ============================================================

function CardChip({
  cardId,
  small,
  selected,
  onClick,
  interactive,
}: {
  cardId: string;
  small?: boolean;
  selected?: boolean;
  onClick?: () => void;
  interactive?: boolean;
}) {
  const name = cardDisplayName(cardId);
  const type = cardId.split("-")[0];
  const colors: Record<string, string> = {
    stag: "bg-green-900/80 text-green-200 border-green-700",
    hunt: "bg-red-900/80 text-red-200 border-red-700",
    healing: "bg-blue-900/80 text-blue-200 border-blue-700",
    magi: "bg-purple-900/80 text-purple-200 border-purple-700",
    tithe: "bg-yellow-900/80 text-yellow-200 border-yellow-700",
    kingscommand: "bg-orange-900/80 text-orange-200 border-orange-700",
  };
  const color = colors[type] || "bg-stone-700 text-stone-200";
  const selectedRing = selected ? "ring-2 ring-amber-400" : "";
  const cursor = interactive || onClick ? "cursor-pointer" : "";

  return (
    <span
      onClick={onClick}
      className={`${color} border rounded ${selectedRing} ${cursor} ${
        small ? "px-1.5 py-0.5 text-xs" : "px-2.5 py-1 text-sm"
      } font-medium inline-block select-none`}
    >
      {name}
    </span>
  );
}
