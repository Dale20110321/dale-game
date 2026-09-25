const fs = require("fs");
const path = require("path");
const { spawnSync } = require("child_process");

const root = __dirname;
const html = fs.readFileSync(path.join(root, "index.html"), "utf8");

const inject = `
<script>
(function(){
  var q=new URLSearchParams(location.search);
  var lv=parseInt(q.get("lv")||"7",10);
  var frozen=false;
  window.addEventListener("load",function(){setTimeout(function(){
    try{
      startGame("level",lv);
      window.dispatchEvent(new KeyboardEvent("keydown",{code:"ArrowRight",key:"ArrowRight"}));
    }catch(e){document.title="ERR "+e.message;}
  },60);});
  function tick(){
    if(!frozen&&state==="play"&&bike.grounded===0&&airTime>0.30&&Math.abs(bike.rotAcc)>0.35){
      frozen=true;state="ended";
      document.title="FROZEN";
    }
    requestAnimationFrame(tick);
  }
  requestAnimationFrame(tick);
})();
</script>
`;

fs.writeFileSync(path.join(root, "_shot.html"), html.replace("</body>", inject + "</body>"));

const EDGE = "C:\\Program Files (x86)\\Microsoft\\Edge\\Application\\msedge.exe";
const variants = [
  { lv: 0, name: "lv01_green" },
  { lv: 4, name: "lv05_snow" },
  { lv: 7, name: "lv08_moon" },
  { lv: 13, name: "lv14_desert" },
];

for (const v of variants) {
  const out = path.join(root, "_shot_" + v.name + ".png");
  if (fs.existsSync(out)) fs.unlinkSync(out);
  spawnSync(EDGE, [
    "--headless=new",
    "--disable-gpu",
    "--hide-scrollbars",
    "--no-first-run",
    "--no-default-browser-check",
    "--user-data-dir=" + path.join(root, "_edgeprofile"),
    "--window-size=1280,720",
    "--virtual-time-budget=20000",
    "--screenshot=" + out,
    "http://127.0.0.1:8123/_shot.html?lv=" + v.lv,
  ], { timeout: 120000 });
  console.log(v.name, fs.existsSync(out) ? "OK " + fs.statSync(out).size + "B" : "FAIL");
}