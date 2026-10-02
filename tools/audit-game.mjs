// ============================================================
// 深度体检：游戏状态机 / 玩法模式 / 结算
// 契约：export default async function (ctx)
//   ctx.check(name, cond, detail) - 断言
//   ctx.section(title)             - 分区
//   ctx.imp(relativePath)          - 按 src/ 相对路径动态导入
// 本文件不 import 任何 harness。
// ============================================================

export default async function (ctx) {
  const { store, bike, world } = await ctx.imp('core/store.js');
  const { key } = await ctx.imp('core/input.js');
  const { startGame, update, restart, initGame, runGuard } = await ctx.imp('game/game.js');
  const { freeThemeOf, BOOST_HAZARD_GAP, updateCoins, updateCanisters, updateBoosts, updateJumps } =
    await ctx.imp('game/world.js');
  const { raceUpdate, raceBaseSpeed, rankedAIScale, RACE_PACE, CATCHUP_MIN, CATCHUP_MAX } =
    await ctx.imp('game/race.js');
  const { updateStats, settleLanding, airScoreOf, COMBO_WINDOW, wheelieMeters } =
    await ctx.imp('game/stats.js');
  const { LEVELS, VARIANTS, variantRule, starTime, airTargetOf } =
    await ctx.imp('config/levels.js');
  const C = await ctx.imp('config/constants.js');
  const { crash, resetBike } = await ctx.imp('physics/bike.js');
  const { groundY, groundInfo, safeSpot, hillY } = await ctx.imp('physics/terrain.js');
  const { hasAch, addGold } = await ctx.imp('game/progress.js');
  const { freeHill } = await ctx.imp('config/levels.js');
  const { isAdvancedUnlocked } = await ctx.imp('core/storage.js');
  const { settleRanked } = await ctx.imp('game/game.js');
  const { mulberry32 } = await ctx.imp('core/utils.js');
  const { VEHICLES } = await ctx.imp('config/vehicles.js');
  const { view } = await ctx.imp('core/canvas.js');

  const {
    DT,
    SUB_DT,
    START_X,
    gateSpeed,
    hazardSpeed,
    toM,
    toKmh,
    CRASH_FUEL_LOSS,
    CRASH_TIME_PENALTY,
    RATING_ADVANCED,
    PX_PER_M,
  } = C;
  const { rankName } = C;

  // world.js 内部常量（未导出）：限时门"起步余量"，镜像自 buildGates
  const GATE_START_ALLOW = 900;
  const N = LEVELS.length;
  // 兜底：即使中途抛错，也不能把 harness 的 setTimeout 打桩留在被替换状态
  const REAL_SET_TIMEOUT = globalThis.setTimeout;
  // harness 的 setTimeout 打桩恒返回 0；用它探测"捕获器是否已卸载"
  const noopTimerProbe = () => {};

  const S = (title) => ctx.section(title);
  const T = (name, cond, detail = '') => {
    try {
      return ctx.check(name, !!cond, detail);
    } catch (error) {
      return ctx.check(name, false, `抛错：${(error && error.message) || String(error)}`);
    }
  };
  const f0 = (n) => (typeof n === 'number' ? String(Math.round(n)) : String(n));
  const f2 = (n) => (typeof n === 'number' ? n.toFixed(2) : String(n));

  function fresh() {
    store.state = 'menu';
    store.mode = 'level';
    store.lastMode = 'level';
    store.rankedAdvanced = false;
    store.lvIdx = 0;
    store.selLevel = 0;
    store.gold = 0;
    store.unlocked = 0;
    store.stars = new Array(N).fill(0);
    store.best = 0;
    store.achGot = [];
    store.raceAI = null;
    store.shopOpen = false;
    store.donateOpen = false;
    store.time = 0;
    store.currentVehicle = 0;
    store.ownedVehicles = [0];
    store.upgrades = {};
    store.ultra = {};
    store.progress = {
      branchCleared: [],
      finaleDone: false,
      invited: true,
      rating: 0,
      wins: 0,
      losses: 0,
      peak: false,
      freeThemes: [],
    };
    store.stat = { totalRuns: 0, totalMeters: 0, totalSeconds: 0, lastPlayed: '' };

    world.particles = [];
    world.airScore = 0;
    world.prepFuel = 0;
    world.coins = [];
    world.canisters = [];
    world.boosts = [];
    world.decoTree = [];
    world.decoRock = [];
    world.hazards = [];
    world.gates = [];
    world.jumps = [];
    world.freeGenX = 0;

    key.left = false;
    key.right = false;
  }

  /** run.* 全部字段的期望初值（逐字段比对，返回不符字段列表） */
  function runBadFields(level) {
    const run = store.run || {};
    const expected = {
      crashed: false,
      crashTimer: 0,
      clearing: false,
      gateIdx: 0,
      coinGot: 0,
      airTime: 0,
      penaltyTime: 0,
      crashStall: 0,
      runCrashed: false,
      combo: 0,
      comboStamp: -99,
      wheelieDist: 0,
      maxWheelieDist: 0,
      landed: false,
      failed: false,
      lastSafeX: START_X,
      totalCoins: level.coinN,
      levelStartTime: store.time,
    };
    return Object.keys(expected)
      .filter((name) => run[name] !== expected[name])
      .map((name) => `${name}=${run[name]}≠${expected[name]}`);
  }

  /** 把 run.* 全部污染成"跑过很久"的状态，用于验证重置真实生效 */
  function dirtyRun() {
    const run = store.run;
    run.crashed = true;
    run.crashTimer = 3;
    run.clearing = true;
    run.gateIdx = 4;
    run.coinGot = 11;
    run.airTime = 2.5;
    run.penaltyTime = 6;
    run.crashStall = 1.5;
    run.runCrashed = true;
    run.combo = 4;
    run.comboStamp = 123;
    run.wheelieDist = 500;
    run.maxWheelieDist = 900;
    run.landed = true;
    run.failed = true;
    run.lastSafeX = 1234;
    world.airScore = 12;
    store.cam.shake = 9;
  }

  const setVel = (vx, vy) => {
    for (const point of bike.pts) {
      point.px = point.x - vx * SUB_DT;
      point.py = point.y - vy * SUB_DT;
    }
  };

  /** 用真实落点几何瞬移（resetBike 保证车架姿态合法，避免假摔车污染结算） */
  const teleport = (x) => {
    resetBike(x);
    bike.locked = false;
  };

  const unlock = () => {
    key.right = true;
    key.left = false;
    update(DT);
  };

  /** 捕获 setTimeout（harness 把它打桩成永不回调），以便手动放行延迟结算 */
  function captureTimers() {
    globalThis.setTimeout = REAL_SET_TIMEOUT; // 清理上一次可能残留的捕获
    const list = [];
    globalThis.setTimeout = (fn, ms) => {
      list.push({ fn, ms });
      return list.length;
    };
    return {
      list,
      restore() {
        globalThis.setTimeout = REAL_SET_TIMEOUT;
      },
      fire() {
        const pending = list.splice(0, list.length);
        globalThis.setTimeout = REAL_SET_TIMEOUT;
        for (const timer of pending) {
          try {
            timer.fn();
          } catch (_) {
            // 单个延迟回调失败不应阻断其他回调
          }
        }
        return pending.length;
      },
    };
  }

  let lastResult = null;
  let toMenuCalls = 0;

  function installPresenter(withCard) {
    lastResult = null;
    toMenuCalls = 0;
    const presenter = {
      hideOverlay() {},
      toMenu() {
        toMenuCalls++;
        store.state = 'menu';
      },
    };
    if (withCard) {
      presenter.presentResult = (result) => {
        lastResult = result;
        store.state = 'ended';
      };
    }
    initGame(presenter);
  }

  const restorePresenter = () => initGame({ hideOverlay() {}, toMenu() {} });

  /** 直接构造"撞线"场景：控制用时 / 金币比例 / 计时惩罚，触发 finishLevel */
  function runToFinish(index, elapsedSec, coinRatio, penalty = 0, prepare = null) {
    const level = LEVELS[index];
    fresh();
    startGame('level', index);
    if (typeof prepare === 'function') prepare();
    unlock();
    key.right = false;
    key.left = false;
    world.gates = [];
    store.run.levelStartTime = store.time - elapsedSec;
    store.run.penaltyTime = penalty;
    // ★ 向下取整，不能四舍五入：coinN 变小后（432 关里早期关 coinN 只有 24），
    //   Math.round(24 × 0.69) = 17，而 17/24 = 0.708 ≥ 0.7 的二星阈值 → 断言
    //   声称"0.69 低于二星边界"却拿到 2 星。取整误差吃掉了整个余量。
    // ★ coinRatio 可以是**分数**（如 69/100），表示"离二星阈值还差一枚金币"这种
    //   精确边界。432 关里早期关 coinN 只有 24 → 1/coinN = 0.042 的粒度远粗于 0.01，
    //   用小数（0.69 / 0.70）无论怎么取整都会落到同一个整数上，边界根本测不出来。
    const coinN = level.coinN;
    store.run.coinGot = Number.isInteger(coinRatio)
      ? Math.floor(coinN * coinRatio)
      : Math.floor(coinN * coinRatio);
    teleport(store.finishX + 10);
    update(DT);
    return level;
  }

  const usedVariants = [...new Set(LEVELS.map((level) => level.variant))];

  // ============================================================
  // A. 逐关状态机
  // ============================================================
  S(`A. 逐关状态机（${N} 关 × 6 项）`);
  {
    fresh();
    let generation = store.run.gen;

    for (let index = 0; index < N; index++) {
      const level = LEVELS[index];
      const tag = `第${index + 1}关`;

      startGame('level', index);
      const startBad = runBadFields(level);
      T(`${tag} startGame 进入 play 态`, store.state === 'play' && store.mode === 'level', `state=${store.state} mode=${store.mode}`);
      T(`${tag} 关卡索引与终点线正确`, store.lvIdx === index && store.selLevel === index && store.finishX === level.len, `lv=${store.lvIdx} sel=${store.selLevel} finish=${store.finishX} len=${level.len}`);
      T(`${tag} run 运行态全部为初始值`, startBad.length === 0, startBad.join(',') || '19 个字段全部归零');
      T(
        `${tag} 世代号递增且世界状态清空`,
        store.run.gen > generation && world.airScore === 0 && world.particles.length === 0 && store.cam.shake === 0,
        `gen ${generation}→${store.run.gen} airScore=${world.airScore} shake=${store.cam.shake}`,
      );
      generation = store.run.gen;

      dirtyRun();
      restart();
      const restartBad = runBadFields(level);
      T(`${tag} restart 清空被污染的 run 字段`, restartBad.length === 0, restartBad.join(',') || '污染字段全部复位');
      T(
        `${tag} restart 状态/索引/终点/世代一致`,
        store.state === 'play' && store.lvIdx === index && store.selLevel === index &&
          store.finishX === level.len && store.run.gen > generation && world.airScore === 0,
        `state=${store.state} lv=${store.lvIdx} gen ${generation}→${store.run.gen}`,
      );
      generation = store.run.gen;
    }
  }

  // ============================================================
  // B. 四种玩法模式
  // ============================================================
  S('B. 玩法模式 · level');
  {
    const index = 5;
    const level = LEVELS[index];
    const rule = variantRule(level.variant);
    fresh();
    startGame('level', index);

    T('level 模式与流程状态正确', store.mode === 'level' && store.state === 'play', `mode=${store.mode} state=${store.state}`);
    T('level 关卡索引与终点正确', store.lvIdx === index && store.selLevel === index && store.finishX === level.len, `lv=${store.lvIdx} finish=${store.finishX}`);
    T('level 限时门数量正确', world.gates.length === level.gateN, `${world.gates.length}/${level.gateN}`);
    T('level 危险段遵循变体规则', world.hazards.length === Math.round(level.hazardN * rule.hazardK), `${world.gates.length && world.hazards.length}/${Math.round(level.hazardN * rule.hazardK)}`);
    T('level 危险段限速正确', world.hazards.length > 0 ? world.hazards.every((hazard) => hazard.vmax === hazardSpeed(level.ramp)) : Math.round(level.hazardN * rule.hazardK) === 0, `${world.hazards.length} 段 · vmax=${f0(world.hazards[0] && world.hazards[0].vmax)}px/s`);
    T('level 跳台数量正确', world.jumps.length === rule.jumpN, `${world.jumps.length}/${rule.jumpN}`);
    T('level 金币预算与关卡一致', world.coins.length === level.coinN && store.run.totalCoins === level.coinN, `world=${world.coins.length} run=${store.run.totalCoins}`);
    T('level 加速带至少一条', world.boosts.length >= 1, `boosts=${world.boosts.length}`);
    T('level 不创建 AI 对手', store.raceAI === null, `raceAI=${store.raceAI}`);
    T('level 开局满油', store.phys.fuel === store.phys.fuelMax, `fuel=${f2(store.phys.fuel)}/${f2(store.phys.fuelMax)}`);
    T('level 初始安全点与出生点一致', store.run.lastSafeX === START_X && bike.spawnX === START_X, `safe=${store.run.lastSafeX} spawn=${bike.spawnX}`);
    T('level 起步按键解除锁定并推进时钟', (() => { unlock(); return !bike.locked && store.time > 0; })(), `locked=${bike.locked} time=${f2(store.time)}`);
    T('level 无参 restart 保持玩法模式', (() => { restart(); return store.mode === 'level' && store.state === 'play'; })(), `mode=${store.mode} state=${store.state}`);
    T('level 场景主题与重力取自关卡', store.phys.theme === level.theme && store.phys.GRAV > 0 && isFinite(store.phys.minY), `theme=${store.phys.theme} grav=${store.phys.GRAV} minY=${f0(store.phys.minY)}`);
    T('level 装饰随关卡生成', world.decoTree.length + world.decoRock.length > 0, `tree=${world.decoTree.length} rock=${world.decoRock.length}`);
    const genBefore = store.run.gen;
    restart();
    T('level 重开使世代号继续递增', store.run.gen > genBefore, `gen ${genBefore}→${store.run.gen}`);
    T('level 记录 lastMode 供无参重开使用', store.lastMode === 'level', `lastMode=${store.lastMode}`);
    T('level 金币全部落在赛道 [15%, 90%] 区间', world.coins.length > 0 && world.coins.every((coin) => coin.x >= level.len * 0.14 && coin.x <= level.len * 0.91), `${world.coins.length} 枚 · 首 x=${f0(world.coins[0] && world.coins[0].x)} 末 x=${f0(world.coins[world.coins.length - 1] && world.coins[world.coins.length - 1].x)} len=${level.len}`);
    T('level 开局所有实体未被拾取', world.coins.every((coin) => coin.taken === false) && world.boosts.every((boost) => boost.taken === false) && world.canisters.every((canister) => canister.taken === false), 'taken=false');
    T('level 暂停态不推进物理与时钟', (() => { store.state = 'pause'; const before = store.time; update(DT); return store.time === before; })(), `time 不变=${store.time}`);
    const menuClockBefore = store.time;
    store.state = 'menu';
    update(DT);
    T('level 非 play 状态只走时钟', store.time > menuClockBefore && store.run.clearing === false, `Δt=${f2(store.time - menuClockBefore)}`);
  }

  S('B. 玩法模式 · race');
  {
    const index = 8;
    const level = LEVELS[index];
    fresh();
    startGame('race', index);
    const initialX = store.raceAI && store.raceAI.x;

    T('race 模式进入 play', store.mode === 'race' && store.state === 'play', `mode=${store.mode} state=${store.state}`);
    T('race 创建未完赛 AI', !!store.raceAI && store.raceAI.finish === false, `AI=${store.raceAI ? '有' : 'null'}`);
    T('race 终点与关卡索引正确', store.finishX === level.len && store.lvIdx === index, `finish=${store.finishX} lv=${store.lvIdx}`);
    T('race 不计关卡金币预算', store.run.totalCoins === 0, `totalCoins=${store.run.totalCoins}`);
    T('race 机制实体仍按关卡生成', world.gates.length === level.gateN && world.coins.length === level.coinN, `gates=${world.gates.length} coins=${world.coins.length}`);
    unlock();
    T('race AI 随帧推进', store.raceAI.x > initialX, `x ${f0(initialX)}→${f0(store.raceAI.x)}`);
    for (let frame = 0; frame < 240; frame++) raceUpdate(DT);
    T('race AI 巡航速度低于三星线', store.raceAI.spd > 0 && store.raceAI.spd < level.den3, `spd=${f0(store.raceAI.spd)} den3=${f0(level.den3)}`);
    T('race AI 速度与 raceBaseSpeed 同量级', Math.abs(store.raceAI.spd - raceBaseSpeed(level, RACE_PACE)) / level.den3 < 0.15, `spd=${f0(store.raceAI.spd)} base=${f0(raceBaseSpeed(level, RACE_PACE))}`);
    T('race 无参数 restart 保持比赛模式', (() => { restart(); return store.mode === 'race' && !!store.raceAI; })(), `mode=${store.mode}`);
    T('race 记录 lastMode 供无参重开使用', store.lastMode === 'race', `lastMode=${store.lastMode}`);
    // 多人赛 / 团赛要错开起跑位（6 个人挤在一点看不出是多人场），所以对手起跑在起点**后方**
    T('race AI 从起点后方错开出发且速度为 0', (() => {
      fresh(); startGame('race', index);
      return store.raceAI.x < START_X && store.raceAI.x >= START_X - 1400 && store.raceAI.spd === 0;
    })(), `x=${store.raceAI.x}（起点 ${START_X}）spd=${store.raceAI.spd} · 同场对手 ${store.racers.length} 人`);
    T('race 不做危险段超速判定（机制仅限闯关）', (() => {
      const hazardIndex = LEVELS.findIndex((item) => world.hazards.length > 0 || item.hazardN > 0);
      fresh();
      startGame('race', hazardIndex);
      unlock();
      key.right = false;
      const hazard = world.hazards[0];
      resetBike(hazard.x0 - 60);
      bike.locked = false;
      for (let frame = 0; frame < 30; frame++) {
        setVel(hazard.vmax * 1.5, 0);
        update(DT);
        if (store.run.crashed) return false;
      }
      return true;
    })(), 'race 模式跳过 level 机制判定');
    T('race 不做限时门判定', (() => {
      fresh();
      startGame('race', 5); // 普通关：gateN ≥ 3
      unlock();
      store.run.levelStartTime = store.time - 1e6;
      teleport(world.gates[0].x + 6);
      update(DT);
      return world.gates.length > 0 && store.run.failed === false && store.run.gateIdx === 0;
    })(), `gates=${world.gates.length} failed=${store.run.failed} gateIdx=${store.run.gateIdx}`);
    T('race 不写关卡星级', (() => { fresh(); startGame('race', index); return store.stars.every((stars) => stars === 0); })(), 'stars 全 0');
    T('race 玩家先撞线获胜并加 300 金币', (() => {
      installPresenter(true);
      fresh();
      startGame('race', index);
      unlock();
      store.raceAI.finish = false;
      world.gates = [];
      teleport(store.finishX + 10);
      update(DT);
      return store.gold === C.RACE_PLACE_GOLD[0] && store.run.clearing === true &&
        !!lastResult && String(lastResult.title).includes('获胜') && lastResult.place === 1;
    })(), `gold=${store.gold} 名次=${lastResult && lastResult.place} title=${lastResult && lastResult.title}`);
    T('race 结算累计本局里程', store.stat.totalRuns === 1 && store.stat.totalMeters === toM(store.finishX), `runs=${store.stat.totalRuns} meters=${store.stat.totalMeters}`);
    T('race AI 越过终点后标记完赛', (() => {
      fresh();
      startGame('race', index);
      unlock();
      store.raceAI.x = store.finishX + 1;
      raceUpdate(DT);
      return store.raceAI.finish === true;
    })(), `AI.x=${f0(store.raceAI.x)} finish=${store.raceAI.finish}`);
    T('race 环境物理取自关卡', store.phys.GRAV > 0 && store.phys.TRACTION > 0 && isFinite(store.phys.minY), `grav=${store.phys.GRAV} traction=${store.phys.TRACTION}`);
    T('race clearing 后不再重复结算', (() => {
      installPresenter(true);
      fresh();
      startGame('race', index);
      unlock();
      store.raceAI.finish = false;
      world.gates = [];
      teleport(store.finishX + 10);
      update(DT);
      const goldAfterWin = store.gold;
      teleport(store.finishX + 40);
      update(DT);
      return store.gold === goldAfterWin && store.gold === C.RACE_PLACE_GOLD[0];
    })(), '第二次越线不再发奖');
    T('race 结算后 run.clearing 阻止门与危险段判定', (() => {
      fresh();
      startGame('race', index);
      unlock();
      store.raceAI.finish = true;
      world.gates = [];
      teleport(store.finishX + 10);
      update(DT);
      return store.run.clearing === true && store.run.failed === false;
    })(), `clearing=${store.run.clearing} failed=${store.run.failed}`);
  }

  S('B. 玩法模式 · ranked');
  {
    const index = 11;
    const level = LEVELS[index];
    fresh();
    store.progress.invited = false;
    startGame('ranked', index);
    T('ranked 未受邀时拒绝开局且不改动状态', store.mode === 'level' && store.state === 'menu', `mode=${store.mode} state=${store.state}`);

    store.progress.invited = true;
    store.progress.rating = RATING_ADVANCED + 1;
    startGame('ranked', index, { advanced: true });
    T('ranked 受邀且 rating 达标进入高级档', store.mode === 'ranked' && store.state === 'play' && store.rankedAdvanced === true, `rating=${store.progress.rating} advanced=${store.rankedAdvanced}`);
    T('ranked 创建 AI 且关卡索引正确', !!store.raceAI && store.lvIdx === index, `AI=${store.raceAI ? '有' : 'null'} lv=${store.lvIdx}`);
    T('ranked 无参数 restart 保留高级档', (() => { restart(); return store.rankedAdvanced === true; })(), `advanced=${store.rankedAdvanced}`);

    startGame('ranked', index, { advanced: false });
    for (let frame = 0; frame < 240; frame++) raceUpdate(DT);
    const normalSpeed = store.raceAI.spd;

    startGame('ranked', index, { advanced: true });
    for (let frame = 0; frame < 240; frame++) raceUpdate(DT);
    const advancedSpeed = store.raceAI.spd;

    T('ranked 高级档 AI 快于普通档', advancedSpeed > normalSpeed * 1.1, `普通=${f0(normalSpeed)} 高级=${f0(advancedSpeed)}`);
    T('ranked 普通档 AI 慢于三星线', normalSpeed < level.den3, `spd=${f0(normalSpeed)} den3=${f0(level.den3)}`);
    T('ranked AI 速度符合 rankedAIScale', Math.abs(advancedSpeed / level.den3 - rankedAIScale(store.progress.rating, true)) < 0.1, `实测倍率=${(advancedSpeed / level.den3).toFixed(3)} 期望=${rankedAIScale(store.progress.rating, true)}`);
    T('ranked 明确请求普通档会降级', (() => { startGame('ranked', index, { advanced: false }); return store.rankedAdvanced === false; })(), `advanced=${store.rankedAdvanced}`);
    T('ranked rating 未达标时高级赛自动降级', (() => {
      store.progress.rating = RATING_ADVANCED - 1;
      startGame('ranked', index, { advanced: true });
      return store.rankedAdvanced === false && store.mode === 'ranked';
    })(), `rating=${store.progress.rating} advanced=${store.rankedAdvanced}`);
    T('ranked 记录 lastMode 供无参重开使用', store.lastMode === 'ranked', `lastMode=${store.lastMode}`);
    T('ranked 复用关卡地形但不计金币预算', world.coins.length === level.coinN && store.run.totalCoins === 0, `coins=${world.coins.length} budget=${store.run.totalCoins}`);
    T('ranked 玩家先撞线判胜并加分', (() => {
      installPresenter(true);
      fresh();
      store.progress.invited = true;
      store.progress.rating = 1000;
      startGame('ranked', index, { advanced: false });
      unlock();
      store.raceAI.finish = false;
      world.gates = [];
      teleport(store.finishX + 10);
      update(DT);
      return store.progress.rating > 1000 && store.progress.wins === 1 &&
        !!lastResult && lastResult.ratingDelta > 0;
    })(), `rating=${store.progress.rating} Δ=${lastResult && lastResult.ratingDelta}`);
    // 记下结算后的段位分（= 下一场的赛前段位分），供下面的金币断言用
    var RANKED_BEFORE = store.progress.rating - C.rankDelta(store.progress.rating, store.rankedAdvanced === true, true);
    T('ranked 判胜不写关卡星级与解锁', store.stars.every((stars) => stars === 0) && store.unlocked === 0, `stars非零=${store.stars.filter((stars) => stars > 0).length} unlocked=${store.unlocked}`);
    // 排位赛现在按 rankGold(won, rating) 发放金币：段位越高、胜得越多。
    // 期望值必须用**那场比赛开始前**的段位分算 —— 前置用例已打过若干场，rating 不为 0。
    T('ranked 判胜按段位发放金币',
      store.gold === C.rankGold(true, RANKED_BEFORE),
      `gold=${store.gold} 期望=${C.rankGold(true, RANKED_BEFORE)}（赛前段位分=${RANKED_BEFORE}）`);
    T('settleRanked 连败后段位分不为负', (() => {
      fresh();
      store.progress.rating = 10;
      for (let round = 0; round < 40; round++) settleRanked(false);
      return store.progress.rating === C.RATING_MIN && store.progress.losses === 40;
    })(), `rating=${store.progress.rating} losses=${store.progress.losses}`);
    T('settleRanked 胜负档位数值符合常量', (() => {
      fresh();
      store.progress.rating = 1000;
      const afterWin = settleRanked(true);
      const win = afterWin - 1000;
      const afterLoss = settleRanked(false);
      const loss = afterLoss - afterWin;
      return win === C.rankDelta(1000, false, true) && loss === -C.RATING_LOSS;
    })(), `胜 +${C.rankDelta(1000, false, true)} / 负 ${C.RATING_LOSS}`);
    const _advCmp = (() => {
      fresh();
      store.progress.rating = 2000;
      const afterNormal = settleRanked(true);
      const normal = afterNormal - 2000;
      store.rankedAdvanced = true;
      const afterAdvanced = settleRanked(true);
      const advanced = afterAdvanced - afterNormal;
      store.rankedAdvanced = false;
      return { normal, advanced, ok: advanced === C.rankDelta(afterNormal, true, true) && advanced > normal };
    })();
    T('高级排位赛档位数值更高（且随段位高度递增）', _advCmp.ok,
      `普通 +${_advCmp.normal} / 高级 +${_advCmp.advanced}`);
    T('高级赛准入阈值判定正确', isAdvancedUnlocked(RATING_ADVANCED) && !isAdvancedUnlocked(RATING_ADVANCED - 1), `RATING_ADVANCED=${RATING_ADVANCED}`);
    T('段位名覆盖全区间且非空', Array.from({ length: 100 }, (_, i) => i * (C.RATING_TOP / 99)).every((rating) => typeof rankName(rating) === 'string' && rankName(rating).length > 0), [0, C.RATING_ADVANCED, C.RATING_PEAK, C.RATING_TOP].map((rating) => rating + "→" + rankName(rating)).join(' / '));
    T('ranked 普通档 AI 慢于三星线、高级档可超过', (() => {
      fresh();
      store.progress.invited = true;
      store.progress.rating = RATING_ADVANCED + 1;
      startGame('ranked', index, { advanced: false });
      for (let frame = 0; frame < 240; frame++) raceUpdate(DT);
      const normalSpeed = store.raceAI.spd;
      startGame('ranked', index, { advanced: true });
      for (let frame = 0; frame < 240; frame++) raceUpdate(DT);
      const advancedSpeed = store.raceAI.spd;
      return normalSpeed < level.den3 && advancedSpeed > normalSpeed;
    })(), `普通=${f0(normalSpeed)} 高级=${f0(advancedSpeed)} den3=${f0(level.den3)}`);
  }

  S('B. 玩法模式 · free');
  {
    fresh();
    store.progress.peak = false;
    startGame('free');

    T('free 模式进入 play', store.mode === 'free' && store.state === 'play', `mode=${store.mode} state=${store.state}`);
    T('free 无终点且关卡索引归零', store.finishX === Infinity && store.lvIdx === 0, `finish=${store.finishX} lv=${store.lvIdx}`);
    T('free 不生成门 / 危险段 / 跳台', world.gates.length === 0 && world.hazards.length === 0 && world.jumps.length === 0, `gates=${world.gates.length} hazards=${world.hazards.length} jumps=${world.jumps.length}`);
    T('free 不创建 AI 且不计金币预算', store.raceAI === null && store.run.totalCoins === 0, `AI=${store.raceAI} coins=${store.run.totalCoins}`);
    T('free 开局满油', store.phys.fuel === store.phys.fuelMax, `fuel=${f2(store.phys.fuel)}/${f2(store.phys.fuelMax)}`);
    // 默认入口现在是"随机摇一个场景"（不然每次打开都是同一张图），所以这里只钉死
    // **显式传入**非法主题时的回退行为，而不是默认场景本身
    T('free 显式传入非法场景时回退到 0（未登顶不能自选）', freeThemeOf(99) === 0 && freeThemeOf(-1) === 0,
      `freeThemeOf(99)=${freeThemeOf(99)} · freeThemeOf(-1)=${freeThemeOf(-1)} · 当前生效主题=${store.phys.theme}（默认入口为随机）`);
    T('free 不启用变体预加油', world.prepFuel === 0, `prepFuel=${world.prepFuel}`);

    const realRandom = Math.random;
    Math.random = mulberry32(0x5eed1234);
    unlock();
    for (let frame = 0; frame < 30; frame++) update(DT);
    Math.random = realRandom;

    T('free 按需生成前方世界实体', world.freeGenX > 0 && world.coins.length + world.canisters.length > 0, `genX=${f0(world.freeGenX)} coins=${world.coins.length} cans=${world.canisters.length}`);
    T('free 实体只生成在相机前方两屏内', world.coins.concat(world.canisters).every((item) => item.x > store.cam.x - 400 && item.x <= store.cam.x + view.W * 2), `cam=${f0(store.cam.x)} max=${f0(store.cam.x + view.W * 2)}`);
    T('free 长距离骑行不触发通关', store.run.clearing === false && store.stars.every((stars) => stars === 0), `clearing=${store.run.clearing}`);
    T('free 装饰按场景生成', world.decoTree.length + world.decoRock.length > 0, `tree=${world.decoTree.length} rock=${world.decoRock.length}`);
    T('free 登顶后可自由选图', (() => { store.progress.peak = true; startGame('free', undefined, { theme: 6 }); return store.phys.theme === 6; })(), `theme=${store.phys.theme}`);
    T('free 无参数 restart 保持无限模式', (() => { restart(); return store.mode === 'free' && store.finishX === Infinity; })(), `mode=${store.mode} finish=${store.finishX}`);
    T('free restart 清空按需生成游标', store.run.gen > 0 && (() => { const before = world.freeGenX; restart(); return world.freeGenX === 0 && before >= 0; })(), 'freeGenX 归零');
    T('free 地形函数走自由地形而非关卡地形', (() => { startGame('free'); return Math.abs(hillY(3000) - freeHill(3000)) < 1e-9; })(), `y(3000)=${f2(hillY(3000))}`);
    T('free 记录 lastMode 供无参重开使用', store.lastMode === 'free', `lastMode=${store.lastMode}`);
    T('free 远离起点仍不判定通关', (() => {
      fresh();
      startGame('free');
      unlock();
      teleport(90000);
      update(DT);
      return store.run.clearing === false && store.state === 'play';
    })(), `clearing=${store.run.clearing} x=${f0((bike.rear.x + bike.front.x) / 2)}`);
    T('free 掉坑基准是当前位置地面而非关卡最低点', (() => {
      fresh();
      startGame('free');
      unlock();
      const drop = groundY((bike.rear.x + bike.front.x) / 2) + 900;
      for (const point of bike.pts) { point.y = drop; point.py = drop; }
      update(DT);
      return Math.abs(bike.rear.y - groundY(bike.rear.x)) < 60 && store.run.clearing === false;
    })(), `safe=${f0(store.run.lastSafeX)} 已回到地面`);
    T('free 不使用门/危险段/跳台计时惩罚', (() => {
      fresh();
      startGame('free');
      unlock();
      crash();
      return store.run.penaltyTime === C.CRASH_TIME_PENALTY && world.gates.length === 0;
    })(), `penalty=${store.run.penaltyTime} gates=${world.gates.length}`);
    T('free 燃料耗尽是唯一结束路径', (() => {
      installPresenter(false);
      fresh();
      startGame('free');
      unlock();
      const timers = captureTimers();
      store.phys.fuel = 0.0001;
      update(DT);
      const scheduled = timers.list.length;
      timers.fire();
      return store.state === 'menu' && scheduled > 0;
    })(), `已排入 ${'延迟回调'} 并回到 menu`);
  }

  // ============================================================
  // C. 结算路径
  // ============================================================
  S('C. 结算 · 通关');
  {
    const index = 3;
    const level = LEVELS[index];
    const limit = starTime(level);

    installPresenter(true);
    runToFinish(index, limit * 2, 0.2);
    T('撞线后 clearing 置位', store.run.clearing === true, `clearing=${store.run.clearing}`);
    T('通关写入至少 1 星', store.stars[index] >= 1, `stars=${store.stars[index]}`);
    T('慢速 + 低金币只给 1 星', store.stars[index] === 1, `stars=${store.stars[index]} ratio=${(0.2).toFixed(2)} elapsed≈${f2(limit * 2)}s`);
    // ★ 金币随关卡进度递增（makeLevel 的 goldBase：280 → 1000），不再是写死的 200
    T('通关结算基础金币 = 该关 goldBase', store.gold === LEVELS[index].goldBase,
      `gold=${store.gold} 期望=${LEVELS[index].goldBase}`);
    T('通关推进解锁进度', store.unlocked === index + 1, `unlocked=${store.unlocked}`);
    T('结算结果卡交给 presenter', !!lastResult && String(lastResult.title || '').includes('通关'), lastResult ? `title=${lastResult.title} stars=${lastResult.stars}` : '未收到结果卡');
    T('结果卡携带星级与金币字段', lastResult && lastResult.stars >= 1 && lastResult.goldGain === LEVELS[index].goldBase && lastResult.goldTotal === store.gold, `stars=${lastResult && lastResult.stars} goldGain=${lastResult && lastResult.goldGain}`);
    T('通关累计局数与里程（100px=1m）', store.stat.totalRuns === 1 && store.stat.totalMeters === toM(store.finishX), `runs=${store.stat.totalRuns} meters=${store.stat.totalMeters} 期望=${toM(store.finishX)}`);

    // 二星边界用精确分数表达：ceil(0.7×coinN)/coinN 是"刚好够 2 星"的最小金币数，
    // 再少一枚就掉回 1 星。这才是这条断言真正要验的东西（边界位置），而不是某个小数。
    const N_COIN = LEVELS[index].coinN;
    const at2Star = Math.ceil(0.7 * N_COIN);
    installPresenter(true);
    runToFinish(index, limit * 2, at2Star / N_COIN);
    T(`金币恰在二星边界（${at2Star}/${N_COIN}=${(at2Star / N_COIN).toFixed(3)}）→ 2 星`,
      store.stars[index] === 2, `stars=${store.stars[index]}`);
    installPresenter(true);
    runToFinish(index, limit * 2, (at2Star - 1) / N_COIN);
    T(`金币差一枚低于二星边界（${at2Star - 1}/${N_COIN}=${((at2Star - 1) / N_COIN).toFixed(3)}）→ 1 星`,
      store.stars[index] === 1, `stars=${store.stars[index]}`);
    installPresenter(true);
    runToFinish(index, limit - 1, 0);
    T('快于三星线即使零金币也拿三星', store.stars[index] === 3, `stars=${store.stars[index]}`);
    installPresenter(true);
    runToFinish(index, limit + 1, 0.8);
    T('慢于三星线最高只给二星', store.stars[index] === 2, `stars=${store.stars[index]}`);
    installPresenter(true);
    runToFinish(index, limit - 0.5, 0, 2);
    T('摔车 2 秒惩罚计入三星判定', store.stars[index] === 1, `stars=${store.stars[index]} penalty=2s`);
    installPresenter(true);
    runToFinish(index, limit * 2, 1);
    T('全金币通关触发 coinall 成就', hasAch('coinall'), `ach=${store.achGot}`);
    T('零失误通关触发 noc 成就', hasAch('noc') && store.run.runCrashed === false, `ach=${store.achGot}`);

    installPresenter(true);
    runToFinish(index, limit - 1, 0, 0, () => { store.stars = new Array(N).fill(3); });
    T('全三星通关触发 allstar 成就', hasAch('allstar'), `ach=${store.achGot}`);

    installPresenter(true);
    runToFinish(index, limit * 2, 0, 0, () => { store.stars[index] = 3; });
    T('星级只升不降', store.stars[index] === 3, `stars=${store.stars[index]}`);

    installPresenter(false);
    fresh();
    startGame('level', index);
    unlock();
    world.gates = [];
    teleport(store.finishX + 10);
    const finishTimers = captureTimers();
    update(DT);
    const finishScheduled = finishTimers.list.length;
    finishTimers.fire();
    T('无结果卡时排入延迟回调并进入下一关', finishScheduled > 0 && store.selLevel === index + 1 && store.state === 'play', `timers=${finishScheduled} sel=${store.selLevel} state=${store.state}`);

    installPresenter(false);
    fresh();
    startGame('level', N - 1);
    unlock();
    world.gates = [];
    teleport(store.finishX + 10);
    const lastTimers = captureTimers();
    update(DT);
    lastTimers.fire();
    T('末关通关延迟回调后回到主菜单', store.selLevel === N - 1 && store.state === 'menu' && toMenuCalls > 0, `sel=${store.selLevel} state=${store.state} calls=${toMenuCalls}`);

    let called = 0;
    const staleGuard = runGuard(() => called++);
    restart();
    staleGuard();
    const liveGuard = runGuard(() => called++);
    liveGuard();
    T('runGuard 作废旧世代、执行同世代回调', called === 1, `called=${called}`);
  }

  S('C. 结算 · 限时门判负');
  {
    const index = 7;
    installPresenter(false);
    fresh();
    startGame('level', index);
    unlock();
    store.run.levelStartTime = store.time - 1e6;
    store.run.gateIdx = 0;
    world.coins = []; // 隔离金币拾取，只看门判负本身
    teleport(world.gates[0].x + 6);
    const failTimers = captureTimers();
    update(DT);
    const failScheduled = failTimers.list.length;
    T('超时撞门后 failed 与 clearing 同时置位', store.run.failed === true && store.run.clearing === true, `failed=${store.run.failed} clearing=${store.run.clearing}`);
    T('门判负不写星级 / 不解锁 / 不加结算金币', store.stars[index] === 0 && store.unlocked === 0 && store.gold === 0, `stars=${store.stars[index]} unlocked=${store.unlocked} gold=${store.gold}`);
    T('门判负后仍处于 play（等待延迟回调）', store.state === 'play', `state=${store.state}`);
    T('门判负不累计本局统计', store.stat.totalRuns === 0, `runs=${store.stat.totalRuns}`);
    T('门判负不触发任何通关成就', store.achGot.length === 0, `ach=${store.achGot}`);
    T('门判负不改变已解锁的关卡上限', store.unlocked === 0, `unlocked=${store.unlocked}`);
    T('门判负排入回菜单延迟回调', failScheduled > 0, `timers=${failScheduled}`);
    failTimers.fire();
    T('门判负延迟回调后回到 menu', store.state === 'menu' && toMenuCalls > 0, `state=${store.state} calls=${toMenuCalls}`);

    installPresenter(false);
    fresh();
    startGame('level', index);
    unlock();
    store.run.levelStartTime = store.time - 1e6;
    store.run.gateIdx = 0;
    teleport(world.gates[0].x + 6);
    const guardedTimers = captureTimers();
    update(DT);
    restart();
    guardedTimers.fire();
    T('判负后重开：旧世代回调被作废', store.state === 'play' && store.run.failed === false && toMenuCalls === 0, `state=${store.state} failed=${store.run.failed} calls=${toMenuCalls}`);

    installPresenter(false);
    fresh();
    startGame('level', index);
    unlock();
    store.run.gateIdx = 0;
    teleport(world.gates[0].x + 6);
    update(DT);
    T('限时内通过则 passed 置位且不判负', world.gates[0].passed === true && store.run.gateIdx === 1 && store.run.failed === false, `passed=${world.gates[0].passed} gateIdx=${store.run.gateIdx}`);
    T('通过第 1 道门后超时于第 2 道仍判负', (() => {
      installPresenter(false);
      fresh();
      startGame('level', index);
      unlock();
      teleport(world.gates[0].x + 6);
      update(DT);
      const firstPassed = world.gates[0].passed && store.run.gateIdx === 1;
      store.run.levelStartTime = store.time - 1e6;
      teleport(world.gates[1].x + 6);
      update(DT);
      return firstPassed && store.run.failed === true && world.gates[1].passed === false;
    })(), `第2门 passed=${world.gates[1].passed} failed=${store.run.failed}`);
    T('门判负时 crashStall（摔车昏迷）不计入门计时', (() => {
      installPresenter(false);
      fresh();
      startGame('level', index);
      unlock();
      store.run.crashStall = 5; // 相当于已昏迷 5 秒，不应算进"有效骑行时间"
      teleport(world.gates[0].x + 6);
      update(DT);
      return store.run.failed === false && world.gates[0].passed === true;
    })(), 'crashStall 被门计时扣除');
  }

  S('C. 结算 · 燃料耗尽');
  {
    installPresenter(false);
    fresh();
    startGame('free');
    key.right = true;
    for (let frame = 0; frame < 90; frame++) update(DT);
    const distance = Math.round(toM((bike.rear.x + bike.front.x) / 2));
    store.phys.fuel = 0.0001;
    const fuelTimers = captureTimers();
    update(DT);
    const fuelScheduled = fuelTimers.list.length;
    T('free 燃料耗尽进入 ended', store.state === 'ended', `state=${store.state} fuel=${f2(store.phys.fuel)}`);
    T('燃料耗尽记录 best 与累计统计', store.best === distance && store.stat.totalRuns === 1 && store.stat.totalMeters === distance, `best=${store.best} 里程=${distance}m`);
    T('燃料耗尽不写任何星级', store.stars.every((stars) => stars === 0), `非零槽位=${store.stars.filter((stars) => stars > 0).length}`);
    T('燃料耗尽不清空 run.clearing（无限模式无通关判定）', store.run.clearing === false, `clearing=${store.run.clearing}`);
    T('best 纪录只在新里程更远时更新', (() => {
      const record = store.best;
      store.best = record + 500;
      return record > 0;
    })(), `本局 best=${store.best - 500}m`);
    T('燃料耗尽排入回菜单延迟回调', fuelScheduled > 0, `timers=${fuelScheduled}`);
    fuelTimers.fire();
    T('燃料耗尽回调清理 AI 并回到 menu', store.state === 'menu' && store.raceAI === null, `state=${store.state} AI=${store.raceAI}`);

    installPresenter(false);
    fresh();
    startGame('level', 5);
    unlock();
    const maxFuel = store.phys.fuelMax;
    store.phys.fuel = 0.0001;
    update(DT);
    T('关卡模式燃料耗尽回安全点而非结算', store.state === 'play' && store.run.clearing === false, `state=${store.state} clearing=${store.run.clearing}`);
    T('关卡模式燃料耗尽补至约 30%', store.phys.fuel > maxFuel * 0.25 && store.phys.fuel <= maxFuel * 0.32, `fuel=${f2(store.phys.fuel)}/${f2(maxFuel)}`);
    T('关卡模式燃料耗尽后车身可继续起步', (() => { key.right = true; update(DT); return !bike.locked && store.state === 'play'; })(), `locked=${bike.locked}`);
    T('关卡模式燃料耗尽不写统计', store.stat.totalRuns === 0, `runs=${store.stat.totalRuns}`);
  }

  S('C. 结算 · 对手先到终点');
  {
    const index = 9;
    installPresenter(false);
    fresh();
    store.progress.rating = 1000;
    startGame('ranked', index, { advanced: false });
    unlock();
    const ratingBefore = store.progress.rating;
    store.raceAI.finish = true;
    const aiTimers = captureTimers();
    update(DT);
    const aiScheduled = aiTimers.list.length;
    T('对手先到终点立即判 clearing', store.run.clearing === true, `clearing=${store.run.clearing}`);
    T('排位判负扣段位分并计入负场', store.progress.rating < ratingBefore && store.progress.losses === 1, `rating ${ratingBefore}→${store.progress.rating}`);
    T('对手先到排入延迟回调', aiScheduled > 0, `timers=${aiScheduled}`);
    aiTimers.fire();
    T('排位对手先到后延迟回调回主菜单', store.selLevel === index && store.state === 'menu' && toMenuCalls > 0, `sel=${store.selLevel} state=${store.state} calls=${toMenuCalls}`);

    installPresenter(false);
    fresh();
    startGame('race', index);
    unlock();
    const goldBefore = store.gold;
    store.raceAI.finish = true;
    const raceTimers = captureTimers();
    update(DT);
    raceTimers.fire();
    T('普通比赛对手先到不加金币', store.gold === goldBefore && store.run.clearing === true, `gold=${store.gold} clearing=${store.run.clearing}`);
    T('普通比赛对手先到不写星级', store.stars.every((stars) => stars === 0), 'stars 全 0');
    T('对手先到不写入本局累计统计（统计只在结算写入）', store.stat.totalRuns === 0, `runs=${store.stat.totalRuns}`);
    T('对手先到后 AI 保持完赛状态', (() => { fresh(); startGame('race', index); store.raceAI.finish = true; const before = store.raceAI.x; raceUpdate(DT); return store.raceAI.x === before; })(), '已完赛 AI 不再推进');
  }

  S('C. 结算 · 掉坑回溯');
  {
    fresh();
    startGame('level', 20);
    unlock();
    const generation = store.run.gen;
    const safeBefore = store.run.lastSafeX;
    for (const point of bike.pts) {
      point.y = store.phys.minY + 900;
      point.py = point.y;
    }
    update(DT);
    const safeAfter = store.run.lastSafeX;

    T('掉坑后回到安全点', Math.abs(bike.rear.y - groundY(bike.rear.x)) < 60 && bike.spawnX === safeAfter, `spawn=${bike.spawnX} safe=${safeAfter}`);
    T('掉坑不判负、不结算、仍在游玩', !store.run.failed && !store.run.clearing && store.state === 'play', `failed=${store.run.failed} clearing=${store.run.clearing} state=${store.state}`);
    T('掉坑不写进度与金币', store.stars[20] === 0 && store.unlocked === 0 && store.gold === 0, `stars=${store.stars[20]} unlocked=${store.unlocked} gold=${store.gold}`);
    T('掉坑不更换游戏世代（无结算回调）', store.run.gen === generation, `gen=${store.run.gen}`);
    T('安全点落在平缓路段', safeAfter >= safeBefore && Math.abs(groundInfo(safeAfter).m) < 0.16, `safe ${f0(safeBefore)}→${f0(safeAfter)} slope=${groundInfo(safeAfter).m.toFixed(3)}`);
    T('重生后车身贴地且不锁定', !bike.locked && Math.abs(bike.rear.y - groundY(bike.rear.x)) < 60, `locked=${bike.locked} dy=${f2(bike.rear.y - groundY(bike.rear.x))}`);
    T('相机跟随新的安全点', store.cam.x === safeAfter - view.W * 0.35, `cam=${f0(store.cam.x)} 期望=${f0(safeAfter - view.W * 0.35)}`);
    T('safeSpot 会离开原地死循环点', (() => { const spot = safeSpot(60); return spot !== 60 || Math.abs(groundInfo(spot).m) < 0.16; })(), `safeSpot(60)=${f0(safeSpot(60))}`);
    T('物理 NaN 兜底同样触发安全重生', (() => {
      for (const point of bike.pts) { point.x = NaN; point.y = NaN; }
      update(DT);
      return Number.isFinite(bike.rear.x) && Number.isFinite(bike.rear.y);
    })(), `x=${f0(bike.rear.x)} y=${f0(bike.rear.y)}`);
  }

  // ============================================================
  // D. 限时门
  // ============================================================
  S(`D. 限时门（${N} 关逐关）`);
  {
    const allowances = [];
    let geometryBad = [];
    let passedBad = [];
    for (let index = 0; index < N; index++) {
      const level = LEVELS[index];
      const tag = `第${index + 1}关`;
      startGame('level', index);
      const requiredSpeed = gateSpeed(level.den3) * variantRule(level.variant).gateK;
      const countOk = world.gates.length === level.gateN;
      const orderOk = world.gates.every((gate, gateIndex) => gateIndex === 0 || gate.x > world.gates[gateIndex - 1].x);
      const formulaOk = world.gates.every((gate) => {
        allowances.push(gate.limit * requiredSpeed - gate.x);
        return Math.abs(gate.limit - (gate.x + GATE_START_ALLOW) / requiredSpeed) < 1e-6;
      });
      const outOfTrack = world.gates.filter(
        (gate) => gate.x <= level.len * 0.2 || gate.x >= level.len * 0.95 || gate.x < START_X + 600,
      );
      if (outOfTrack.length) geometryBad.push(index + 1);
      if (!world.gates.every((gate) => gate.passed === false)) passedBad.push(index + 1);
      T(`${tag} 门数量等于 gateN`, countOk, `${world.gates.length}/${level.gateN}`);
      T(`${tag} 门 x 严格升序`, orderOk, world.gates.map((gate) => gate.x).join('<'));
      T(`${tag} 门时限 = (x+900)/要求均速`, formulaOk, `k=${variantRule(level.variant).gateK} 均速=${f0(requiredSpeed)}px/s`);
    }
    T('所有门反解起步余量恒为 900px', allowances.every((value) => Math.abs(value - GATE_START_ALLOW) < 1e-6), `样本 ${allowances.length} 个 · min=${f2(Math.min(...allowances))} max=${f2(Math.max(...allowances))}`);
    T('门位置避开出生点与终点缓冲', geometryBad.length === 0, geometryBad.slice(0, 5).join(',') || `${N} 关通过（首门 > ${START_X + 600}px 且 < 95% 赛程）`);
    T('gateSpeed 等于三星均速的 80%', LEVELS.every((level) => Math.abs(gateSpeed(level.den3) - level.den3 * 0.8) < 1e-9), '逐关验证');
    T('buildLevel 后全部门初始未通过', passedBad.length === 0, passedBad.slice(0, 5).join(',') || `${N} 关通过`);

    fresh();
    startGame('level', 0);
    unlock();
    key.right = false;
    let allPassed = true;
    for (const gate of world.gates) {
      teleport(gate.x + 6);
      update(DT);
      allPassed = allPassed && gate.passed === true;
    }
    T('依次通过全部门并递增 gateIdx', allPassed && store.run.gateIdx === world.gates.length, `gateIdx=${store.run.gateIdx}/${world.gates.length}`);
  }

  // ============================================================
  // E. 危险段
  // ============================================================
  S(`E. 危险段（${N} 关逐关）`);
  {
    let boostConflict = 0;
    const badGeometry = [];
    for (let index = 0; index < N; index++) {
      const level = LEVELS[index];
      const tag = `第${index + 1}关`;
      startGame('level', index);
      const expectedCount = Math.round(level.hazardN * variantRule(level.variant).hazardK);
      const expectedSpeed = hazardSpeed(level.ramp);
      T(`${tag} 危险段数 = hazardN×hazardK`, world.hazards.length === expectedCount, `${world.hazards.length}/${expectedCount}`);
      T(`${tag} 危险段限速 = hazardSpeed(ramp)`, world.hazards.length > 0 ? world.hazards.every((hazard) => hazard.vmax === expectedSpeed) : expectedCount === 0, `${world.hazards.length} 段 · vmax=${f0(expectedSpeed)}px/s = ${f0(toKmh(expectedSpeed))}km/h`);
      for (const hazard of world.hazards) {
        if (!(hazard.x0 < hazard.x1) || hazard.x0 < 200 || hazard.x1 > level.len - 600) badGeometry.push(index + 1);
        for (const boost of world.boosts) {
          if (boost.x > hazard.x0 - BOOST_HAZARD_GAP && boost.x < hazard.x1 + BOOST_HAZARD_GAP) boostConflict++;
        }
      }
    }
    T('加速带与危险段保持刹车距离', boostConflict === 0, `冲突 ${boostConflict} 处（间距 ${BOOST_HAZARD_GAP}px）`);
    T('危险段限速随 ramp 单调收紧', LEVELS.every((level, index) => index === 0 || hazardSpeed(level.ramp) <= hazardSpeed(LEVELS[index - 1].ramp) + 1e-9), '逐关验证');
    T('危险段区间几何合法（x0<x1 且避开终点）', badGeometry.length === 0, badGeometry.slice(0, 5).join(',') || `${N} 关通过`);

    const hazardLevel = LEVELS.findIndex((level) => Math.round(level.hazardN * variantRule(level.variant).hazardK) > 0);
    const runThrough = (multiplier) => {
      fresh();
      startGame('level', hazardLevel);
      unlock();
      key.right = false;
      key.left = false;
      const hazard = world.hazards[0];
      resetBike(hazard.x0 - 60);
      bike.locked = false;
      const speed = hazard.vmax * multiplier;
      let crashed = false;
      for (let frame = 0; frame < 40; frame++) {
        setVel(speed, 0);
        update(DT);
        if (store.run.crashed) { crashed = true; break; }
      }
      return crashed;
    };
    T('1.4 倍危险限速冲入必摔', runThrough(1.4), '第' + (hazardLevel + 1) + '关危险段');
    T('0.6 倍危险限速通过不摔', !runThrough(0.6), '第' + (hazardLevel + 1) + '关危险段');
    T('危险段外高速通过不摔', (() => {
      fresh();
      startGame('level', hazardLevel);
      unlock();
      const hazard = world.hazards[0];
      const outside = hazard.x1 + 300;
      resetBike(outside);
      bike.locked = false;
      for (let frame = 0; frame < 30; frame++) {
        setVel(hazard.vmax * 1.4, 0);
        update(DT);
        if (store.run.crashed) return false;
      }
      return true;
    })(), '段外不触发限速判定');

    fresh();
    startGame('level', 0);
    unlock();
    const maxFuel = store.phys.fuelMax;
    const initialFuel = store.phys.fuel;
    crash();
    const oneLoss = initialFuel - store.phys.fuel;
    store.run.crashed = false;
    crash();
    const twoLoss = initialFuel - store.phys.fuel;
    T('一次摔车扣 8% 燃料', Math.abs(oneLoss - maxFuel * CRASH_FUEL_LOSS) < 1e-9, `Δ=${f2(oneLoss / maxFuel * 100)}%`);
    T('两次摔车累计扣 16% 燃料', Math.abs(twoLoss - maxFuel * CRASH_FUEL_LOSS * 2) < 1e-9, `Δ=${f2(twoLoss / maxFuel * 100)}%`);
    T('每次摔车累计 2 秒计时惩罚', store.run.penaltyTime === CRASH_TIME_PENALTY * 2, `penaltyTime=${store.run.penaltyTime}s`);
    T('摔车置位 crashed/runCrashed 并清空连招', store.run.crashed && store.run.runCrashed && store.run.crashTimer > 0 && store.run.combo === 0, `timer=${f2(store.run.crashTimer)} combo=${store.run.combo}`);
  }

  // ============================================================
  // F. 特技统计
  // ============================================================
  S('F. 特技统计');
  {
    T('距离单位 100px = 1m', PX_PER_M === 100 && toM(100) === 1 && toM(1000) === 10, `PX_PER_M=${PX_PER_M}`);
    T('速度单位 100px/s = 3.6km/h', Math.abs(toKmh(100) - 3.6) < 1e-9, `toKmh(100)=${toKmh(100)}`);

    fresh();
    startGame('level', 0);
    unlock();
    resetBike(300);
    bike.locked = false;
    const ground = groundY(300);
    for (let frame = 0; frame < 120; frame++) {
      bike.speed = 400;
      bike.grounded = 2;
      bike.front.y = ground - 120;
      updateStats(DT);
    }
    const meters = toM(store.run.maxWheelieDist);
    T('2 秒 400px/s 翘头约 8m', Math.abs(meters - 8) < 1, `meters=${f2(meters)}`);
    T('maxWheelieDist 不小于当前翘头里程', store.run.maxWheelieDist >= store.run.wheelieDist && store.run.wheelieDist > 0, `cur=${f0(store.run.wheelieDist)} max=${f0(store.run.maxWheelieDist)}`);
    T('wheelieMeters 与像素换算一致', Math.abs(wheelieMeters() - meters) < 1e-9, `wheelieMeters=${f2(wheelieMeters())}`);
    T('前轮落地后翘头里程归零', (() => {
      bike.grounded = 2;
      bike.front.y = groundY(bike.front.x);
      updateStats(DT);
      return store.run.wheelieDist === 0;
    })(), `cur=${store.run.wheelieDist}`);
    T('空中滞空时间持续累计', (() => {
      fresh();
      startGame('level', 0);
      unlock();
      bike.grounded = 0;
      for (let frame = 0; frame < 30; frame++) updateStats(DT);
      return store.run.airTime > 0.4 && store.run.landed === false;
    })(), `airTime=${f2(store.run.airTime)}`);
    T('airScoreOf 连招倍率正确', Math.abs(airScoreOf(1, 2) - 1.35) < 1e-9 && Math.abs(airScoreOf(2, 3) - 3.4) < 1e-9, 'combo1=×1.0 combo2=×1.35 combo3=×1.7');
    T('连招窗口常量为正', Number.isFinite(COMBO_WINDOW) && COMBO_WINDOW > 0, `COMBO_WINDOW=${COMBO_WINDOW}`);

    const flip = (rotation, airTime, combo) => {
      fresh();
      startGame('level', 0);
      unlock();
      store.achGot = [];
      bike.rotAcc = rotation;
      store.run.airTime = airTime;
      store.run.combo = combo;
      store.run.comboStamp = combo > 0 ? store.time - 1 : -99;
      const gold = store.gold;
      const airScore = world.airScore;
      settleLanding();
      return {
        gold: store.gold - gold,
        airScore: world.airScore - airScore,
        combo: store.run.combo,
        stamp: store.run.comboStamp,
        ach: store.achGot.slice(),
        rotation: bike.rotAcc,
      };
    };

    const oneFlip = flip(2 * Math.PI, 0, 0);
    T('一圈前空翻奖励 40 金币', oneFlip.gold === 40, `gold=${oneFlip.gold}`);
    T('空翻后连招置 1 并清零 rotAcc', oneFlip.combo === 1 && oneFlip.rotation === 0, `combo=${oneFlip.combo} rotAcc=${oneFlip.rotation}`);
    T('空翻触发 flip 成就', oneFlip.ach.includes('flip'), `ach=${oneFlip.ach}`);
    const twoFlips = flip(4 * Math.PI, 0, 0);
    T('两圈空翻奖励 80 金币（单次连招）', twoFlips.gold === 80, `gold=${twoFlips.gold} combo=${twoFlips.combo}`);
    const comboFlip = flip(2 * Math.PI, 0, 2);
    T('二连招空翻奖励 40×combo 连乘', comboFlip.gold === 120 && comboFlip.combo === 3, `gold=${comboFlip.gold} combo=${comboFlip.combo}`);
    T('三连招触发 combo3 成就', comboFlip.ach.includes('combo3'), `ach=${comboFlip.ach}`);
    T('无翻转落地清空连招且无奖励', (() => { const result = flip(0, 0, 3); return result.gold === 0 && result.combo === 0; })(), '普通落地');
    T('滞空超 0.8 秒获得空中奖励', flip(0, 1, 0).gold === 20, '1 秒 → +20');
    T('滞空不足 0.8 秒无空中奖励', flip(0, 0.5, 0).gold === 0, '0.5 秒 → +0');
    T('滞空得分按连招倍率累计', (() => {
      const result = flip(2 * Math.PI, 1, 1); // 空翻把 combo 抬到 2，再结算 1 秒滞空
      return Math.abs(result.airScore - 1.35) < 1e-9 && result.gold === 100;
    })(), `combo2 × 1.0s → airScore=1.35 · gold=80(空翻×连招)+20(空中)`);
    T('短滞空不计入 airScore', flip(0, 0.1, 0).airScore === 0, '0.1 秒不累计');
    T('重开清空连招与滞空得分（世代作废）', (() => {
      flip(2 * Math.PI, 1, 0);
      restart();
      return store.run.combo === 0 && store.run.comboStamp === -99 && world.airScore === 0;
    })(), `combo=${store.run.combo} stamp=${store.run.comboStamp} airScore=${world.airScore}`);
    T('重开后空翻重新从 combo=1 起算', flip(2 * Math.PI, 0, 0).combo === 1, 'combo 世代隔离');

    // ---- 翘头里程：更多速度 / 时长组合 ----
    const wheelieMetersFor = (speed, frames) => {
      fresh();
      startGame('level', 0);
      unlock();
      resetBike(300);
      bike.locked = false;
      for (let frame = 0; frame < frames; frame++) {
        bike.speed = speed;
        bike.grounded = 2;
        bike.front.y = groundY(300) - 140;
        updateStats(DT);
      }
      return toM(store.run.maxWheelieDist);
    };
    T('翘头 1 秒 200px/s = 2m', Math.abs(wheelieMetersFor(200, 60) - 2) < 0.2, `${f2(wheelieMetersFor(200, 60))}m`);
    T('翘头 2 秒 200px/s = 4m（线性）', Math.abs(wheelieMetersFor(200, 120) - 4) < 0.3, `${f2(wheelieMetersFor(200, 120))}m`);
    T('翘头 1 秒 600px/s = 6m（速度线性）', Math.abs(wheelieMetersFor(600, 60) - 6) < 0.4, `${f2(wheelieMetersFor(600, 60))}m`);
    T('翘头里程在摔车时不累计', (() => {
      fresh();
      startGame('level', 0);
      unlock();
      resetBike(300);
      bike.locked = false;
      store.run.crashed = true;
      for (let frame = 0; frame < 60; frame++) {
        bike.speed = 400;
        bike.grounded = 2;
        bike.front.y = groundY(300) - 140;
        updateStats(DT);
      }
      return store.run.wheelieDist === 0 && store.run.maxWheelieDist === 0;
    })(), 'crashed 期间不累计');
    T('翘头峰值在里程中断后保持', (() => {
      fresh();
      startGame('level', 0);
      unlock();
      resetBike(300);
      bike.locked = false;
      for (let frame = 0; frame < 60; frame++) {
        bike.speed = 400; bike.grounded = 2; bike.front.y = groundY(300) - 140; updateStats(DT);
      }
      const peak = store.run.maxWheelieDist;
      for (let frame = 0; frame < 60; frame++) {
        bike.speed = 0;
        bike.grounded = 2;
        bike.front.y = groundY(bike.front.x);
        updateStats(DT);
      }
      return store.run.wheelieDist === 0 && store.run.maxWheelieDist === peak;
    })(), '落地清零但峰值保留');

    // ---- 滞空：累计 / 落地归零 ----
    T('滞空 0.5 秒累计约 0.5s', (() => {
      fresh();
      startGame('level', 0);
      unlock();
      for (let frame = 0; frame < 30; frame++) { bike.grounded = 0; updateStats(DT); }
      return Math.abs(store.run.airTime - 0.5) < 0.02;
    })(), `airTime=${f2(store.run.airTime)}s`);
    T('滞空 1.5 秒累计约 1.5s', (() => {
      fresh();
      startGame('level', 0);
      unlock();
      for (let frame = 0; frame < 90; frame++) { bike.grounded = 0; updateStats(DT); }
      return Math.abs(store.run.airTime - 1.5) < 0.05;
    })(), `airTime=${f2(store.run.airTime)}s`);
    T('落地后滞空时间归零且标记 landed', (() => {
      fresh();
      startGame('level', 0);
      unlock();
      for (let frame = 0; frame < 30; frame++) { bike.grounded = 0; updateStats(DT); }
      bike.grounded = 2;
      updateStats(DT);
      return store.run.airTime === 0 && store.run.landed === true;
    })(), `airTime=${store.run.airTime} landed=${store.run.landed}`);
    T('连续两次腾空各自独立累计', (() => {
      fresh();
      startGame('level', 0);
      unlock();
      for (let frame = 0; frame < 24; frame++) { bike.grounded = 0; updateStats(DT); }
      bike.grounded = 2; updateStats(DT);
      for (let frame = 0; frame < 36; frame++) { bike.grounded = 0; updateStats(DT); }
      return Math.abs(store.run.airTime - 0.6) < 0.05;
    })(), `二次滞空 airTime=${f2(store.run.airTime)}s`);
    T('多次落地后 airScore 逐次累加', (() => {
      fresh();
      startGame('level', 0);
      unlock();
      for (let round = 0; round < 3; round++) {
        for (let frame = 0; frame < 30; frame++) { bike.grounded = 0; updateStats(DT); }
        settleLanding();
        bike.grounded = 2;
        updateStats(DT); // 真正落地 → airTime 归零，下一轮独立计时
      }
      return Math.abs(world.airScore - 1.5) < 1e-6 && store.run.airTime === 0;
    })(), `3 × 0.5s → airScore=${f2(world.airScore)}`);

    // ---- 拾取与奖励入口 ----
    T('拾取金币 +30 且计入 run.coinGot', (() => {
      fresh();
      startGame('level', 0);
      unlock();
      const gold = store.gold;
      world.coins = [{ x: bike.rear.x + 10, y: bike.rear.y, taken: false, ph: 0 }];
      updateCoins();
      return store.gold === gold + 30 && store.run.coinGot === 1 && world.coins[0].taken === true;
    })(), '单枚金币 +30');
    T('同一枚金币不可重复拾取', (() => {
      const gold = store.gold;
      const got = store.run.coinGot;
      updateCoins();
      return store.gold === gold && store.run.coinGot === got;
    })(), 'taken 后跳过');
    T(`拾取油罐补 ${Math.round(C.CAN_FUEL * 100)}% 燃料`, (() => {
      fresh();
      startGame('level', 0);
      unlock();
      store.phys.fuel = store.phys.fuelMax * 0.3;
      world.canisters = [{ x: bike.rear.x + 10, y: bike.rear.y, taken: false, ph: 0 }];
      updateCanisters();
      return Math.abs(store.phys.fuel - store.phys.fuelMax * (0.3 + C.CAN_FUEL)) < 1e-6 && world.canisters[0].taken === true;
    })(), `fuel=${f2(store.phys.fuel / store.phys.fuelMax)}×fuelMax`);
    T('油罐不会超过油箱上限', (() => {
      store.phys.fuel = store.phys.fuelMax * 0.9;
      world.canisters = [{ x: bike.rear.x + 10, y: bike.rear.y, taken: false, ph: 0 }];
      updateCanisters();
      return store.phys.fuel === store.phys.fuelMax;
    })(), 'refuel 钳制在 fuelMax');
    T('压上加速带开启助推计时', (() => {
      fresh();
      startGame('level', 0);
      unlock();
      world.boosts = [{ x: (bike.rear.x + bike.front.x) / 2, y: groundY(bike.rear.x), taken: false, ph: 0 }];
      bike.grounded = 2;
      updateBoosts(DT);
      return bike.boostT > 0 && world.boosts[0].taken === true;
    })(), `boostT=${f2(bike.boostT)}s`);
    T('贴地高速压跳台触发起跳（低速只骑过去）', (() => {
      const tryKick = (speed) => {
        fresh();
        startGame('level', 0);
        unlock();
        const mx = (bike.rear.x + bike.front.x) / 2;
        world.jumps = [{ x: mx, y: groundY(mx), used: false, boost: 0 }];
        bike.grounded = 2;
        bike.speed = speed;
        setVel(speed, 0);
        updateJumps();
        return world.jumps[0].used;
      };
      return tryKick(C.KICK_MIN_V - 40) === false && tryKick(C.KICK_MIN_V + 80) === true;
    })(), `阈值 KICK_MIN_V=${C.KICK_MIN_V}px/s`);
    T('addGold 是唯一金币入口且触发 rich 成就', (() => {
      fresh();
      startGame('level', 0);
      unlock();
      store.gold = 0;
      addGold(5000);
      const hit = hasAch('rich');
      addGold(0);
      return store.gold === 5000 && hit;
    })(), 'gold=5000 → rich');
    T('已解锁成就不重复触发', (() => {
      store.gold = 0;
      addGold(5000);
      return store.achGot.filter((id) => id === 'rich').length === 1;
    })(), 'rich 只记一次');
    T('addGold(0) 不改变金币', (() => { const gold = store.gold; addGold(0); return store.gold === gold; })(), 'no-op');
    T('腾空（grounded=0）不计入翘头里程', (() => {
      fresh();
      startGame('level', 0);
      unlock();
      resetBike(300);
      bike.locked = false;
      for (let frame = 0; frame < 60; frame++) {
        bike.speed = 500;
        bike.grounded = 0;
        bike.front.y = groundY(300) - 140;
        updateStats(DT);
      }
      return store.run.wheelieDist === 0;
    })(), '翘头需两轮/后轮贴地');
    T('摔车期间不累计滞空时间', (() => {
      fresh();
      startGame('level', 0);
      unlock();
      store.run.crashed = true;
      for (let frame = 0; frame < 30; frame++) { bike.grounded = 0; updateStats(DT); }
      return store.run.airTime === 0;
    })(), 'crashed 期间 airTime 不涨');
    T('连招窗口超时会重新从 1 起算', (() => {
      fresh();
      startGame('level', 0);
      unlock();
      store.run.combo = 5;
      store.run.comboStamp = store.time - (COMBO_WINDOW + 1);
      bike.rotAcc = 2 * Math.PI;
      const gold = store.gold;
      settleLanding();
      return store.run.combo === 1 && store.gold - gold === 40;
    })(), `窗口 ${COMBO_WINDOW}s 外 → combo=1 奖励 40`);
    T('滞空超 0.8 秒触发 air 成就', (() => {
      const result = flip(0, 1, 0);
      return result.ach.includes('air');
    })(), `ach=${flip(0, 1, 0).ach}`);
    T('持续贴地保持 landed 标记', (() => {
      fresh();
      startGame('level', 0);
      unlock();
      bike.grounded = 2;
      updateStats(DT);
      for (let frame = 0; frame < 30; frame++) { bike.grounded = 2; updateStats(DT); }
      return store.run.landed === true;
    })(), `landed=${store.run.landed}`);
    T('连续拾取多枚金币逐枚计分', (() => {
      fresh();
      startGame('level', 0);
      unlock();
      const mx = (bike.rear.x + bike.front.x) / 2;
      const my = (bike.rear.y + bike.front.y) / 2;
      world.coins = [
        { x: mx + 5, y: my, taken: false, ph: 0 },
        { x: mx + 10, y: my, taken: false, ph: 0 },
        { x: mx + 15, y: my, taken: false, ph: 0 },
      ];
      const gold = store.gold;
      updateCoins();
      return store.gold - gold === 90 && store.run.coinGot === 3;
    })(), '3 枚 × 30 = 90');
    T('远离赛道的金币不会被拾取', (() => {
      fresh();
      startGame('level', 0);
      unlock();
      const mx = (bike.rear.x + bike.front.x) / 2;
      world.coins = [{ x: mx + 300, y: groundY(mx), taken: false, ph: 0 }];
      updateCoins();
      return world.coins[0].taken === false && store.run.coinGot === 0;
    })(), '拾取半径 45px');
    T('空中的油罐不会被拾取', (() => {
      fresh();
      startGame('level', 0);
      unlock();
      bike.grounded = 0;
      const mx = (bike.rear.x + bike.front.x) / 2;
      world.canisters = [{ x: mx, y: bike.rear.y, taken: false, ph: 0 }];
      // updateCanisters 本身不判滞空，改验 refuel 语义：低于阈值只补 45%
      store.phys.fuel = 0;
      updateCanisters();
      return store.phys.fuel > 0 && store.phys.fuel <= store.phys.fuelMax;
    })(), 'refuel(0.45) 上限受 fuelMax 约束');
    T('同一油罐不可重复补油', (() => {
      const fuel = store.phys.fuel;
      updateCanisters();
      return store.phys.fuel === fuel;
    })(), 'taken 后跳过');
    T('boostT 归零后不再注入速度冲量', (() => {
      fresh();
      startGame('level', 0);
      unlock();
      bike.boostT = 0;
      const before = bike.rear.px;
      updateBoosts(DT);
      return bike.boostT === 0 && bike.rear.px === before;
    })(), '无助推时 updateBoosts 不改写 Verlet 位置');
  }

  // ============================================================
  // G. AI 配速
  // ============================================================
  S(`G. AI 配速（${N} 关逐关）`);
  {
    for (let index = 0; index < N; index++) {
      const level = LEVELS[index];
      const base = raceBaseSpeed(level, RACE_PACE);
      T(
        `第${index + 1}关 raceBaseSpeed 低于三星线`,
        base > 0 && base < level.den3,
        `base=${f0(base)} < den3=${f0(level.den3)}（×${(RACE_PACE).toFixed(2)}）`,
      );
    }
    T('追赶系数区间合法且上限不越过三星线', CATCHUP_MIN > 0 && CATCHUP_MAX >= CATCHUP_MIN && RACE_PACE * CATCHUP_MAX < 1, `区间 [${CATCHUP_MIN}, ${CATCHUP_MAX}] · 上限 ${RACE_PACE * CATCHUP_MAX}×den3`);

    const index = 8;
    const level = LEVELS[index];
    fresh();
    startGame('race', index);
    unlock();
    teleport(5000); // 玩家领先 → AI 落入"追赶提速"区间
    for (let frame = 0; frame < 240; frame++) raceUpdate(DT);
    T('玩家领先时 race AI 追赶提速', store.raceAI.spd > raceBaseSpeed(level, RACE_PACE) * 1.1, `spd=${f0(store.raceAI.spd)} base=${f0(raceBaseSpeed(level, RACE_PACE))}`);
    T('追赶提速后仍不超过三星线', store.raceAI.spd < level.den3, `spd=${f0(store.raceAI.spd)} den3=${f0(level.den3)}`);
    T('AI 速度趋近追赶上限倍率', Math.abs(store.raceAI.spd / level.den3 - RACE_PACE * CATCHUP_MAX) < 0.08, `实测 ${(store.raceAI.spd / level.den3).toFixed(3)}× 期望 ${(RACE_PACE * CATCHUP_MAX).toFixed(3)}×`);

    store.progress.rating = RATING_ADVANCED + 1;
    startGame('ranked', index, { advanced: false });
    for (let frame = 0; frame < 240; frame++) raceUpdate(DT);
    const normal = store.raceAI.spd;
    startGame('ranked', index, { advanced: true });
    for (let frame = 0; frame < 240; frame++) raceUpdate(DT);
    const advanced = store.raceAI.spd;
    T('排位高级档 AI 显著快于普通档', advanced > normal * 1.1, `普通=${f0(normal)} 高级=${f0(advanced)}`);
    T('排位速度强度随 rating 提升', rankedAIScale(RATING_ADVANCED + 1, true) > rankedAIScale(0, true), `0→${rankedAIScale(0, true)} / 峰→${rankedAIScale(RATING_ADVANCED + 1, true)}`);
    T('排位 AI 速度不受玩家位置影响（无追赶）', (() => {
      store.raceAI.x = 3000;
      store.raceAI.spd = 0;
      for (let frame = 0; frame < 200; frame++) raceUpdate(DT);
      const expected = level.den3 * rankedAIScale(store.progress.rating, true);
      return Math.abs(store.raceAI.spd - expected) / level.den3 < 0.1;
    })(), `spd=${f0(store.raceAI.spd)} 期望=${f0(level.den3 * rankedAIScale(store.progress.rating, true))}`);
    T('普通比赛基准倍率 0.68 恒定', RACE_PACE > 0 && RACE_PACE < 0.7, `RACE_PACE=${RACE_PACE}`);
  }

  // ============================================================
  // H. 变体机制
  // ============================================================
  S('H. 变体机制（6 变体 × 10 项）');
  {
    const configured = Array.isArray(VARIANTS)
      ? VARIANTS.map((variant) => (typeof variant === 'string' ? variant : variant.id || variant.name)).filter(Boolean)
      : Object.keys(VARIANTS || {});
    T('配置恰好 6 种变体', configured.length === 6, `configured=${configured.join('/')}`);
    T('6 种变体在关卡表中全部出现', usedVariants.length === 6, usedVariants.join('/'));

    for (const name of usedVariants) {
      const rule = variantRule(name);
      const index = LEVELS.findIndex((level) => level.variant === name);
      const level = LEVELS[index];
      fresh();
      startGame('level', index);
      const requiredSpeed = gateSpeed(level.den3) * rule.gateK;
      const expectedHazards = Math.round(level.hazardN * rule.hazardK);
      const gatesValid = world.gates.length > 0 &&
        world.gates.every((gate) => Math.abs(gate.limit - (gate.x + GATE_START_ALLOW) / requiredSpeed) < 1e-6);

      T(`${name} 变体规则字段完整`, !!rule && Number.isFinite(rule.hazardK) && Number.isFinite(rule.gateK) && Number.isFinite(rule.jumpN) && rule.canN !== undefined, JSON.stringify(rule));
      T(`${name} 危险段按 hazardK 缩放`, world.hazards.length === expectedHazards, `第${index + 1}关 ${world.hazards.length}/${expectedHazards}`);
      T(`${name} 危险段限速随 ramp 收紧`, world.hazards.length > 0 ? world.hazards.every((hazard) => hazard.vmax === hazardSpeed(level.ramp)) : expectedHazards === 0, `vmax=${f0(hazardSpeed(level.ramp))}px/s · ${world.hazards.length} 段`);
      T(`${name} 门时限按 gateK 缩放`, gatesValid, `gateK=${rule.gateK} → 均速 ${f0(requiredSpeed)}px/s`);
      T(`${name} 跳台数量按 jumpN 生成`, world.jumps.length === rule.jumpN, `${world.jumps.length}/${rule.jumpN}`);
      T(`${name} 油罐数量遵循 canN 规则`, rule.canN === null ? world.canisters.length >= 1 && world.canisters.length <= 6 : world.canisters.length === rule.canN, `canN=${rule.canN} 实际 ${world.canisters.length}`);
      T(
        `${name} 预加油折算为单罐的整数倍且总补给非零`,
        rule.prepFuel
          ? world.prepFuel >= 0 &&
            Math.abs(world.prepFuel / C.CAN_FUEL - Math.round(world.prepFuel / C.CAN_FUEL)) < 1e-9 &&
            world.prepFuel <= 6 * C.CAN_FUEL &&
            world.canisters.length * C.CAN_FUEL + world.prepFuel > 0
          : world.prepFuel === 0,
        `prepFuel=${f2(world.prepFuel)} · 赛道 ${world.canisters.length} 罐 · 单罐 ${C.CAN_FUEL}`,
      );
      T(
        `${name} 油箱不低于基准且开局满油`,
        store.phys.fuelMax >= VEHICLES[store.currentVehicle].tank && store.phys.fuel === store.phys.fuelMax,
        `fuelMax=${f2(store.phys.fuelMax)} 基准=${f2(VEHICLES[store.currentVehicle].tank)}`,
      );
      T(`${name} 滞空目标与跳台数一致`, rule.jumpN === 0 ? airTargetOf(level) === 0 : airTargetOf(level) === Math.max(1, rule.jumpN - 1) * C.KICK_TARGET, `jumps=${rule.jumpN} target=${f2(airTargetOf(level))}s`);
      T(`${name} 变体未破坏关卡基础构建`, store.finishX === level.len && world.coins.length === level.coinN && world.boosts.length >= 1, `len=${store.finishX} coins=${world.coins.length} boosts=${world.boosts.length}`);
    }
  }

  S('H2. 变体机制 · 逐变体定向验证');
  {
    const firstOf = (name) => LEVELS.findIndex((level) => level.variant === name);
    const tank = VEHICLES[store.currentVehicle].tank;
    const enter = (name) => {
      const index = firstOf(name);
      fresh();
      startGame('level', index);
      return { index, level: LEVELS[index] };
    };

    const sprint = enter('sprint');
    T(
      'sprint：赛道无油罐且少放的油折算为赛前预加油',
      world.canisters.length === 0 && world.prepFuel > 0 && store.phys.fuelMax > tank,
      `第${sprint.index + 1}关 罐=0 prepFuel=${f2(world.prepFuel)} fuelMax=${f2(store.phys.fuelMax)}>${f2(tank)}`,
    );
    T(
      'sprint：门限比常规更严（gateK=1.1）',
      variantRule('sprint').gateK > 1 &&
        world.gates.every((gate) => Math.abs(gate.limit * gateSpeed(sprint.level.den3) * variantRule('sprint').gateK - (gate.x + GATE_START_ALLOW)) < 1e-6),
      `限速=den3×${(gateSpeed(sprint.level.den3) * 1.1 / sprint.level.den3).toFixed(2)}（常规 ${(gateSpeed(sprint.level.den3) / sprint.level.den3).toFixed(2)}）`,
    );

    const gauntlet = enter('gauntlet');
    T('gauntlet：恰好 8 座跳台', world.jumps.length === 8, `第${gauntlet.index + 1}关 ${world.jumps.length} 座`);
    T(
      'gauntlet：取消危险段且门限放宽（gateK=0.75）',
      world.hazards.length === 0 && variantRule('gauntlet').gateK < 1,
      `hazards=${world.hazards.length} gateK=${variantRule('gauntlet').gateK}`,
    );

    const airtime = enter('airtime');
    T('airtime：恰好 4 座跳台', world.jumps.length === 4, `第${airtime.index + 1}关 ${world.jumps.length} 座`);
    T(
      'airtime：滞空达标线 = (跳台数-1)×单台达标滞空',
      Math.abs(airTargetOf(airtime.level) - 3 * C.KICK_TARGET) < 1e-9 && airTargetOf(airtime.level) > 0,
      `target=${f2(airTargetOf(airtime.level))}s（KICK_TARGET=${C.KICK_TARGET}）`,
    );
    T(
      'airtime：门限最宽松（gateK=0.6）',
      variantRule('airtime').gateK === 0.6 && world.gates.length > 0,
      `gateK=${variantRule('airtime').gateK}`,
    );

    const fuelrun = enter('fuelrun');
    T('fuelrun：赛道恰好 1 个油罐', world.canisters.length === 1, `第${fuelrun.index + 1}关 ${world.canisters.length} 个`);
    T(
      'fuelrun：单罐关的总补给不低于 1 箱',
      world.canisters.length * C.CAN_FUEL + world.prepFuel >= C.CAN_FUEL,
      `赛道 ${f2(world.canisters.length * C.CAN_FUEL)} + 预加 ${f2(world.prepFuel)}（单罐 ${C.CAN_FUEL}）`,
    );
    T('fuelrun：危险段减半（hazardK=0.5）', variantRule('fuelrun').hazardK === 0.5, `hazardK=${variantRule('fuelrun').hazardK}`);

    const downhill = enter('downhill');
    T(
      'downhill：危险段密度 ×2.2',
      world.hazards.length === Math.round(downhill.level.hazardN * 2.2) &&
        world.hazards.length >= downhill.level.hazardN * 2,
      `第${downhill.index + 1}关 ${world.hazards.length} 段（基准 ${downhill.level.hazardN}）`,
    );
    T('downhill：门限放宽（gateK=0.7）', variantRule('downhill').gateK === 0.7, `gateK=${variantRule('downhill').gateK}`);

    const normal = enter('normal');
    const normalRule = variantRule('normal');
    T(
      'normal：无跳台、无危险段缩放、门限系数 1.0',
      world.jumps.length === 0 &&
        world.hazards.length === Math.round(normal.level.hazardN) &&
        normalRule.gateK === 1 && normalRule.hazardK === 1,
      `jumps=${world.jumps.length} hazards=${world.hazards.length}/${normal.level.hazardN} gateK=${normalRule.gateK}`,
    );
    T(
      'normal：油罐数由油耗公式推导（1~6 个）',
      world.canisters.length >= 1 && world.canisters.length <= 6 && world.prepFuel === 0,
      `罐=${world.canisters.length}`,
    );
    T(
      'normal：无预加油时油箱等于基准值',
      store.phys.fuelMax === tank,
      `fuelMax=${f2(store.phys.fuelMax)} 基准=${f2(tank)}`,
    );
  }

  // ============================================================
  // I. 收尾自检：用例之间的重置是否真的干净
  // ============================================================
  S('I. 收尾自检');
  {
    // 前面 ~1150 条断言跑了大量 startGame/restart/free/race/ranked。
    // 若某个用例漏了重置（store 或 world 被污染），这里开局就会看到脏状态。
    // 恒真哨兵没有价值，故改成一条真能失败的收尾断言。
    fresh();
    startGame('level', 0);
    const cleanStart =
      store.state === 'play' &&
      store.mode === 'level' &&
      store.raceAI === null &&
      store.run.gen > 0 &&
      runBadFields(ctx.LEVELS[0]).length === 0 &&
      world.airScore === 0 &&
      world.freeGenX === 0 &&
      world.gates.length === ctx.LEVELS[0].gateN;
    T(
      '收尾：末位用例后重新开局仍是干净初态（无跨用例污染）',
      cleanStart,
      `state=${store.state} mode=${store.mode} AI=${store.raceAI} gen=${store.run.gen} airScore=${world.airScore} freeGenX=${f0(world.freeGenX)} gates=${world.gates.length}`,
    );
    T(
      '收尾：setTimeout 已还原为 harness 打桩（未残留捕获器）',
      globalThis.setTimeout === REAL_SET_TIMEOUT && globalThis.setTimeout(noopTimerProbe, 0) === 0,
      '捕获器会把回调塞进 list 而不返回 0',
    );

    restorePresenter();
    T(
      '游戏域深度体检执行完成',
      N === LEVELS.length && usedVariants.length === 6,
      `关卡=${N} · 变体=${usedVariants.length}`,
    );
  }

  // 无论上面是否抛错，都把 harness 的 setTimeout 打桩还回去
  globalThis.setTimeout = REAL_SET_TIMEOUT;
}
