export function weatherPanelState(celsius, condition) {
  if (celsius !== null && !Number.isFinite(celsius)) throw new Error("Invalid weather panel temperature.");
  return {
    temperature: celsius === null ? "unknown" : celsius <= 0 ? "freezing"
      : celsius < 10 ? "cold" : celsius <= 25 ? "mild" : celsius <= 30 ? "warm" : "hot",
    raining: celsius !== null && ["rain", "storm"].includes(condition) ? "true" : "false",
  };
}

export function updateWeatherPanel(panel, celsius, condition) {
  Object.assign(panel.dataset, weatherPanelState(celsius, condition));
}
