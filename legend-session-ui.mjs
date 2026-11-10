import { mount } from "./minigames/legend-adventure-ui.mjs";
import { GENERATED_INVESTIGATION_VERSION, isDungeonSession, isLocalLegendSession, isPlatformSession,
  isTreasureSession, createLocalLegendAttempt, stepLocalLegendAttempt, MAX_PLATFORM_PACKETS } from "./legend-session.mjs";
import { effectiveAdventureCosts, treasureEquipment } from "./legend-rewards.mjs";

const WORDS = {
  en: { title: "Authored investigation trial", resume: "Load adventure",
    generatedTitle: "Generated investigation trial (real costs, no reward)",
    dungeonTitle: "Dungeon trial (real costs, no treasure)", dungeonLeave: "Leave dungeon (no refund)",
    dungeonCompleted: "Dungeon complete. No item or money awarded.",
    dungeonLeft: "Dungeon left. Costs retained.",
    dungeonInterrupted: "Dungeon interrupted by the journey's survival rules. Costs retained.",
    leave: "Leave investigation (no refund)", active: "Progress and costs are saved after each action. Closing this window does not leave the adventure.",
    completed: "Investigation complete. No item or money awarded.", left: "Investigation left. Costs retained.",
    interrupted: "Investigation interrupted by the journey's survival rules. Costs retained." },
  fr: { title: "Essai d'enquête écrite", resume: "Charger l'aventure",
    generatedTitle: "Essai d'enquête procédurale (coûts réels, sans récompense)",
    dungeonTitle: "Essai de donjon (coûts réels, sans trésor)", dungeonLeave: "Quitter le donjon (sans remboursement)",
    dungeonCompleted: "Donjon terminé. Aucun objet ni argent attribué.",
    dungeonLeft: "Donjon quitté. Coûts conservés.",
    dungeonInterrupted: "Donjon interrompu par les règles de survie du voyage. Coûts conservés.",
    leave: "Quitter l'enquête (sans remboursement)", active: "La progression et les coûts sont enregistrés après chaque action. Fermer cette fenêtre ne quitte pas l'aventure.",
    completed: "Enquête terminée. Aucun objet ni argent attribué.", left: "Enquête quittée. Coûts conservés.",
    interrupted: "Enquête interrompue par les règles de survie du voyage. Coûts conservés." },
};

