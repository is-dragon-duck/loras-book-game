# Phase 3: Game Engine — Milestones

## Milestone 1: Core Turn Loop + Draw A Card + Healing

Foundation everything else plugs into.

- [ ] Action dispatch router (receives action, validates player/phase, calls handler, saves state)
- [ ] Deck helper functions (draw, burn, deal to kingdom, reshuffle discard into deck, check for deck exhaustion)
- [ ] Kingdom refresh (auto-runs at turn start if kingdom < 3)
- [ ] Kingdom action: **Draw A Card** (draw 1, burn 1, deal 1 to kingdom)
- [ ] Territory action: **Healing** (just goes into territory, no on-play effect)
- [ ] Territory action: **no non-Stag cards fallback** (reveal hand, burn 1, draw 3)
- [ ] End of turn: discard to hand limit (simple version — pick cards to discard, no Stag atonement yet)
- [ ] Turn advancement (next player, back to refresh)

*After this milestone:* Take turns drawing cards and playing Healings. Boring, but the whole turn loop works.

---

## Milestone 2: Stags + Draft Kingdom

The two remaining kingdom actions, plus Stag atonement.

- [ ] Kingdom action: **Draft Kingdom** (you pick one, then each opponent picks one sequentially, discard remainder)
- [ ] Kingdom action: **Play a Stag** (pay discard cost, multi-round kingdom draft for opponents, you pick last, discard remainder)
- [ ] **Stag atonement** when discarding Stags for any reason (contribute based on value tier, unless Healing territory covers it)
- [ ] **Elimination** check — if you must contribute and can't, you're out
- [ ] **Win condition: 18 Stag Points** — checked after every Stag enters territory
- [ ] **Win condition: last player standing** — checked after every elimination

*After this milestone:* You can actually try to win by scoring 18 Stag Points.

---

## Milestone 3: Hunts + Healing Defense

The main attack/defense interaction.

- [ ] Territory action: **Hunt** (burn a card, then sequential opponent responses, then draw cards, Hunt goes to territory)
- [ ] **Hunt response flow** — each opponent decides: do nothing (discard 2+), or reveal Healing, or Healing + Magi
- [ ] Hunt total value calculation (card value + Hunts in territory)
- [ ] Healing defense calculation (card value + Healing in territory + Magi-as-Healing + 6 if Magi revealed)
- [ ] Magi-as-Healing territory tracking
- [ ] Hunter draw count reduced by 1 per averter
- [ ] Forced discard with insufficient cards = discard whole hand
- [ ] King's Command territory bonus wired into Hunt handler (opponents discard 2 + KC count, hunter draws 2 + KC count)

*After this milestone:* Attack opponents' hands, defend with Healing. Real player interaction.

---

## Milestone 4: Magi + Tithe

Two utility cards with multi-step flows.

- [ ] Territory action: **Magi** — choose split of 6 (draw-top, draw-bottom, place-bottom), execute, +1 hand limit
- [ ] Territory action: **Tithe** — discard 2 / draw 2 for everyone, then optional contribute (up to 2x) for more cycles. If contributed, Tithe goes to territory (+3 contribution for deck-out).
- [ ] Stag atonement verified in Tithe/Magi forced discard paths

*After this milestone:* Full hand management. Magi sculpts hand + increases hand size. Tithe churns cards + invests contributions.

---

## Milestone 5: King's Command + Game End Scoring + Polish

Last card type and final win condition.

- [ ] Territory action: **King's Command** — opponents discard a Stag (with atonement) or reveal no Stags. Player picks which to take. KC goes to territory (+1 discard/draw on future Hunts).
- [ ] **Deck exhaustion win condition** — score = Stag points + (3 × Tithes in territory) + total contributions (incl. antes). Tiebreakers: Magi > Healing > Hunt > KC.
- [ ] Edge case sweep: atonement in every discard path, elimination cascades
