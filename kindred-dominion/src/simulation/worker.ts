import { runSimulation } from "./run";
import type { SimulationRequest } from "./types";
let cancelled = false;
let running = false;
self.onmessage = async (
  event: MessageEvent<
    { type: "run"; request: SimulationRequest } | { type: "cancel" }
  >,
) => {
  if (event.data.type === "cancel") {
    cancelled = true;
    return;
  }
  if (running) {
    self.postMessage({
      type: "error",
      error: "A simulation is already running.",
    });
    return;
  }
  running = true;
  cancelled = false;
  try {
    const report = await runSimulation(event.data.request, {
      cancelled: () => cancelled,
      progress: (report, total) =>
        self.postMessage({ type: "progress", report, total }),
      yield: () => new Promise((resolve) => setTimeout(resolve, 0)),
    });
    self.postMessage({ type: "done", report });
  } catch (error) {
    self.postMessage({
      type: "error",
      error: error instanceof Error ? error.message : String(error),
    });
  } finally {
    running = false;
  }
};
