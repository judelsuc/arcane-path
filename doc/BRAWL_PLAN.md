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
2. Journey triggers: urban cells (more at night, fewer with police presence),
   sleeping outside (fewer at campsites, with the dog), the 7-day cap,
   robbery and health outcomes, saved/validated history like the pursuit.
3. Fleeing as a street-chase variant of the pursuit run.
4. The pursuer's capture opens the fight instead of instant death; winning
   restores the pursuit head start, losing ends the journey as today.
5. Music (`music-fight`, prompt 18) and hit sounds.
