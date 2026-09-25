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
  var started=false, frozen=false, tries=0, lastErr="";
  function loop(){
    try{
      if(!started){
        tries++;
        try{
          startGame("level",lv);
          started=(state==="play");
        }catch(e){ lastErr=e.message; }
      }
      if(started && !frozen){
        key.right=true;
        if(state==="play"&&bike.grounded===0&&airTime>0.25&&Math.abs(bike.rotAcc)>0.4){
          frozen=true; state="ended"; document.title="FROZEN";
        }
      }
      if(tries>600&&!started){ frozen=true; state="ended"; document.title="GIVEUP:"+lastErr; }
    }catch(e){}
    requestAnimationFrame(loop);
  }
  requestAnimationFrame(loop);
})();
</script>
`;

fs.writeFileSync(path.join(root, "_shot.html"), html.replace("</body>", inject + "</body>"));

const EDGE = "C:\\Program Files (x86)\\Microsoft\\Edge\\Application\\msedge.exe";
const variants = [
  { lv: 4, name: "snow" },
  { lv: 7, name: "moon" },
  { lv: 13, name: "desert" },
  { lv: 0, name: "green" },
];

for (const v of variants) {
  const out = path.join(root, "_cap_" + v.name + ".png");
  if (fs.existsSync(out)) fs.unlinkSync(out);
  spawnSync(EDGE, [
    "--headless=new",
    "--disable-gpu",
    "--hide-scrollbars",
    "--no-first-run",
    "--no-default-browser-check",
    "--user-data-dir=" + path.join(root, "_edgeprofile2"),
    "--window-size=1280,720",
    "--virtual-time-budget=30000",
    "--screenshot=" + out,
    "http://127.0.0.1:8123/_shot.html?lv=" + v.lv + "&r=" + Date.now(),
  ], { timeout: 120000 });
  console.log(v.name, fs.existsSync(out) ? "OK " + fs.statSync(out).size + "B" : "FAIL");
}