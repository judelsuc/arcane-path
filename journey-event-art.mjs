const ART = Object.freeze({
  dogFindsFood: String.raw`
        __       .-.
   ____/ o) --> (===)
  /      /       '-'
  |_/|_|    . . . .
`,
  dogRestSpot: String.raw`
      /\        /\   __
     /  \  o       (o \__
    /____\/|\   ___/  __/
      ||  / \  |_/|_|
`,
  dogMakesFriend: String.raw`
    o     <3      o
   /|\     __    /|\
   / \   (o  \___/ \
  _______/  ___)_____
        |_| |_|
`,
  dogTangled: String.raw`
       o       __
      /|\----(o  \__
      / \  @--/ ___/
  __________|_|_|____
`,
  dogChasesScent: String.raw`
   o       ?   . . .
  /|\         __
  / \  -->  (o  \___
  _________/  ___)___
          |_| |_|
`,
  dogStealsSnack: String.raw`
     o     !
    /|\         __
    / \  [ ]  (o  \__(=)
  ____________/  ___/
             |_| |_|
`,
  dogPlays: String.raw`
       .   (o)   .
            __
   o      (o  \___
  /|\____/    ___)
  / \   /_/  /_/
`,
  dogKeepsCompany: String.raw`
        *         .
    o        __
   /|\     (o  \__
   / \_____/  ___/
  ________|_|_|______
`,
  dogEncounter: String.raw`
     o
    /|\                __
    / \     . .  .    (o \___
   /   \             /   ___)
  ___________ . . __/  /______
                  |_|  |_|
`,
  food: String.raw`
      o                 o
     /|\__  (====)  __/|\
     / \               / \
    /   \             /   \
  __________________________
`,
  coins: String.raw`
              (o)  (o)
      o         (o)        o
     /|\___  .   .   ___/|\
     / \                 / \
    /   \               /   \
  ____________________________
`,
  encouragement: String.raw`
     .------.    .------.
    (  :)  ! )  (  <3 *  )
     '---. /      \ .---'
          o        o
         /|\  +1  /|\
         / \      / \
`,
  waterBreak: String.raw`
            .  '  .
          '  \ | /  '
     o     ___\|/___     o
    /|\   |_________|   /|\
    / \    \_______/    / \
  ___________|___|__________
`,
  catNap: String.raw`
                       Z
                    z
          (-_-)====\ z
   ______________________
    ||                ||
    ||                ||
`,
  clearHead: String.raw`
  ~ ~ ~ ~          \ | /
   ~ ~ ~ ~       -- (O) --
     ~ ~ ~           / | \
        o    ( ! )   o
       /|\  <---->  /|\
       / \          / \
`,
  tailwind: String.raw`
  ~~~~~>              o
     ~~~~~~>         /|\_
  ~~~~~>             _|
     ~~~~~~>        /  \
  ____________________________
`,
  bandage: String.raw`
      o                  o
     /|\__  [==+==]  __/|\
     / \                 |\
    /   \               / x
  ____________________________
`,
  picnic: String.raw`
       o      o      o
      /|\    /|\    (|)   ___
   ___/_\____/_\____/_\__|___|
  /  #   #   #   #   #   #   \
 /_#___#___#___#___#___#___#__\
     .   .   .   .   .   .
`,
  friendlyAdvice: String.raw`
     ___
    (:-)      1 . 2 . 1 . 2
    /|\-->          o
   / | \           /|\
    / \            / \
  ____________=====>=====>=====
`,
  delay: String.raw`
     .-------.      .--.  .--.
    /   12    \     |  |~~|  |
   |     |     |   .'--'--'--'.
   |     '--3  |   |   ____   |
    \    6    /    |  |____|  |
     '-------'     '----------'
`,
  lostCoins: String.raw`
          o
         /|\
        (_|_)
         / \ o
        /   \ .o
  ____________ o__o_____
`,
  strain: String.raw`
            o  !
           /|\/
           /\
          /  \__
   ______/_@____\________
`,
  tornBag: String.raw`
       .--------.
      /   ____   \
     |   /\/\/    |
     |__/      \__|
          o  @  .
   ~~~~~~~o~~~@~~~~~~~~
`,
  restlessThoughts: String.raw`
     .-~~~~~~~~~~-.
    (   o    -->   )
    (  /|\   <--   )
     '-~~~~~~~~~~-'
           o O
         (o_o)
          /|\
          / \
`,
  headwind: String.raw`
          o      <~~~~~~
        _/|\    <~~~~~~~~
          |\     <~~~~~~
         /  \  <~~~~~~~
  ____________________________
`,
  blisters: String.raw`
               ___
              |   |
          *   |   |
        ______|   |
       /  (O)     |
      (___________)
`,
  forestBoar: String.raw`
  /\     ,,  __              o!
 /  \   (oo)/  \~         __/|
  ||    (__)    |         _/ |\
  ||     |_|--|_|           /  >
 _____________________________
`,
  forestDogs: String.raw`
 /\                     o!  /\
/  \  __      __     __/|  /  \
 ||  (o \__  (o \__     /|  ||
 ||   |_|-|   |_|-|    / >  ||
 ____________________________
`,
  chills: String.raw`
      *    .    *
    ~ ~  (o_o)  ~ ~
   ~ ~  //|||\\  ~ ~
         /   \
      .    *    .
`,
  whiteDeer: String.raw`
  ||   \ Y   Y /     ||
  ||    \|___|/      ||
  ||     (o o)   .   ||
  ||  ____\_/____  ' ||
  ||  |         |    ||
  ||  ||       ||    ||
`,
  silentBell: String.raw`
          _|_
         /   \      ( ( (
        |  _  |
        | (_) |       o
        |  .  |      /|\
    ____|_____|______/_\___
`,
  impossibleShadow: String.raw`
       o      #
      /|\    /#\
      / \    / \_
  ____|_|___/___>______
`,
  repeatingStone: String.raw`
      .-->---->---->--.
      |               |
      '--<----<----.  |
        .------.   |  v
       /   @    \ <---'
      |__________|
`,
  stranger: String.raw`
      .---.
     /     \  \o         o
    |  ? ?  |  |        /|\
     \_____/            / \
      /| |\
     / |_| \
`,
  stars: String.raw`
     *---*     *---*
     |   |     |   |
     *---*     *---*
        .   *---*     .- -.
            |   |     : ? :
            *---*     '- -'
`,
  ribbon: String.raw`
  ~~>   ______________/\__
 ~~>   /      |
  ~~>         |
              8
             | |
             | |
`,
  reflection: String.raw`
          o  _
         /|\[_]
         / \
  ~~~~~~~~~~~~~~~~~~~~~~
         \ /
         \|/(@)
          o
`,
});

export function journeyEventArt(kind) {
  if (!Object.hasOwn(ART, kind)) throw new Error("Unknown journey event illustration.");
  return ART[kind].trimEnd().replace(/^\n/, "");
}
