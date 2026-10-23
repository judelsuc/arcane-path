const ART = Object.freeze({
  dogEncounter: String.raw`
          / \__
     ____/    o\_
    /          __)
   /  /____/  /
  /__/    /__/
      . . . . .
`,
  food: String.raw`
       .-""""-.
      /  .  .  \
      \________/
         \_/
    ____/   \____
`,
  coins: String.raw`
       o   .
     .---.   o
    (  $  ) .---.
     '---' (  $  )
            '---'
`,
  encouragement: String.raw`
      \o/        o
       |        /|\
      / \       / \
   . . . . . . . . .
`,
  waterBreak: String.raw`
         __
        |  |___
        |   ___|
        |  |  .
     ___|__|__o___
    (_____________)
`,
  catNap: String.raw`
              z
          z
      o___
    __/___\________
      |         |
`,
  clearHead: String.raw`
       \  |  /
        .---.
    -- (  o  ) --
        '---'
       /  |  \
`,
  tailwind: String.raw`
    ----.          o
       --'  --->   /|>
    ------.       / \
   ________'__________
`,
  bandage: String.raw`
       .-------.
      / . . . /|
     /   +   / /
    / . . . / /
    '-------'/
`,
  picnic: String.raw`
        _   _
       (_) (_)
     .---------.
    / + + + + /|
   /_+_+_+_+_/ |
      |     |
`,
  friendlyAdvice: String.raw`
        o       ______
       /|----> |___ / |
       / \        |/
   _______________|___
`,
  delay: String.raw`
      .-------.
      | \   / |
      |  \./  |
      |  / \  |
      | /___\ |
      '-------'
`,
  lostCoins: String.raw`
      .----.
      |   /|
      '--- |
           o
       .       o
   _____o____________
`,
  strain: String.raw`
           o
         _/|_
        /  |
          / \
    _____/___\____
        ^   ^
`,
  tornBag: String.raw`
       .----.
      /      \
     |  /\/   |
     | /  \   |
      '----' .  o
   __________o_______
`,
  restlessThoughts: String.raw`
       . ? . ? .
      (   ...   )
       '-------'
           o
          /|\
          / \
`,
  headwind: String.raw`
        o        .----
      </|   <---  '--
       / \     .------
   ___________'_______
`,
  blisters: String.raw`
           __
        __/  |
       /     |
      /  * __|
     (____/
   ______________
`,
  forestBoar: String.raw`
     /\             /\
    /  \   /\_/\   /  \
     ||   (o   o)   ||
     ||  /  ___  \  ||
         \_/   \_/
          /|   |\
`,
  forestDogs: String.raw`
     /\              /\
    /  \   / \__    /  \
     ||   (    @\__  ||
     ||   /     __/  ||
         / /|  |
        /_/ |__|
`,
  chills: String.raw`
       .  *  .
      *  \|/  *
       -- o --
      *  /|\  *
       . / \ .
`,
  whiteDeer: String.raw`
       \ /   \ /
        Y     Y
         \___/
         (o o)
     ____/   \__
    /  /|     | \
`,
  silentBell: String.raw`
          /\
         /  \
        | () |
        | / \|
        | \_/|
        |  . |
    ____|____|____
`,
  impossibleShadow: String.raw`
        o
       /|\
       / \
    __/___\________
          \    o
           \__/|__
`,
  repeatingStone: String.raw`
       .-------.
      /  ___    \
     |  / _ \   |
     |  \(_/    |
      \________/
    . . . . . . .
`,
  stranger: String.raw`
       ___          ?
      /___\
       ( )
      /| |\
       | |
      /   \
`,
  stars: String.raw`
        *        .
     .      *
          .    *
       *----.
             \ *
     .          .
`,
  ribbon: String.raw`
      \       /
       \_____/
           ||
        __/||\__
       /___||___\
          /  \
`,
  reflection: String.raw`
          o
         /|\
         / \
    ~~~~~~~~~~~~~~~
         \ /
          |\
          o
`,
});

export function journeyEventArt(kind) {
  if (!Object.hasOwn(ART, kind)) throw new Error("Unknown journey event illustration.");
  return ART[kind].trimEnd().replace(/^\n/, "");
}
