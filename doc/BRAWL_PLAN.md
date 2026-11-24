# Garde haute — self-defence brawl

A side-view fight in which the traveller breaks free from one to three
attackers. The goal is never to hurt people: attackers are knocked down
(stars, no blood) and give up.

## Rules (stage 1, `minigames/brawl.mjs`)

- 60 ticks per second, fully determined by a seed and the input transcript
  (`[tick, mask]` changes); `replayBrawl` re-derives the outcome, as the
  pursuit escape does.
- Controls: ← → move, ↑ hop back (avoids low attacks and the grab), ↓ duck
  (avoids high attacks), Space push, Space + ↓ sweep, Space + ↑ parry.
- Attackers wind up visibly (▲ high, ▼ low, ✋ grab for the pursuer), lunge
  while winding up and chase faster than the traveller walks.
- A parry within 12 ticks of the blow, or a push, staggers; a sweep floors a
  staggered (or dog-held) attacker for a few seconds.
- Outcomes: `won` (every attacker down at the same moment), `escaped` (at a
  screen edge with no attacker able to chase within 130 px), `lost` (breath at
  zero, a grab not broken in time, 90-second limit or abandon).
- Difficulty 1–10: wind-up length, attacker speed, stagger and down time, and
  from level 7 two attackers may wind up together.
- Drowsy start (woken at camp): half speed for the first 3 seconds.
- Dog (any name, only when present): first hold at 5 s, then every 8 s, holds
  the nearest able attacker for about 3 s.
- Pursuer: always alone, larger, faster wind-ups, and a grab broken by
  hammering Space (about 2.5 presses/s at level 1, 6/s at level 10).

## Decisions (23 November 2026)

1. Losing an urban or camp fight is a robbery (money and items, like the
   existing theft) plus a health hit — never death. Only the pursuer kills.
2. Before an urban fight the player may flee; fleeing turns into a new
   variant of the pursuit run (the attackers chase through the streets).
3. At most one street or camp encounter every 7 days of journey time.
4. The dog helps whenever it is present, whatever its name.

## Stages

1. Engine, replay validation, canvas UI and `brawl-preview.html` (done).
2. Journey triggers (done, 0.22.46, `brawl-journey.mjs` and `brawl-journey-ui.mjs`):
   urban cells 3.5% per step at night and 0.8% by day, never beside a police
   station; sleeping without shelter 15% per night (halved with the dog; the
   tarot sanctuary, shelters and campsites are safe), waking after 35–75% of
   the night; at most one fight per 7 journey days; never on top of another
   pending event. Level 1–10 from days on the road, fatigue and night; breath
   2–5 from health; knife and dog from the real inventory and companion.
   Losing takes 25–50% of the purse (at most half), 15 health (never below 1)
   and 10 fatigue; winning costs 4 fatigue. History is replayed on load.
3. Fleeing (done, 0.22.46): before a street fight, "Fuir" runs the pursuit
   escape engine through streets (`minigames/street-chase-ui.mjs`, replayed
   with `replayEscape`). Escaping ends the encounter with outcome `fled` and 6
   fatigue; being caught starts the fight one breath short.
4. Pursuer (done, 0.22.46): a failed escape opens a single fight against the
   pursuer (`openPursuerFight`), tied to the escape by `escapeId`. Winning
   restores the 30 km lead and costs 10 fatigue; losing ends the journey as
   `captured`. The pursuer never robs and his fights ignore the weekly limit.
   `validatePursuit` accepts a capture that a won fight followed.
5. Music (`music-fight`, prompt 18) and synthesized hit sounds (done).
