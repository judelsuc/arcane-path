export function setFeedback(element, outcome = "") {
  element.dataset.feedback = outcome;
}

export function focusFeedback(element) {
  const details = element.closest?.(".technical-details");
  const target = details && !details.open ? details.querySelector("summary") : element;
  if (details && !element.hidden && element.textContent.trim()) details.hidden = false;
  target.focus({ preventScroll: true });
  target.scrollIntoView({ block: "nearest" });
}

export function setGenerating(element, pending) {
  element.role = "status";
  element.ariaBusy = String(Boolean(pending));
}