export function setupLegendSession({ host = document.getElementById("quests-legend-session"), request } = {}) {
  let game, key, owner, focusTarget, attempt;
  const dialog = host.closest?.("#legend-game-dialog");
  let active = false;
  dialog?.addEventListener("cancel", event => {
    if (active) event.preventDefault();
  });
  function clear() { game?.destroy(); game = undefined; host.replaceChildren(); }
  function reset() { clear(); active = false; dialog?.close(); key = owner = focusTarget = attempt = undefined; }
  return {
    reset,
    render({ state, session, rewardResult, blocked, pending, language, runtime, startRevision, error }) {
      const next = JSON.stringify([state?.serverJourney?.id, state?.artifactRevision, state?.legendAdventure,
        session?.runId, session?.status, blocked, pending, language, error]);
      if (key === next) return;
      if (owner !== state?.serverJourney?.id) reset();
      owner = state?.serverJourney?.id;
      const doc = host.ownerDocument;
      if (host.contains?.(doc?.activeElement) && doc.activeElement.dataset?.legendAction) {
        focusTarget = doc.activeElement.dataset.legendAction;
      }
      clear();
      key = next;
      active = Boolean(state?.legendAdventure || session?.status === "active");
      if (!active && !session) { dialog?.close(); return; }
      if (active && dialog && !dialog.open) {
        for (const other of doc.querySelectorAll("dialog[open]")) if (other !== dialog) other.close();
        dialog.showModal();
      }
      const c = WORDS[language];
      const dungeon = isDungeonSession(session?.contentVersion);
      const local = isLocalLegendSession(session?.contentVersion);
      const platform = isPlatformSession(session?.contentVersion);
      const text = (tag, content) => {
        const node = doc.createElement(tag); node.textContent = content; host.append(node); return node;
      };
      const button = (label, action) => {
        const node = text("button", label); node.type = "button"; node.disabled = blocked || pending;
        node.addEventListener("click", () => { void request(action); });
      };
      if (!active && dialog) {
        const back = text("button", language === "fr" ? "Retour au voyage" : "Back to the journey");
        back.type = "button";
        back.addEventListener("click", () => dialog.close());
      }
      if (error) {
        text("p", error).setAttribute("role", "alert");
        button(language === "fr" ? "Réessayer la commande" : "Retry command", null);
      }
      const treasure = isTreasureSession(session?.contentVersion);
      if (!treasure || !active) text("h3", treasure ? language === "fr" ? "À la recherche du trésor" : "Seeking the treasure" :
        platform ? language === "fr" ? "Essai de plateformes (coûts réels, sans trésor)" :
        "Platform trial (real costs, no treasure)" :
        dungeon ? c.dungeonTitle : local || session?.contentVersion === GENERATED_INVESTIGATION_VERSION ? c.generatedTitle : c.title);
      if (!session) {
        button(c.resume, null);
        return;
      }
      if (local) {
        const fr = language === "fr";
        const active = session.status === "active";
        const jewel = treasureEquipment(state).jewel;
        if (active && !attempt && startRevision === state.artifactRevision) {
          attempt = { runId: session.runId, simulation: createLocalLegendAttempt(session, { ...runtime, state }),
            actions: [], settling: false };
        }
        const helpText = [fr
          ? "Jeu local. Coûts et nourriture validés en terminant ou en quittant. Recharger abandonne les effets non validés et impose une nouvelle entrée payante."
          : "Local gameplay. Costs and food settle on completion or leaving. Reload discards unfinished effects and requires another paid entry.",
          ...(jewel ? [jewel.effect[language]] : [])];
        if (!active) {
          attempt = undefined;
          const outcome = session.status === "interrupted"
            ? fr ? "Essai interrompu par les règles de survie du voyage." : "Attempt interrupted by the journey's survival rules."
            : session.status === "completed" ? fr ? "Aventure terminée." : "Adventure complete."
              : fr ? "Aventure quittée." : "Adventure left.";
          text("p", `${session.town} — ${outcome} ${treasure ? "" : fr ? "Coûts conservés. Aucun trésor attribué." :
            "Costs retained. No treasure awarded."}`).setAttribute("role", "status");
          if (treasure) {
            const costs = effectiveAdventureCosts(state, session.costs);
            text("p", fr
              ? `Coûts conservés : ${costs.minutes} min, ${costs.fatigue} fatigue, ${costs.health} santé perdue, ${costs.dirt} saleté. Survie habituelle en supplément.`
              : `Charges retained: ${costs.minutes} min, ${costs.fatigue} fatigue, ${costs.health} health lost, ${costs.dirt} dirt. Normal survival also applies.`);
            if (rewardResult) {
              text("p", rewardResult.outcome === "collected"
                ? fr ? "Trésor ajouté au sac." : "Treasure added to your bag."
                : rewardResult.outcome === "left" ? fr ? "Sac plein : le trésor attend à l'entrée." : "Bag full: the treasure waits at the entrance."
                  : fr ? "Le trésor a déjà été retrouvé par un autre explorateur." : "Another explorer has already recovered the treasure.");
              if (rewardResult.stash) text("p", fr
                ? `Caches rapportées : ${(rewardResult.stash.cents / 100).toFixed(2)} €, +${Math.round(rewardResult.stash.foodKcal)} kcal.`
                : `Stashes carried out: €${(rewardResult.stash.cents / 100).toFixed(2)}, +${Math.round(rewardResult.stash.foodKcal)} kcal.`);
            }
          }
          return;
        }
        if (!attempt) {
          text("p", fr ? "Progression abandonnée au rechargement. L'entrée précédente reste payée." :
            "Progress discarded on reload. The previous entry remains paid.").setAttribute("role", "status");
          const entry = effectiveAdventureCosts(state, { minutes: 3, fatigue: 1, health: 0, dirt: 1 });
          button(fr ? `Recommencer depuis l'entrée (${entry.minutes} min, ${entry.fatigue} fatigue, 1 saleté)` :
            `Restart from entrance (${entry.minutes} min, ${entry.fatigue} fatigue, 1 dirt)`, { type: "legend-restart", runId: session.runId });
          button(fr ? "Quitter sans recommencer" : "Leave without restarting",
            { type: "legend-finish", runId: session.runId, actions: [] });
          return;
        }
        const current = attempt;
        const settle = () => {
          if (current.settling) return;
          current.settling = true;
          void request({ type: "legend-finish", runId: session.runId, actions: structuredClone(current.actions) });
        };
        game = mount(host, { format: platform ? "platform" : dungeon ? "dungeon" : "investigation",
          language, seed: session.seed, helpText, onFinish: () => { queueMicrotask(settle); },
          leaveLabel: fr ? "Quitter et valider les coûts" : "Leave and settle costs",
          onLeave: () => { current.settling = false; settle(); },
          onError: error => { console.error("Local legend adventure failed:", error); },
          authoritative: { contentVersion: session.contentVersion, local: true,
            costModifier: costs => effectiveAdventureCosts(state, costs),
            weapon: session.weapon, health: current.simulation.state.health, foodKcal: current.simulation.foodKcal,
            actions: current.actions, status: current.simulation.interrupted ? "interrupted" :
              current.simulation.progress.completed ? "completed" : "active",
            disabled: blocked || pending || current.settling,
            onAction(input) {
              const last = current.actions.at(-1);
              const merge = platform && last?.ticks < 60 && JSON.stringify(last.controls) === JSON.stringify(input.controls);
              if (platform && !merge && current.actions.length >= MAX_PLATFORM_PACKETS) {
                throw new Error("Adventure input limit reached. Leave to settle this attempt.");
              }
              current.simulation = stepLocalLegendAttempt(current.simulation, input);
              if (merge) last.ticks += input.ticks;
              else current.actions.push(structuredClone(input));
              return current.simulation;
            },
          } });
        if (!blocked && !pending) host.querySelector?.("canvas")?.focus();
        return;
      }
      const sessionText = dungeon && session.status !== "active"
        ? c[{ completed: "dungeonCompleted", left: "dungeonLeft", interrupted: "dungeonInterrupted" }[session.status]]
        : c[session.status];
      text("p", session.status === "active" ? session.town : `${session.town} — ${sessionText}`).setAttribute("role", "status");
      if (session.status === "active") button(dungeon ? c.dungeonLeave : c.leave, { type: "legend-leave", runId: session.runId });
      game = mount(host, { format: dungeon ? "dungeon" : "investigation", language, seed: session.seed, helpText: [c.active], authoritative: {
        costModifier: costs => effectiveAdventureCosts(state, costs),
        contentVersion: session.contentVersion,
        weapon: session.weapon, health: state.health,
        foodKcal: session.foodKcal,
        actions: session.actions, status: session.status, disabled: blocked || pending,
        onAction: input => { void request({ type: "legend-input", runId: session.runId, input }); },
      } });
      if (focusTarget && !blocked && !pending && doc.activeElement === doc.body) {
        const target = host.querySelector(`[data-legend-action="${focusTarget}"]`);
        if (target && !target.hidden && !target.disabled) target.focus();
        else (host.querySelector('button[aria-current="location"]:not([disabled])') ??
          host.querySelector('button[data-legend-action="next"]:not([disabled])') ??
          host.querySelector('button[data-legend-action="up"]:not([disabled])') ??
          host.querySelector('.legend-actions button:not([hidden]):not([disabled])'))?.focus();
        focusTarget = undefined;
      }
    },
  };
}
