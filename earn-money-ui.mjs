import { choiceAvailable } from "./survival-choices.mjs";
import { cafeVenues } from "./cafe.mjs";
import { setFeedback } from "./feedback.mjs";
import { JOURNEY_MINI_GAMES, journeyMiniGameOffer } from "./journey-mini-games.mjs";

export function earningOptions(cell) {
  return {
    beg: choiceAvailable("beg", cell), steal: choiceAvailable("steal", cell),
    music: Boolean(cell && !cell.unavailable && cell.terrain === "place"),
    cafe: cafeVenues(cell).length > 0,
  };
}

export function setupEarnMoney(t, { context, perform, steal, miniGames }) {
  const dialog = document.querySelector("#earn-money-dialog");
  const gameChoices = new Map();
  if (miniGames) {
    const list = document.createElement("ul");
    list.id = "journey-game-options";
    for (const game of JOURNEY_MINI_GAMES) {
      const item = document.createElement("li");
      const button = document.createElement("button");
      button.type = "button";
      const terms = document.createElement("p");
      item.append(button, terms);
      list.append(item);
      gameChoices.set(game, { item, button, terms });
      button.addEventListener("click", () => {
        const current = context();
        if (!current || current.blocked || !miniGames.available(game)) return;
        try {
          dialog.close();
          miniGames.open(game);
        } catch (reason) {
          console.error("Unable to open journey mini-game:", reason);
          dialog.showModal();
          const failure = document.querySelector("#earn-money-error");
          failure.textContent = t("journeyGameError", { error: reason.message });
          setFeedback(failure, "failure");
        }
      });
    }
    document.querySelector("#earn-money-save").before(list);
  }
  let attempted = false;
  function localize() {
    const current = context();
    const options = current ? earningOptions(current.cell) : {};
    for (const id of ["#open-earn-money", "#town-earn-money", "#cell-earn-money"]) {
      document.querySelector(id).disabled = !current || current.blocked;
    }
    for (const [kind, available] of Object.entries(options)) {
      document.querySelector(`#earn-${kind}`).hidden = !available;
    }
    let gamesAvailable = false;
    for (const [game, controls] of gameChoices) {
      const available = miniGames.available(game);
      controls.item.hidden = !available;
      controls.button.disabled = !available;
      if (!available) continue;
      gamesAvailable = true;
      const offer = journeyMiniGameOffer(current.state, game, current.cell, current.info, current.data);
      controls.button.textContent = t(`journeyGame.${game}`);
      const money = new Intl.NumberFormat(document.documentElement.lang, { style: "currency", currency: "EUR" });
      controls.terms.textContent = t(offer.pointRewardCents === null ? "journeyGameTerms" : "journeyGamePointTerms", {
        minutes: offer.minutes, fatigue: offer.fatigue,
        reward: money.format((offer.pointRewardCents ?? offer.baseMaxRewardCents) / 100),
      });
    }
    document.querySelector("#earn-money-empty").hidden = Object.values(options).some(Boolean) || gamesAvailable;
    document.querySelector("#earn-money-save").textContent = current?.saveStatus ?? "";
    if (attempted) {
      const source = document.querySelector("#survival-choice-result");
      const error = document.querySelector("#survival-choice-error").textContent;
      const result = document.querySelector("#earn-money-result");
      result.textContent = source.textContent;
      setFeedback(result, source.dataset.feedback);
      const failure = document.querySelector("#earn-money-error");
      failure.textContent = error;
      setFeedback(failure, error ? "failure" : "");
    } else if (current?.state.lastJourneyMiniGame) {
      const result = current.state.lastJourneyMiniGame;
      const feedback = document.querySelector("#earn-money-result");
      feedback.textContent = t("journeyGameResult", { game: t(`journeyGame.${result.game}`),
        score: result.score, max: result.maxScore,
        reward: new Intl.NumberFormat(document.documentElement.lang,
          { style: "currency", currency: "EUR" }).format(result.rewardCents / 100) });
      setFeedback(feedback, result.completed ? "success" : "");
    }
  }
  function open() {
    const current = context();
    if (!current || current.blocked || document.querySelector("dialog[open]")) return;
    attempted = false;
    document.querySelector("#earn-money-result").textContent = "";
    document.querySelector("#earn-money-error").textContent = "";
    dialog.showModal();
    localize();
  }
  document.querySelector("#open-earn-money").addEventListener("click", open);
  for (const [id, parent] of [
    ["#town-earn-money", "#town-dialog"], ["#cell-earn-money", "#survival-choices-dialog"],
  ]) {
    document.querySelector(id).addEventListener("click", () => {
      document.querySelector(parent).close();
      open();
    });
  }
  for (const kind of ["beg", "steal"]) {
    document.querySelector(`#choice-${kind}`).addEventListener("click", () => {
      const current = context();
      if (!current || current.blocked || !earningOptions(current.cell)[kind]) return;
      if (kind === "steal") return steal();
      attempted = true;
      perform(kind);
      localize();
      const target = document.querySelector(document.querySelector("#earn-money-error").textContent
        ? "#earn-money-error" : "#earn-money-result");
      target.focus({ preventScroll: true });
      target.scrollIntoView({ block: "nearest" });
      if (context()?.state.ended) dialog.close();
    });
  }
  return { localize, open, reset() { attempted = false; dialog.close(); } };
}
