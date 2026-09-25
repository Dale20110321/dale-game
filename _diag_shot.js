const fs = require("fs");
const path = require("path");
const { spawnSync } = require("child_process");

const root = __dirname;
const html = fs.readFileSync(path.join(root, "index.html"), "utf8");

const inject = `
<script>
window.__diag=[];
var __d=document.createElement("pre"); __d.id="__diag"; document.addEventListener("DOMContentLoaded",function(){document.body.appendChild(__d);});
function __log(s){ window.__diag.push(s); if(__d)__d.textContent=window.__diag.join("\\n"); }
window.addEventListener("load",function(){
  setTimeout(function(){
    try{ startGame("level",7); __log("startGame ok"); }catch(e){ __log("startGame ERR "+e.message); }
    try{
      window.dispatchEvent(new KeyboardEvent("keydown",{code:"ArrowRight",key:"ArrowRight"}));
      __log("dispatch ok key.right="+key.right);
    }catch(e){ __log("dispatch ERR "+e.message); }
  },60);
});
var n=0;
function tick(){
  n++;
  try{
    if(n%60===0) __log("f"+n+" t="+time.toFixed(1)+" x="+Math.round((bike.rear.x+bike.front.x)/2)+" kr="+key.right+" g="+bike.grounded+" st="+state+" v="+bike.speed.toFixed(0));
  }catch(e){ __log("tick ERR "+e.message); }
  requestAnimationFrame(tick);
}
requestAnimationFrame(tick);
</script>
`;

fs.writeFileSync(path.join(root, "_diag_shot.html"), html.replace("</body>", inject + "</body>"));

const EDGE = "C:\\Program Files (x86)\\Microsoft\\Edge\\Application\\msedge.exe";
const r = spawnSync(EDGE, [
  "--headless=new",
  "--disable-gpu",
  "--no-first-run",
  "--no-default-browser-check",
  "--user-data-dir=" + path.join(root, "_edgeprofile"),
  "--window-size=1280,720",
  "--virtual-time-budget=12000",
  "--dump-dom",
  "http://127.0.0.1:8123/_diag_shot.html",
], { timeout: 120000, encoding: "utf8" });

const dom = r.stdout || "";
const m = dom.match(/<pre id="__diag">([\s\S]*?)<\/pre>/);
console.log("DOM length:", dom.length);
console.log("DIAG:", m ? m[1].replace(/&quot;/g, '"') : "(not found)");
console.log("stderr:", (r.stderr || "").slice(0, 400));