import type { BattleFrame, SimWorkerResponse } from "../types/protocol";

export function renderApp(root: HTMLElement): void {
  root.innerHTML = `
    <section class="workbench">
      <aside class="panel">
        <h1>Robolocks</h1>
        <button id="run">Run Preset Duel</button>
        <pre id="log"></pre>
      </aside>
      <section class="battlefield" id="battlefield"></section>
    </section>
  `;

  const log = root.querySelector<HTMLPreElement>("#log");
  const battlefield = root.querySelector<HTMLElement>("#battlefield");
  const run = root.querySelector<HTMLButtonElement>("#run");

  if (!log || !battlefield || !run) {
    throw new Error("Workbench elements were not created");
  }

  const worker = new Worker(new URL("../sim/simWorker.ts", import.meta.url), {
    type: "module",
  });

  worker.onmessage = (event: MessageEvent<SimWorkerResponse>) => {
    if (event.data.type === "battleFrame" || event.data.type === "battleComplete") {
      drawFrame(battlefield, event.data.type === "battleFrame" ? event.data.frame : event.data.finalFrame);
      log.textContent = JSON.stringify(event.data, null, 2);
    }
  };

  run.addEventListener("click", () => {
    worker.postMessage({ type: "runPresetDuel", ticks: 120 });
  });
}

function drawFrame(container: HTMLElement, frame: BattleFrame): void {
  container.innerHTML = "";
  for (const unit of frame.units) {
    const node = document.createElement("div");
    node.className = "tank";
    node.textContent = unit.name;
    node.style.left = `${unit.position.x * 8 + 40}px`;
    node.style.top = `${unit.position.y * 8 + 40}px`;
    container.appendChild(node);
  }
}
