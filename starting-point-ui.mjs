import { createTrail } from "./trail.mjs";

export function validateStartingMap(map) {
  createTrail(map, Math.floor(map.width / 2), Math.floor(map.height / 2), () => 0);
}

export async function locatePosition(geolocation, signal, onRetry) {
  function attempt(options) {
    return new Promise((resolve, reject) => {
      signal.throwIfAborted();
      const abort = () => reject(signal.reason);
      const finish = callback => value => {
        signal.removeEventListener("abort", abort);
        callback(value);
      };
      signal.addEventListener("abort", abort, { once: true });
      try {
        geolocation.getCurrentPosition(finish(resolve), finish(reject), options);
      } catch (error) {
        finish(reject)(error);
      }
    });
  }
  try {
    return await attempt({ enableHighAccuracy: false, timeout: 20_000, maximumAge: 60_000 });
  } catch (error) {
    if (signal.aborted || ![2, 3].includes(error.code)) throw error;
    onRetry(error);
    return attempt({ enableHighAccuracy: true, timeout: 60_000, maximumAge: 60_000 });
  }
}

export async function placeRequest(path, parameters, signal, fetcher = fetch) {
  const response = await fetcher(`${path}?${new URLSearchParams(parameters)}`, {
    signal: AbortSignal.any([signal, AbortSignal.timeout(30_000)]),
  });
  if (!(response.headers.get("content-type") ?? "").includes("application/json")) {
    throw new Error("The local travel server is required for starting-place lookup.");
  }
  const data = await response.json();
  if (!response.ok) throw new Error(data.error ?? `Starting place: HTTP ${response.status}`);
  return { pending: response.status === 202, data };
}

export function setupStartingPoint(t, { select, addOrigin, setPreparing }) {
  const form = document.querySelector("#place-search");
  const input = document.querySelector("#place-name");
  const results = document.querySelector("#place-results");
  const status = document.querySelector("#place-status");
  const locate = document.querySelector("#use-location");
  const cancel = document.querySelector("#cancel-place");
  let controller, statusKey = "", detail = "", busy = false, matches = [];
  let selectionPending = false;

  function localize() {
    status.textContent = statusKey ? t(statusKey, { error: detail }) : "";
    form.querySelector("button").disabled = locate.disabled = input.disabled = busy;
    cancel.hidden = !busy && !selectionPending;
    results.querySelectorAll("button").forEach(button => { button.disabled = busy; });
  }
  function reset() {
    controller?.abort();
    controller = undefined;
    busy = false;
    selectionPending = false;
    setPreparing(false);
    statusKey = detail = "";
    matches = [];
    results.replaceChildren();
    localize();
  }
  async function run(key, work) {
    controller?.abort();
    const request = new AbortController();
    controller = request;
    busy = true;
    setPreparing(true);
    statusKey = key;
    detail = "";
    localize();
    try {
      await work(request.signal);
    } catch (error) {
      if (request.signal.aborted) return;
      console.error("Starting-point selection failed:", error);
      statusKey = "placeError";
      detail = error.message;
    } finally {
      if (controller === request && !request.signal.aborted) {
        busy = false;
        setPreparing(selectionPending);
        localize();
      }
    }
  }
  async function choose(place, signal) {
    statusKey = "placePreparing";
    localize();
    let result;
    const deadline = Date.now() + 15 * 60_000;
    do {
      if (Date.now() > deadline) throw new Error(t("placeTimeout"));
      result = await placeRequest("/api/origin", {
        latitude: place.latitude, longitude: place.longitude,
      }, signal);
      if (result.pending) await new Promise((resolve, reject) => {
        const abort = () => { clearTimeout(timer); reject(signal.reason); };
        const timer = setTimeout(() => {
          signal.removeEventListener("abort", abort);
          resolve();
        }, 1000);
        signal.addEventListener("abort", abort, { once: true });
      });
    } while (result.pending);
    if (signal.aborted) return;
    const { region, map } = result.data;
    // Never start a partially generated journey where the existing story cannot run.
    validateStartingMap(map);
    await select(region, map);
    selectionPending = false;
    matches = [];
    statusKey = "placeReady";
    results.replaceChildren();
  }
  form.addEventListener("submit", event => {
    event.preventDefault();
    if (busy || !form.reportValidity()) return;
    selectionPending = true;
    results.replaceChildren();
    run("placeSearching", async signal => {
      const { data } = await placeRequest("/api/places", { q: input.value.trim() }, signal);
      if (signal.aborted) return;
      matches = data;
      results.replaceChildren();
      matches.forEach(place => {
        const li = document.createElement("li");
        const button = document.createElement("button");
        button.type = "button";
        button.textContent = place.name;
        button.addEventListener("click", () => {
          if (!busy) run("placePreparing", signal => choose(place, signal));
        });
        li.append(button);
        results.append(li);
      });
      statusKey = matches.length ? "placeChoose" : "placeNoResults";
    });
  });
  locate.addEventListener("click", () => {
    if (busy) return;
    selectionPending = true;
    run("placeLocating", async signal => {
      if (!navigator.geolocation) throw new Error(t("placeNoGeolocation"));
      let position;
      try {
        position = await locatePosition(navigator.geolocation, signal, error => {
          console.warn("Initial location unavailable; retrying with high accuracy:", error.code);
          statusKey = "placeLocatingRetry";
          localize();
        });
      } catch (error) {
        if ([1, 2, 3].includes(error.code)) throw new Error(t(`placeGeoError.${error.code}`));
        throw error;
      }
      if (signal.aborted) return;
      await choose({ latitude: position.coords.latitude, longitude: position.coords.longitude }, signal);
    });
    cancel.addEventListener("click", () => {
      reset();
      statusKey = "placeCancelled";
      localize();
    });
  });
  async function loadOrigins() {
    try {
      const { data } = await placeRequest("/api/origins", {}, AbortSignal.timeout(5000));
      data.forEach(addOrigin);
    } catch (error) {
      console.error("Saved starting points unavailable:", error);
      if (!statusKey) {
        statusKey = "placeError";
        detail = error.message;
        localize();
      }
    }
  }
  loadOrigins();
  return { localize, reset };
}
