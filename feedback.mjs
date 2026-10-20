export function setFeedback(element, outcome = "") {
  element.dataset.feedback = outcome;
}

export function setGenerating(element, pending) {
  element.role = "status";
  element.ariaBusy = String(Boolean(pending));
}
