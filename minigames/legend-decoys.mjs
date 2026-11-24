export function decoyLever(seed, room) {
  return Object.freeze({ x: 448, y: 112, kind: (seed + Math.floor(room / 2)) % 2 ? "trap" : "mistake" });
}

export const DECOY_COPY = {
  en: {
    name: "Lever", examine: "Examine", operate: "Pull", spent: "The lever no longer moves.",
    description: "An old lever set into the wall.",
    mistake: "A hidden counterweight jams. You recover the mechanism after a tiring delay.",
    trap: "The lever releases a concealed dart!",
    help: "Some optional levers have unexpected consequences, without warning marks. A faulty mechanism costs 2 minutes and 1 fatigue; a concealed dart applies the normal trap penalty. Each lever fires only once per attempt, even after retries or revisits. Essential items and the route remain intact.",
  },
  fr: {
    name: "Levier", examine: "Observer", operate: "Tirer", spent: "Le levier ne bouge plus.",
    description: "Un vieux levier encastré dans le mur.",
    mistake: "Un contrepoids caché se bloque. Vous rétablissez le mécanisme après un délai fatigant.",
    trap: "Le levier libère une fléchette dissimulée !",
    help: "Certains leviers facultatifs ont des conséquences inattendues, sans marque d'avertissement. Un mécanisme défaillant coûte 2 minutes et 1 fatigue ; une fléchette cachée applique la pénalité habituelle d'un piège. Chaque levier agit une seule fois par tentative, même après un nouvel essai ou une revisite. Les objets essentiels et le passage restent intacts.",
  },
};
