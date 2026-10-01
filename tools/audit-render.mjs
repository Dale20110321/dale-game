// ============================================================
// 渲染层深度体检（src/render/**）
// 依赖全部来自 ctx，不 import harness，也不修改任何被测源码。
// 覆盖：逐场景、逐画质、HUD 布局、相机、粒子、实体绘制、静态约定。
// ============================================================
import { readFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';

const RENDER_DIR = fileURLToPath(new URL('../src/render/', import.meta.url));

export default async function auditRender(ctx) {
  const {
    check, section, imp, store, world, bike, view,
    THEMES, LEVELS, startGame, drawScene,
  } = ctx;

  const postfx = await imp('render/postfx.js');
  const hudM = await imp('render/hud.js');
  const camM = await imp('render/camera.js');
  const partM = await imp('render/particles.js');
  const entM = await imp('render/entities.js');
  const bgM = await imp('render/background.js');
  const terM = await imp('render/terrain.js');
  const bikeM = await imp('render/bike.js');
  const canvasM = await imp('core/canvas.js');
  const themesM = await imp('config/themes.js');
  const tokensM = await imp('config/ui-tokens.js');
  const constsM = await imp('config/constants.js');

  const C = canvasM.ctx;
  const CV = canvasM.cv;
  const token = tokensM.token;
  const TOKENS = tokensM.TOKENS;
  const DECO_COLORS = themesM.DECO_COLORS;
  const { SPEEDLINE_V, SPEEDLINE_REF, DT } = constsM;
  const QUALITIES = Array.from(postfx.QUALITY || []);
  const SENTINEL = '__AUDIT_SENTINEL__';
  const worldKeys = ['coins', 'canisters', 'boosts', 'decoTree', 'decoRock', 'hazards', 'gates', 'jumps'];

  const SNAP = {
    view: [view.W, view.H],
    state: store.state,
    mode: store.mode,
    selLevel: store.selLevel,
    lvIdx: store.lvIdx,
    theme: store.phys.theme,
    zoom: store.cam.zoom,
    shake: store.cam.shake,
    cam: [store.cam.x, store.cam.y],
    crashed: store.run.crashed,
    speed: bike.speed,
    quality: postfx.getQuality(),
    bike: [[bike.rear.x, bike.rear.y], [bike.front.x, bike.front.y]],
    world: Object.fromEntries(worldKeys.map((key) => [key, world[key]])),
    particles: world.particles.slice(),
    localQuality: localStorage.getItem('dale_quality'),
    canvasFilter: CV.style.filter,
  };

  const report = (name, pass, detail = '') => check(name, Boolean(pass), detail);
  const attempt = (fn) => {
    try {
      fn();
      return null;
    } catch (error) {
      return (error && error.message) || String(error);
    }
  };
  const prime = (quality) => {
    postfx.setQuality(quality);
    store.state = 'play';
    store.run.crashed = false;
    bike.speed = 0;
    store.cam.shake = 0;
  };
  const withRandomCount = (fn) => {
    const original = Math.random;
    let count = 0;
    Math.random = function countedRandom() {
      count++;
      return original();
    };
    try {
      fn();
    } finally {
      Math.random = original;
    }
    return count;
  };
  const withCreateCount = (fn) => {
    const original = document.createElement;
    let count = 0;
    document.createElement = (tag) => {
      count++;
      return original.call(document, tag);
    };
    try {
      fn();
    } finally {
      document.createElement = original;
    }
    return count;
  };
  // 低画质下 drawBackground 的收笔是远山剪影实色（可回读的字符串），
  // 因此可用"末位 fillStyle"作为该场景确实落笔的指纹。
  const backgroundSignature = (theme) => {
    postfx.setQuality('low');
    store.phys.theme = theme;
    C.fillStyle = SENTINEL;
    C.strokeStyle = SENTINEL;
    bgM.drawBackground(store.cam.x, store.cam.y);
    return {
      fill: String(C.fillStyle),
      stroke: String(C.strokeStyle),
      text: `${typeof C.fillStyle}:${String(C.fillStyle).slice(0, 60)}|${typeof C.strokeStyle}:${String(C.strokeStyle).slice(0, 40)}`,
    };
  };

  try {
    // ========================================================
    // 0. 环境与桩件守卫
    // ========================================================
    section('渲染层 · 前置与桩件守卫');

    report(
      'postfx 导出 low/medium/high 三档画质',
      QUALITIES.join('/') === 'low/medium/high',
      QUALITIES.join('/'),
    );
    report(
      'QUALITY_LABEL 覆盖全部档位',
      QUALITIES.every((quality) => typeof postfx.QUALITY_LABEL?.[quality] === 'string' && postfx.QUALITY_LABEL[quality]),
      QUALITIES.map((quality) => `${quality}=${postfx.QUALITY_LABEL?.[quality]}`).join(' '),
    );

    const modules = { postfx, hud: hudM, camera: camM, particles: partM, entities: entM };
    const exportContracts = {
      postfx: ['initPostFx', 'getQuality', 'setQuality', 'blurEnabled', 'applyPostFx'],
      hud: ['hudLayout', 'drawHud', 'activeWarning', 'drawSpeedLines'],
      camera: ['updateCamera', 'addShake', 'shakeOffset'],
      particles: ['emitParticles', 'updateParticles', 'drawParticles'],
      entities: ['drawDeco', 'drawCoins', 'drawCanisters', 'drawBoosts', 'drawFlag', 'drawJumps', 'drawHazards', 'drawGates'],
    };
    for (const [name, names] of Object.entries(exportContracts)) {
      report(
        `${name} 导出契约完整`,
        names.every((key) => typeof modules[name][key] === 'function'),
        names.map((key) => `${key}:${typeof modules[name][key]}`).join(' '),
      );
    }
    report(
      'ctx.imp 返回 postfx 模块单例',
      (await imp('render/postfx.js')) === (ctx.render && ctx.render.postfx),
      '重复动态 import 应命中同一命名空间',
    );
    C.fillStyle = '__probe__';
    report('画布上下文可写可回读', C.fillStyle === '__probe__', String(C.fillStyle));

    // ========================================================
    // 1. 逐场景渲染
    // ========================================================
    section('渲染层 · 逐场景渲染');

    const signatures = [];
    let sceneFailures = 0;
    for (let index = 0; index < THEMES.length; index++) {
      const theme = THEMES[index];
      const levelName = (LEVELS[index] && LEVELS[index].name) || `theme-${index}`;
      const tag = `T${index} ${theme.name}`;

      for (const quality of QUALITIES) {
        startGame('level', index);
        store.phys.theme = index;
        prime(quality);
        const error = attempt(() => {
          for (let frame = 0; frame < 3; frame++) drawScene();
        });
        if (error) sceneFailures++;
        report(`${tag} 三帧连渲不抛异常 [${quality}]`, !error, error || `${levelName} · ${(postfx.QUALITY_LABEL && postfx.QUALITY_LABEL[quality]) || quality}`);
      }

      postfx.setQuality('low');
      const low = postfx.getQuality();
      postfx.setQuality('medium');
      const medium = postfx.getQuality();
      postfx.setQuality('high');
      const high = postfx.getQuality();
      report(`${tag} setQuality/getQuality 往返一致`, low === 'low' && medium === 'medium' && high === 'high', `${low}/${medium}/${high}`);

      const signature = backgroundSignature(index);
      signatures.push(signature.text);
      report(`${tag} 低画质背景确实落笔`, signature.fill !== SENTINEL && signature.text.length > 8, signature.text);
      report(`${tag} 背景重复绘制确定性`, signature.text === backgroundSignature(index).text, signature.text);

      startGame('level', index);
      prime('medium');
      store.phys.theme = 999;
      const highThemeError = attempt(() => drawScene());
      report(`${tag} theme=999 越界不崩`, !highThemeError, highThemeError || '非法主题安全回落');
      store.phys.theme = -1;
      const lowThemeError = attempt(() => drawScene());
      report(`${tag} theme=-1 越界不崩`, !lowThemeError, lowThemeError || '非法主题安全回落');

      report(
        `${tag} sky/pal 数据完整`,
        Array.isArray(theme.sky) && theme.sky.length >= 2 && Array.isArray(theme.pal) && theme.pal.length === 3,
        `sky=${(theme.sky && theme.sky.length) || 0} pal=${(theme.pal || []).join(',')}`,
      );
      const bgKeys = ['space', 'celestial', 'starLayers', 'aurora', 'cloudLayers', 'ridges', 'haze'];
      report(
        `${tag} bg 图层键齐全`,
        !!theme.bg && bgKeys.every((key) => key in theme.bg),
        Object.keys(theme.bg || {}).join(','),
      );
      const missingColors = (theme.deco || []).filter((name) => !(DECO_COLORS && DECO_COLORS[name] && DECO_COLORS[name][0]));
      report(
        `${tag} deco 类型均有配色`,
        (theme.deco || []).length > 0 && missingColors.length === 0,
        missingColors.length ? `缺配色:${missingColors.join(',')}` : (theme.deco || []).join('/'),
      );
      const terrainError = attempt(() => {
        prime('low');
        store.phys.theme = index;
        terM.drawTerrain(store.cam.x, store.cam.y);
      });
      report(
        `${tag} 地表画笔命中且不抛异常`,
        !terrainError && !!(theme.surface && theme.surface.type),
        terrainError || `surface=${(theme.surface && theme.surface.type) || 'missing'}`,
      );

      const width = view.W;
      const height = view.H;
      let zeroViewportError = null;
      try {
        prime('medium');
        store.phys.theme = index;
        view.W = 0;
        view.H = 0;
        zeroViewportError = attempt(() => drawScene());
      } finally {
        view.W = width;
        view.H = height;
      }
      report(`${tag} 0×0 视口不崩`, !zeroViewportError, zeroViewportError || '极端视口绘制完成');
    }
    report(
      '【全局】各场景背景落笔签名互不相同',
      signatures.length === THEMES.length && new Set(signatures).size === signatures.length,
      `${new Set(signatures).size}/${signatures.length} 种`,
    );
    report(
      `【全局】${THEMES.length} 场景 × ${QUALITIES.length} 档 × 3 帧无异常`,
      sceneFailures === 0,
      `失败 ${sceneFailures} 帧`,
    );

    // ========================================================
    // 2. 画质档位
    // ========================================================
    section('渲染层 · 逐画质档位深检');
    view.W = 1280;
    view.H = 720;
    startGame('level', Math.min(36, Math.max(0, LEVELS.length - 1)));

    for (const quality of QUALITIES) {
      prime(quality);
      attempt(() => drawScene());
      const error = attempt(() => {
        for (let frame = 0; frame < 30; frame++) drawScene();
      });
      report(`画质 ${quality} 连渲 30 帧不抛异常`, !error, error || `${(postfx.QUALITY_LABEL && postfx.QUALITY_LABEL[quality]) || quality} · 1280×720`);
    }

    const lineCounts = {};
    for (const quality of QUALITIES) {
      const label = (postfx.QUALITY_LABEL && postfx.QUALITY_LABEL[quality]) || quality;
      const tag = `画质 ${label}(${quality})`;
      postfx.setQuality(quality);
      report(`${tag} getQuality 与设定一致`, postfx.getQuality() === quality, postfx.getQuality());
      report(`${tag} 持久化到 dale_quality`, localStorage.getItem('dale_quality') === quality, localStorage.getItem('dale_quality'));
      report(`${tag} blurEnabled 与档位一致`, postfx.blurEnabled() === (quality === 'high'), postfx.blurEnabled());

      postfx.setQuality(quality);
      const filter = String((CV.style && CV.style.filter) || '');
      const filterOK = quality === 'high'
        ? filter.includes('saturate(1.16)')
        : quality === 'medium'
          ? filter.includes('saturate(1.06)')
          : filter === '';
      report(`${tag} canvas CSS 滤镜按档位分档`, filterOK, filter);

      bike.speed = SPEEDLINE_REF;
      lineCounts[quality] = withRandomCount(() => drawScene());
      report(
        `${tag} 高速帧产生速度线`,
        lineCounts[quality] > 0 && lineCounts[quality] % 3 === 0,
        `Math.random=${lineCounts[quality]}`,
      );
      bike.speed = SPEEDLINE_V - 1;
      const slowCount = withRandomCount(() => drawScene());
      report(`${tag} 低于阈值时不画速度线`, slowCount === 0, `random=${slowCount} threshold=${SPEEDLINE_V}`);
      const created = withCreateCount(() => {
        for (let frame = 0; frame < 10; frame++) drawScene();
      });
      report(`${tag} 稳态十帧不新建离屏元素`, created === 0, `createElement=${created}`);
    }
    report(
      '【全局】高档速度线多于中低档',
      lineCounts.high > lineCounts.medium && lineCounts.medium === lineCounts.low,
      `高=${lineCounts.high} 中=${lineCounts.medium} 低=${lineCounts.low}`,
    );
    report(
      '【全局】速度线随机调用为 12/12/16 条 × 3',
      lineCounts.low === 36 && lineCounts.medium === 36 && lineCounts.high === 48,
      `${lineCounts.low}/${lineCounts.medium}/${lineCounts.high}`,
    );

    {
      const width = view.W;
      const height = view.H;
      prime('high');
      const created = withCreateCount(() => {
        view.W = 640;
        view.H = 360;
        drawScene();
        drawScene();
        view.W = 1920;
        view.H = 1080;
        drawScene();
      });
      view.W = width;
      view.H = height;
      report('视口尺寸剧变只重设离屏位图', created === 0, `createElement=${created}`);
      const error = attempt(() => {
        prime('medium');
        drawScene();
      });
      report('视口归还后仍可正常绘制', !error && view.W === width && view.H === height, error || `${view.W}x${view.H}`);
    }

    postfx.setQuality('medium');
    const rejected = postfx.setQuality('ultra');
    report('非法画质被拒绝且保持原档', rejected === 'medium' && postfx.getQuality() === 'medium', `${rejected}/${postfx.getQuality()}`);
    localStorage.setItem('dale_quality', 'no-such-tier');
    const fallback = postfx.initPostFx();
    // 缺省档位已从 low 改为"高"（低并发核数 / 窄屏降为中）——画质是玩家对画面的第一印象，
    // 不该一开场就发平。非法持久化值回落到的是**设备默认档**，仍必须是合法档位。
    report('非法持久化画质回落到合法默认档', QUALITIES.includes(fallback) && fallback === postfx.getQuality(), String(fallback));
    localStorage.setItem('dale_quality', 'high');
    const restored = postfx.initPostFx();
    report('initPostFx 正确读取持久化画质', restored === 'high' && postfx.getQuality() === 'high', String(restored));

    // ========================================================
    // 3. HUD 布局
    // ========================================================
    section('渲染层 · HUD 布局');
    const viewports = [[1280, 720], [500, 900], [360, 400], [1024, 768]];
    const layoutKeys = ['info', 'fuel', 'race', 'warn', 'speed', 'drive'];
    const pad = parseFloat(TOKENS['space-2']) || 8;
    const compactSeen = [];
    let hudFailures = 0;
    const overlaps = (a, b) => a.x < b.x + b.w && b.x < a.x + a.w && a.y < b.y + b.h && b.y < a.y + a.h;

    for (const [width, height] of viewports) {
      for (const hasWarning of [false, true]) {
        for (const touch of [false, true]) {
          view.W = width;
          view.H = height;
          const mode = `${width}x${height} ${hasWarning ? '+警告' : '无警告'}${touch ? '+触摸' : '+键盘'}`;
          const layout = hudM.hudLayout(hasWarning, touch);
          const items = Object.entries(layout).filter(([, rect]) => rect && typeof rect === 'object' && typeof rect.x === 'number');
          report(
            `HUD ${mode} 返回六个槽位`,
            Object.keys(layout).length === layoutKeys.length && layoutKeys.every((key) => key in layout),
            Object.keys(layout).join(','),
          );
          const nonFinite = items.filter(([, rect]) => ![rect.x, rect.y, rect.w, rect.h].every(Number.isFinite));
          report(`HUD ${mode} 坐标有限`, nonFinite.length === 0, nonFinite.map(([key]) => key).join(','));
          const outside = items.filter(([, rect]) => rect.x < -0.01 || rect.y < -0.01 || rect.x + rect.w > width + 0.01 || rect.y + rect.h > height + 0.01);
          report(`HUD ${mode} 元素不越界`, outside.length === 0, outside.map(([key, rect]) => `${key}@${rect.x},${rect.y},${rect.w},${rect.h}`).join(' '));
          const collisions = [];
          for (let left = 0; left < items.length; left++) {
            for (let right = left + 1; right < items.length; right++) {
              if (overlaps(items[left][1], items[right][1])) collisions.push(`${items[left][0]}x${items[right][0]}`);
            }
          }
          const degenerate = items.filter(([, rect]) => rect.w <= 0 || rect.h <= 0);
          if (outside.length || collisions.length || nonFinite.length || degenerate.length) hudFailures++;
          report(`HUD ${mode} 元素互不重叠`, collisions.length === 0, collisions.join(','));
          report(`HUD ${mode} 元素宽高为正`, degenerate.length === 0, degenerate.map(([key]) => key).join(','));
          report(`HUD ${mode} 警告带按条件出现`, hasWarning ? !!layout.warn : layout.warn === null, hasWarning ? 'warn=object' : 'warn=null');
          report(`HUD ${mode} 触摸时键盘提示让位`, touch ? layout.drive === null : !!layout.drive, touch ? 'drive=null' : 'drive=object');
          const zoneLimit = touch ? height - pad - 90 - pad * 2 : Infinity;
          const speedOK = touch
            ? layout.speed.y + layout.speed.h <= zoneLimit + 0.01
            : Math.abs(layout.speed.x + layout.speed.w - (width - pad)) < 0.01;
          report(`HUD ${mode} 速度表位置正确`, speedOK, `bottom=${layout.speed.y + layout.speed.h} limit=${zoneLimit}`);
          compactSeen.push({ width, height, compact: width < 520 || height < 480, infoWidth: layout.info.w });
        }
      }
    }
    const compactSeenTight = compactSeen.filter((item) => item.compact);
    const compactBad = compactSeenTight.filter((item) => Math.abs(item.infoWidth - 170) > 0.01);
    const regular = compactSeen.filter((item) => !item.compact);
    report('紧凑视口信息栏宽固定 170px', compactSeenTight.length > 0 && compactBad.length === 0, `${compactSeenTight.length} 组紧凑视口：${[...new Set(compactSeenTight.map((item) => item.infoWidth))].join('/')}`);
    report('常规视口信息栏宽收敛到 120~250px', regular.length > 0 && regular.every((item) => item.infoWidth >= 120 && item.infoWidth <= 250), [...new Set(regular.map((item) => item.infoWidth))].join('/'));
    report('全部 HUD 组合通过边界/重叠检查', hudFailures === 0, `违规 ${hudFailures} 处 / ${compactSeen.length} 组`);
    view.W = 1280;
    view.H = 720;
    const noWarningY = hudM.hudLayout(false, false).info.y;
    const warningY = hudM.hudLayout(true, false).info.y;
    report('警告带出现时左列整体下移 34px', Math.abs(warningY - noWarningY - 34) < 0.01, `${noWarningY}->${warningY}`);
    const race = hudM.hudLayout(false, false).race;
    report('竞速条水平居中', Math.abs(race.x - (view.W - race.w) / 2) < 0.01, `x=${race.x}`);

    // ========================================================
    // 4. 相机与震屏
    // ========================================================
    section('渲染层 · 相机');
    view.W = 1280;
    view.H = 720;
    startGame('level', Math.min(36, Math.max(0, LEVELS.length - 1)));
    store.state = 'play';
    store.mode = 'level';
    const finish = store.finishX;
    const maxSpeed = store.phys.MAXV;
    const runCamera = (dt, initialX, speed, zoom, steps) => {
      store.cam.zoom = zoom;
      store.cam.shake = 0;
      store.cam.x = initialX;
      store.cam.y = 0;
      const middle = finish * 0.5;
      bike.rear.x = middle - 5;
      bike.front.x = middle + 5;
      bike.rear.y = -600;
      bike.front.y = -600;
      bike.speed = speed;
      const xs = [];
      for (let index = 0; index < steps; index++) {
        camM.updateCamera(dt);
        xs.push(store.cam.x);
      }
      return { xs, x: store.cam.x, y: store.cam.y, shake: store.cam.shake };
    };

    const first = runCamera(DT, 0, 0, 1.4, 5);
    report(
      '相机前五步单调向车身中点逼近',
      first.x > 0 && first.x < finish * 0.5 && first.xs.every((value, index) => index === 0 || value > first.xs[index - 1]),
      first.xs.join('->'),
    );
    const bounded = runCamera(DT, 0, 0, 1.4, 200);
    const maxX = Math.max(0, finish - view.W * 0.45 / 1.4);
    report('关卡相机 x 保持在合法边界', bounded.x >= 0 && bounded.x <= maxX + 1e-6, `${bounded.x} ∈ [0, ${maxX}]`);
    const converged = runCamera(DT, 0, 0, 1.4, 400).x;
    report('相机在 200 步内收敛到跟随目标', Math.abs(bounded.x - converged) < 0.01, `200步=${bounded.x} 400步=${converged}`);
    store.mode = 'free';
    store.cam.x = 0;
    bike.rear.x = finish * 1.25;
    bike.front.x = finish * 1.25 + 10;
    bike.speed = 0;
    for (let index = 0; index < 40; index++) camM.updateCamera(DT);
    const freeX = store.cam.x;
    store.mode = 'level';
    report('自由模式相机不受终点夹住', freeX > maxX + 500, `${freeX.toFixed(0)} > ${(maxX + 500).toFixed(0)}`);
    store.cam.zoom = 1.37;
    store.cam.x = 0;
    store.cam.shake = 0;
    bike.rear.x = finish * 0.5 - 5;
    bike.front.x = finish * 0.5 + 5;
    bike.speed = 0;
    camM.updateCamera(DT);
    report('updateCamera 不改写 zoom', store.cam.zoom === 1.37, String(store.cam.zoom));
    const lowZoomY = runCamera(DT, 0, 0, 0.6, 200).y;
    const highZoomY = runCamera(DT, 0, 0, 2.5, 200).y;
    report('缩放改变相机纵向取景', highZoomY > lowZoomY + 50, `${lowZoomY}->${highZoomY}`);
    const stopped = runCamera(DT, 0, 0, 1.4, 200).x;
    const forward = runCamera(DT, 0, maxSpeed, 1.4, 200).x;
    const backward = runCamera(DT, 0, -maxSpeed, 1.4, 200).x;
    report('相机速度前瞻生效且倒车反向', forward - stopped > 20 && backward < stopped, `静止=${stopped.toFixed(1)} 正向=${forward.toFixed(1)} 倒车=${backward.toFixed(1)}`);
    const finiteCamera = runCamera(DT, 0, 300, 1.4, 200);
    report('相机状态无 NaN/Inf 且 x 非负', [finiteCamera.x, finiteCamera.y].every(Number.isFinite) && finiteCamera.xs.every((value) => value >= 0), `x=${finiteCamera.x} y=${finiteCamera.y}`);
    const fromNear = runCamera(DT, 0, 0, 1.4, 200).x;
    const fromFar = runCamera(DT, maxX, 0, 1.4, 200).x;
    report('相机收敛与起点无关（纯跟随目标）', Math.abs(fromNear - fromFar) < 0.01, `近=${fromNear.toFixed(4)} 远=${fromFar.toFixed(4)}`);
    const repeatA = runCamera(DT, 0, 250, 1.4, 120);
    const repeatB = runCamera(DT, 0, 250, 1.4, 120);
    report('同 dt 序列两次调用逐位一致', repeatA.x === repeatB.x && repeatA.y === repeatB.y && repeatA.xs.every((value, index) => value === repeatB.xs[index]), `${repeatA.x} vs ${repeatB.x}`);

    store.state = 'pause';
    store.cam.x = 1234;
    store.cam.y = -567;
    store.cam.shake = 8;
    camM.updateCamera(DT);
    const paused = store.cam.x === 1234 && store.cam.y === -567 && store.cam.shake === 8;
    store.state = 'play';
    report('暂停态相机完全冻结', paused, `${store.cam.x}/${store.cam.y}/${store.cam.shake}`);

    store.cam.shake = 0;
    camM.addShake(10);
    camM.addShake(10);
    camM.addShake(10);
    camM.addShake(10);
    const cappedShake = store.cam.shake;
    camM.addShake(1e6);
    report('addShake 累加并封顶 16', cappedShake === 16 && store.cam.shake === 16, `累加后=${cappedShake} 超量后=${store.cam.shake}`);
    store.cam.shake = 10;
    camM.updateCamera(DT);
    report('震屏每步按 ×0.86 衰减', Math.abs(store.cam.shake - 8.6) < 1e-9, String(store.cam.shake));
    store.cam.shake = 0.05;
    camM.updateCamera(DT);
    report('微小震屏直接归零', store.cam.shake === 0, String(store.cam.shake));
    let shakeOK = true;
    let maxShakeX = 0;
    let maxShakeY = 0;
    for (let index = 0; index < 400; index++) {
      const offset = camM.shakeOffset();
      shakeOK = shakeOK && Number.isFinite(offset.x) && Number.isFinite(offset.y) && Math.abs(offset.x) <= store.cam.shake + 1e-9;
      maxShakeX = Math.max(maxShakeX, Math.abs(offset.x));
      maxShakeY = Math.max(maxShakeY, Math.abs(offset.y));
    }
    report('shakeOffset 幅度不超过震屏强度', shakeOK, `maxX=${maxShakeX.toFixed(2)} maxY=${maxShakeY.toFixed(2)}`);
    report('shakeOffset 纵向幅度受 0.7 压缩', maxShakeY <= maxShakeX * 0.71, `maxY/maxX=${(maxShakeY / maxShakeX).toFixed(3)}`);
    store.cam.shake = 0;
    const noShake = camM.shakeOffset();
    report('无震屏时偏移为零', noShake.x === 0 && noShake.y === 0, `${noShake.x}/${noShake.y}`);
    store.cam.shake = 10;
    camM.updateCamera(1 / 120);
    const fastDecay = store.cam.shake;
    store.cam.shake = 10;
    camM.updateCamera(1 / 30);
    const slowDecay = store.cam.shake;
    report('震屏衰减与 dt 相关（dt 越大剩余越少）', slowDecay < fastDecay, `dt=1/120→${fastDecay} dt=1/30→${slowDecay}`);
    store.cam.shake = 16;
    for (let index = 0; index < 400; index++) camM.updateCamera(DT);
    report('满强度震屏 400 步后完全衰减', store.cam.shake === 0, String(store.cam.shake));

    // ========================================================
    // 5. 粒子
    // ========================================================
    section('渲染层 · 粒子');
    const particleConfig = { spd: 2, life: 30, size: 3, grav: 0.04, decay: 0.97, color: token('obj-boost') };
    const cleanParticles = () => { world.particles.length = 0; };
    cleanParticles();
    partM.emitParticles(1000, -500, 1, particleConfig);
    report('emitParticles 单粒子数量正确', world.particles.length === 1, String(world.particles.length));
    cleanParticles();
    partM.emitParticles(1000, -500, 50, particleConfig);
    report('emitParticles 批量数量正确', world.particles.length === 50, String(world.particles.length));
    cleanParticles();
    partM.emitParticles(1000, -500, 0, particleConfig);
    report('emitParticles 零数量不空转', world.particles.length === 0, String(world.particles.length));
    cleanParticles();
    partM.emitParticles(1234.5, -678.25, 10, particleConfig);
    report('粒子出生坐标等于传入坐标', world.particles.every((particle) => particle.x === 1234.5 && particle.y === -678.25), `${world.particles[0].x}/${world.particles[0].y}`);
    cleanParticles();
    partM.emitParticles(0, 0, 10, { spd: 2 });
    const defaults = world.particles[0];
    report('粒子默认字段有效', world.particles.every((particle) => particle.color === token('text-hi') && particle.life === 40 && particle.maxLife === 40 && particle.size >= 2 && particle.size <= 4 && particle.decay === 0.97 && particle.grav === 0.04), JSON.stringify(defaults));
    report('默认粒子色取自令牌', defaults.color === TOKENS['text-hi'], `${defaults.color} vs ${TOKENS['text-hi']}`);
    cleanParticles();
    partM.emitParticles(0, 0, 30, { spd: 3, life: 12, size: 7, grav: -0.2, decay: 0.8 });
    report('cfg 粒子字段原样生效', world.particles.every((particle) => particle.life === 12 && particle.maxLife === 12 && particle.size === 7 && particle.grav === -0.2 && particle.decay === 0.8), JSON.stringify(world.particles[0]));
    cleanParticles();
    partM.emitParticles(0, 0, 200, { spd: 2 });
    const speedBound = particleConfig.spd * 2 + 0.501;
    const worstSpeed = Math.max(...world.particles.map((particle) => Math.hypot(particle.vx, particle.vy)));
    report('粒子初速有限且幅值有界', world.particles.every((particle) => Number.isFinite(particle.vx) && Number.isFinite(particle.vy) && Math.hypot(particle.vx, particle.vy) <= speedBound), `max=${worstSpeed.toFixed(3)} bound=${speedBound}`);
    cleanParticles();
    partM.emitParticles(0, 0, 5, { spd: 0 });
    report('零初速粒子仍带向上偏置 -0.5', world.particles.every((particle) => Math.abs(particle.vy + 0.5) < 1e-9), world.particles.map((particle) => particle.vy).join(','));
    cleanParticles();
    for (let size = 1; size <= 7; size++) partM.emitParticles(0, 0, 100, { spd: 1, size });
    report('粒子数量裁剪到 600', world.particles.length === 600, String(world.particles.length));
    report('裁剪时丢弃最旧粒子', world.particles[0].size === 2 && world.particles.every((particle) => particle.size >= 2), `first=${world.particles[0].size}`);
    cleanParticles();
    for (let index = 0; index < 30; index++) partM.emitParticles(0, 0, 50, particleConfig);
    report('反复 emit 后仍受硬上限约束', world.particles.length === 600, String(world.particles.length));

    cleanParticles();
    partM.emitParticles(0, 0, 3, { spd: 1, life: 5, size: 3, grav: 0.04, decay: 0.97 });
    const before = { ...world.particles[0] };
    partM.updateParticles();
    const after = world.particles[0];
    report('updateParticles 推进位置', after.x === before.x + before.vx && after.y === before.y + before.vy, `${before.x},${before.y}->${after.x},${after.y}`);
    report('updateParticles 每步 life 减 1', after.life === before.life - 1, `${before.life}->${after.life}`);
    report('updateParticles 对 vx 施加 decay', Math.abs(after.vx - before.vx * 0.97) < 1e-12, `${before.vx}->${after.vx}`);
    report('updateParticles 按 (vy+grav)×decay 推进 vy', Math.abs(after.vy - (before.vy + 0.04) * 0.97) < 1e-12, `${before.vy}->${after.vy}`);
    cleanParticles();
    partM.emitParticles(0, 0, 3, { spd: 1, life: 2, size: 3, grav: 0.04, decay: 0.97 });
    partM.updateParticles();
    report('life=1 的粒子仍保留', world.particles.length === 3, String(world.particles.length));
    partM.updateParticles();
    report('life 归零后移除粒子', world.particles.length === 0, String(world.particles.length));

    cleanParticles();
    partM.emitParticles(0, 0, 20, { spd: 1, life: 30, size: 3 });
    const drawSnapshot = world.particles.map((particle) => [particle.x, particle.y, particle.life]);
    const drawError = attempt(() => partM.drawParticles(0, 0));
    report('drawParticles 绘制屏内粒子不抛', !drawError, drawError || '20 个粒子');
    report('drawParticles 不修改粒子状态', world.particles.every((particle, index) => particle.x === drawSnapshot[index][0] && particle.y === drawSnapshot[index][1] && particle.life === drawSnapshot[index][2]), 'x/y/life 只读');
    partM.emitParticles(1e7, -1e7, 50, { spd: 1, life: 30, size: 3 });
    const offRight = attempt(() => partM.drawParticles(0, 0));
    partM.emitParticles(-1e7, 1e7, 50, { spd: 1, life: 30, size: 3 });
    const offLeft = attempt(() => partM.drawParticles(0, 0));
    report('drawParticles 剔除双向屏外粒子', !offRight && !offLeft, offRight || offLeft || '两侧越界粒子均安全剔除');
    cleanParticles();
    partM.emitParticles(0, 0, 600, { spd: 1, life: 30, size: 3 });
    const fullDraw = attempt(() => partM.drawParticles(0, 0));
    report('600 粒子满载一帧绘制不崩', !fullDraw && world.particles.length === 600, fullDraw || String(world.particles.length));
    report('粒子颜色均为非空字符串', world.particles.every((particle) => typeof particle.color === 'string' && particle.color.length > 0), world.particles[0].color);
    report('所有场景骑尘颜色合法', THEMES.every((theme) => /^#|^rgba?\(|^rgb?\(/.test(theme.dust.light) && /^#|^rgba?\(|^rgb?\(/.test(theme.dust.heavy)), THEMES.slice(0, 3).map((theme) => `${theme.dust.light}/${theme.dust.heavy}`).join(' '));
    cleanParticles();

    // ========================================================
    // 6. 实体绘制
    // ========================================================
    section('渲染层 · 实体绘制');
    const makeEntities = (count, base, side) => Array.from({ length: count }, (_, index) => {
      const x = side === 'left'
        ? -1e6 - index * 10
        : side === 'right'
          ? 1e6 + index * 10
          : base + index * 37;
      return { x, y: -500, taken: false, ph: index, passed: index % 2 === 0, used: index % 2 === 0 };
    });
    const setWorld = (coins, canisters, boosts, hazards, gates, jumps, side) => {
      world.coins = makeEntities(coins, 300, side);
      world.canisters = makeEntities(canisters, 600, side);
      world.boosts = makeEntities(boosts, 900, side);
      world.hazards = makeEntities(hazards, 1200, side).map((hazard, index) => ({ x0: hazard.x, x1: hazard.x + 260, vmax: 80 + index }));
      world.gates = makeEntities(gates, 1500, side);
      world.jumps = makeEntities(jumps, 2000, side);
    };
    const fingerprint = () => ['coins', 'canisters', 'boosts', 'hazards', 'gates', 'jumps']
      .map((key) => `${key}:${world[key].length}:${world[key].reduce((sum, item) => sum + Number(item.x || item.x0 || 0) + Number(item.x1 || 0), 0)}`)
      .join('|');
    const combinations = [
      ['全空', 0, 0, 0, 0, 0, 0],
      ['各 1 个', 1, 1, 1, 1, 1, 1],
      ['上百金币', 220, 1, 1, 1, 1, 1],
      ['上百油罐', 1, 120, 1, 1, 1, 1],
      ['近百加速带', 1, 1, 90, 1, 1, 1],
      ['数十危险段', 1, 1, 1, 40, 1, 1],
      ['数十限时门', 1, 1, 1, 1, 30, 1],
      ['数十跳台', 1, 1, 1, 1, 1, 20],
      ['全满载', 300, 60, 40, 30, 20, 16],
    ];
    let levelIndexes = [...new Set([0, 14, 36, 54, 71].filter((index) => index < LEVELS.length))];
    if (!levelIndexes.length && LEVELS.length) levelIndexes = [0];
    let entityFailures = 0;

    for (const levelIndex of levelIndexes) {
      startGame('level', levelIndex);
      prime('high');
      store.cam.x = 0;
      store.cam.y = -400;
      const levelName = (LEVELS[levelIndex] && LEVELS[levelIndex].name) || `L${levelIndex + 1}`;
      for (const [tag, coins, canisters, boosts, hazards, gates, jumps] of combinations) {
        setWorld(coins, canisters, boosts, hazards, gates, jumps, null);
        const error = attempt(() => drawScene());
        if (error) entityFailures++;
        report(`L${levelIndex + 1} ${levelName} 实体组合「${tag}」渲染不抛`, !error, error || `coins/can/boost/haz/gate/jump = ${coins}/${canisters}/${boosts}/${hazards}/${gates}/${jumps}`);
      }

      setWorld(50, 20, 10, 8, 6, 4, null);
      const beforeFingerprint = fingerprint();
      const readError = attempt(() => {
        for (let frame = 0; frame < 5; frame++) drawScene();
      });
      report(`L${levelIndex + 1} 渲染层只读实体世界`, !readError && fingerprint() === beforeFingerprint, readError || beforeFingerprint);

      for (const side of ['left', 'right']) {
        setWorld(80, 30, 20, 12, 10, 8, side);
        const error = attempt(() => drawScene());
        if (error) entityFailures++;
        report(`L${levelIndex + 1} 实体全部位于视口${side === 'left' ? '左' : '右'}侧之外时不崩`, !error, error || '±1e6px 剔除分支');
      }

      setWorld(40, 20, 10, 6, 5, 4, null);
      for (const key of ['coins', 'canisters', 'boosts']) world[key].forEach((item) => { item.taken = true; });
      world.gates.forEach((item) => { item.passed = true; });
      world.jumps.forEach((item) => { item.used = true; });
      const consumedError = attempt(() => drawScene());
      if (consumedError) entityFailures++;
      report(`L${levelIndex + 1} 已拾取/已通过实体仍可安全绘制`, !consumedError, consumedError || 'taken/passed/used 全部跳过');
    }
    report('【全局】全部实体组合无异常', entityFailures === 0, `失败 ${entityFailures} 帧`);

    startGame('level', Math.min(36, Math.max(0, LEVELS.length - 1)));
    prime('medium');
    store.cam.x = 0;
    store.cam.y = -400;
    setWorld(200, 80, 40, 30, 20, 16, null);
    const directDrawers = [
      ['drawDeco', () => entM.drawDeco(store.cam.x, store.cam.y)],
      ['drawCoins', () => entM.drawCoins(store.cam.x, store.cam.y)],
      ['drawCanisters', () => entM.drawCanisters(store.cam.x, store.cam.y)],
      ['drawBoosts', () => entM.drawBoosts(store.cam.x, store.cam.y)],
      ['drawHazards', () => entM.drawHazards(store.cam.x, store.cam.y)],
      ['drawGates', () => entM.drawGates(store.cam.x, store.cam.y)],
      ['drawJumps', () => entM.drawJumps(store.cam.x, store.cam.y)],
      ['drawFlag', () => entM.drawFlag(store.cam.x, store.cam.y, store.finishX)],
      ['drawBike', () => bikeM.drawBike()],
      ['drawTerrain', () => terM.drawTerrain(store.cam.x, store.cam.y)],
      ['drawBackground', () => bgM.drawBackground(store.cam.x, store.cam.y)],
    ];
    for (const [name, fn] of directDrawers) {
      const error = attempt(fn);
      report(`实体绘制函数 ${name} 满载直调不抛`, !error, error || `${name} 完成`);
    }
    world.jumps = [{ x: 900, y: NaN, used: false, boost: 0 }];
    const nanJumpError = attempt(() => drawScene());
    report('跳台 y=NaN 时安全跳过', !nanJumpError, nanJumpError || '非有限坐标被剔除');
    world.jumps = [];
    world.hazards = [{ x0: -1e6, x1: 1e9, vmax: 100 }];
    const hugeHazardError = attempt(() => drawScene());
    report('超长危险段跨度不崩', !hugeHazardError, hugeHazardError || '-1e6..1e9');
    world.hazards = [];
    const finishFlagError = attempt(() => {
      entM.drawFlag(0, 0, NaN);
      entM.drawFlag(0, 0, Infinity);
      entM.drawFlag(0, 0, -1e9);
    });
    report('终点旗非法 finishX 安全早退', !finishFlagError, finishFlagError || 'NaN/Infinity/负值');

    // ========================================================
    // 7. 静态约定
    // ========================================================
    section('渲染层 · 静态约定');
    const files = ['scene.js', 'hud.js', 'terrain.js', 'background.js', 'entities.js', 'bike.js', 'camera.js', 'particles.js', 'postfx.js', 'light.js'];
    const sources = {};
    const readErrors = [];
    for (const file of files) {
      try {
        sources[file] = readFileSync(RENDER_DIR + file, 'utf8');
      } catch (error) {
        sources[file] = '';
        readErrors.push(`${file}:${error.message}`);
      }
    }
    report(
      '静态扫描确实读到九个渲染文件',
      readErrors.length === 0 && files.every((file) => sources[file].length > 200),
      readErrors.join(' ') || files.map((file) => `${file}:${sources[file].length}`).join(' '),
    );
    // 语义扫描一律去注释：注释里的 THEMES[i] / 示例色值不是真实代码路径。
    const code = {};
    for (const file of files) code[file] = sources[file].replace(/\/\*[\s\S]*?\*\//g, '').replace(/^\s*\/\/.*$/gm, '');

    const colorLiteral = /[\x22'](?:#[0-9a-f]{3,8}|rgba?\([^\x22'\r\n]*\)|hsla?\([^\x22'\r\n]*\))[\x22']/gi;
    const colorHits = files.filter((file) => (code[file].match(colorLiteral) || []).length > 0);
    report('render/** 无脱离令牌的裸色值', colorHits.length === 0, colorHits.join(',') || '0 处');
    report('色值规则能命中伪造样本', 'ctx.fillStyle = "#ff00aa";'.match(colorLiteral) !== null, 'ctx.fillStyle = "#ff00aa";');
    const fillHits = files.filter((file) => /ctx\.fillStyle\s*=\s*[\x22']\s*(#[0-9a-f]|rgba?\([^\x22'\r\n]*\))/i.test(code[file]));
    const strokeHits = files.filter((file) => /ctx\.strokeStyle\s*=\s*[\x22']\s*(#[0-9a-f]|rgba?\([^\x22'\r\n]*\))/i.test(code[file]));
    report('render/** 无硬编码 fillStyle', fillHits.length === 0, fillHits.join(',') || '0 处');
    report('render/** 无硬编码 strokeStyle', strokeHits.length === 0, strokeHits.join(',') || '0 处');
    const alphaOverlays = files.flatMap((file) => (code[file].match(/[\x22']rgba\(\s*\d+\s*,\s*\d+\s*,\s*\d+\s*,[\x22']\s*\+/g) || []).map(() => file));
    // 坡面明暗已改用「共用渐变 + 逐段 globalAlpha」，不再拼接色串，所以这里允许为 0 处；
    // 不变的是安全属性：一旦有人再拼动态 alpha 覆盖色，只许出现在 terrain.js。
    report(
      '动态 alpha 覆盖色只用于坡面明暗',
      alphaOverlays.every((file) => file === 'terrain.js'),
      `${alphaOverlays.length} 处 / ${[...new Set(alphaOverlays)].join(',') || '无'}`,
    );
    const fontHits = code['hud.js'].match(/ctx\.font\s*=\s*[\x22'][^\x22']+[\x22']/g) || [];
    report('hud.js 字体全部走 fontOf', fontHits.length === 0, fontHits.join(' ') || `fontOf 调用 ${(code['hud.js'].match(/fontOf\(/g) || []).length} 处`);
    const noTokenFiles = files.filter((file) => !code[file].includes('config/ui-tokens.js'));
    report('含绘制代码的文件都 import ui-tokens', noTokenFiles.every((file) => !/\bctx\.|\bcv\./.test(code[file])), `未引用：${noTokenFiles.join(',')}`);
    report('未引用令牌的文件均为纯变换模块', noTokenFiles.length === 2 && !/\bctx\.|\bcv\./.test(code['camera.js']) && !/\bctx\.|\bcv\./.test(code['light.js']), `${noTokenFiles.join(',')}（零 ctx 调用）`);
    const themeHits = [];
    for (const file of files) {
      for (const match of code[file].matchAll(/theme\s*[=!]==?\s*\d/g)) themeHits.push(`${file}:${match[0]}`);
    }
    report('render/** 无 theme 数字分支', themeHits.length === 0, themeHits.join(' ') || '0 处');
    report('theme 静态规则能命中伪造样本', /theme\s*[=!]==?\s*\d/.test('theme === 3'), 'theme === 3');
    const themeUsers = files.filter((file) => /THEMES\[/.test(code[file]));
    const indexes = themeUsers.flatMap((file) => Array.from(code[file].matchAll(/THEMES\[([^\]]*)\]/g), (match) => ({ file, index: match[1].trim() })));
    const hardIndexes = indexes.filter((item) => item.index !== 'store.phys.theme' && item.index !== '0');
    report('THEMES 下标只取 store.phys.theme 或 0 兜底', themeUsers.length > 0 && hardIndexes.length === 0, hardIndexes.map((item) => `${item.file}:${item.index}`).join(',') || `${indexes.length} 处访问全部经由 store.phys.theme`);
    report('引用 THEMES 的文件都读 store.phys.theme', themeUsers.length > 0 && themeUsers.every((file) => code[file].includes('THEMES[store.phys.theme]')), themeUsers.join(',') || '0 个文件');
    const domWrites = files.filter((file) => /\.innerHTML|\.textContent|\.className|\.classList|\.appendChild|\.insertBefore/.test(code[file]));
    report('render/** 无 DOM 内容写入', domWrites.length === 0, domWrites.join(',') || '0 处');
    const domQueries = files.filter((file) => /document\.(getElementById|querySelector|body)\s*\(/.test(code[file]));
    report('render/** 不查询 DOM 元素', domQueries.length === 0, domQueries.join(',') || '仅 postfx 创建离屏 canvas');
    const created = files.flatMap((file) => (code[file].match(/document\.createElement\(\s*[\x22']([^\x22']+)[\x22']\s*\)/g) || []).map((match) => ({ file, tag: match })));
    report('离屏元素只创建 canvas', created.every((item) => item.tag.indexOf('canvas') >= 0), created.map((item) => `${item.file}:${item.tag}`).join(' ') || '0 处');
    const uiImports = files.filter((file) => /from\s+[\x22']\.\.\/ui\//.test(code[file]));
    const gameImports = files.filter((file) => /from\s+[\x22']\.\.\/game\//.test(code[file]));
    report('render/** 不 import ui/', uiImports.length === 0, uiImports.join(',') || '0 处');
    report('render/** 不 import game/', gameImports.length === 0, gameImports.join(',') || '0 处');
    const storeWrites = [];
    for (const file of files) {
      for (const match of code[file].matchAll(/store\.([A-Za-z.]+?)\s*(\+=|=(?!=))/g)) {
        if (match[1] !== 'cam.shake') storeWrites.push(`${file}:${match[0]}`);
      }
    }
    report('渲染层只写 camera 震屏，不改游戏状态', storeWrites.length === 0, storeWrites.join(' ') || '仅 camera.js 的 store.cam.shake');
    const debugJunk = files.filter((file) => /console\.|TODO|FIXME|debugger|eval\(|new Function/.test(code[file]));
    report('render/** 无调试残留', debugJunk.length === 0, debugJunk.join(',') || '0 处');
    report('DOM 写入规则能命中伪造样本', /\.innerHTML|\.textContent/.test('el.innerHTML = "x";'), 'el.innerHTML = "x";');
    const weatherCount = (code['postfx.js'].match(/WEATHER_N = (\d+)/) || [])[1];
    report('天气粒子数组预分配而非逐帧创建', !/new Array/.test(code['postfx.js']) && /for \(let i = 0; i < WEATHER_N/.test(code['postfx.js']), `WEATHER_N=${weatherCount}`);
    report('离屏画布只在首次调用时创建', /if \(!off\)/.test(code['postfx.js']) && /if \(offW !== pw \|\| offH !== ph\)/.test(code['postfx.js']), 'ensureOff 单例 + 尺寸变化仅重设位图（位图尺寸 = CSS 尺寸 × view.k）');
    report('低画质档位在入口直接早退', /if \(quality === "low"\) return;/.test(code['postfx.js']), 'applyPostFx 首段早退');
    const surfacePainter = (code['terrain.js'].match(/^\s{2}[a-z]+\(s, cx, cy\) \{/gm) || []).length;
    report('地表纹理画笔为数据驱动注册表', surfacePainter >= 12, `${surfacePainter} 个 surface painter`);
  } finally {
    view.W = SNAP.view[0];
    view.H = SNAP.view[1];
    store.state = SNAP.state;
    store.mode = SNAP.mode;
    store.selLevel = SNAP.selLevel;
    store.lvIdx = SNAP.lvIdx;
    store.phys.theme = SNAP.theme;
    store.cam.zoom = SNAP.zoom;
    store.cam.shake = SNAP.shake;
    store.cam.x = SNAP.cam[0];
    store.cam.y = SNAP.cam[1];
    store.run.crashed = SNAP.crashed;
    bike.speed = SNAP.speed;
    bike.rear.x = SNAP.bike[0][0];
    bike.rear.y = SNAP.bike[0][1];
    bike.front.x = SNAP.bike[1][0];
    bike.front.y = SNAP.bike[1][1];
    for (const key of worldKeys) world[key] = SNAP.world[key];
    world.particles.length = 0;
    world.particles.push(...SNAP.particles);
    postfx.setQuality(SNAP.quality);
    if (CV.style) CV.style.filter = SNAP.canvasFilter;
    if (SNAP.localQuality === null) localStorage.removeItem('dale_quality');
    else localStorage.setItem('dale_quality', SNAP.localQuality);
  }
}
