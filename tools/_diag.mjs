import "./harness.mjs";
const { store, bike } = await import("../src/core/store.js");
const { startGame, update } = await import("../src/game/game.js");
const { DT } = await import("../src/config/constants.js");
startGame("race", 0);
console.log("mode", store.mode, "state", store.state, "fmt", store.raceFormat,
  "racers", store.racers.length, "raceAI", !!store.raceAI,
  "finishX", store.finishX, "ai.x", store.raceAI && store.raceAI.x);
let t = 0;
while (t < 60 && store.state === "play") {
  if (bike.locked) { (await import("../src/core/input.js")).key.right = true; }
  update(DT); t += DT;
  if (Math.abs(t % 2) < DT) console.log("t=" + t.toFixed(2), "playerX=" + ((bike.rear.x+bike.front.x)/2).toFixed(0),
    "ai.x=" + (store.raceAI ? store.raceAI.x.toFixed(0) : "-"), "ai.spd=" + (store.raceAI ? store.raceAI.spd.toFixed(0) : "-"),
    "finish=" + store.raceAI && store.raceAI.finish, "state=" + store.state);
}
console.log("end t=" + t.toFixed(2), "state", store.state, "playerX", ((bike.rear.x+bike.front.x)/2).toFixed(0), "finishX", store.finishX);
