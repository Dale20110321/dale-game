# 存档格式弃用说明 —— `bike_*` 裸键方案

> **写给下一个开发这个项目的 agent。先读完再动 `src/core/storage.js`。**

## 一句话

`bike_*` 裸键方案（`bike_gold` / `bike_owned` / `bike_up` …）**已弃用**。
现行方案是单个结构化文档键 `dale_save`（schema 5）。
本文件说明旧方案为什么死、迁移路径是什么，以及**下一个开发周期应当把兼容层彻底删掉**。

---

## 1. 旧方案长什么样

进度被拆成 **16 个独立的 localStorage 键**，每个键各存各的：

```
bike_gold      "524880000000000000000"     ← 十进制字符串
bike_owned     "[0,8,20]"                  ← **数组下标**
bike_up        {"cv1":{"engine":500,…}}    ← 车辆 id
bike_veh       "8"                          ← **数组下标**
bike_stars     "[3,0,1,…]"                  ← 432 项
bike_v         "4"                          ← 结构版本
bike_rating / bike_prog / bike_stat / bike_ultra / bike_sel / …
```

槽 0 用裸键名，槽 1+ 用 `dale_s{N}_` 前缀；槽位元数据在 `dale_slot` / `dale_slots`。

## 2. 为什么它被换掉

| # | 缺陷 | 实际后果 |
|---|---|---|
| 1 | **车库按下标索引**（`bike_owned` 是数组下标） | 删掉任何一台车，下标整体前移，老存档的"拥有列表"集体指向别的车。本项目 2026-10 精简掉 8 台车，正是先做 id 化才敢删的。 |
| 2 | 一次写入 = 12 次 `localStorage.setItem` | 每次吃金币都要重写全部进度，慢且容易在中途失败留下半份状态。 |
| 3 | 字段平铺，无处安放明细 | 存不下"这台车什么时候买的 / 骑了多少公里 / 形态花了多少钱"，只能存升级等级。 |
| 4 | 统计只有三个扁平累加值 | 答不了"我在排位赛上花了多少时间"。 |
| 5 | **版本号 `bike_v` 一个键管所有变更** | 货币换算和关卡数迁移共用同一个序号，加一种不兼容改动就只能 `+1` 并祈祷旧分支还能跑。 |
| 6 | 存在 `bike_trial` 后门 | 每次读档都无条件把**全部**车辆置为已拥有 + 满级 + 形态全开。玩家任何购车/升级结果都会被下一次刷新抹掉 —— 这就是"买了车之后新车也默认拥有、而且是满级"的根因。**已在 v5 中连键带效果删除。** |

## 3. 现行方案（schema 5）

一个键 `dale_save`，一份 JSON 文档：

```jsonc
{
  "app": "dale-bike",
  "format": 2,          // 文件格式；1 = 已弃用的 bike_* 裸键（仅导入时识别）
  "schema": 5,          // 文档结构版本（constants.SAVE_SCHEMA）
  "savedAt": "2026-10-04T…",
  "migratedFrom": 4,    // 只有从旧方案搬来的存档才有这一项

  "profile":  { "name": "存档1", "createdAt": "…", "lastPlayed": "…" },
  "wallet":   { "gold": "524880000000000000000", "earned": "…" },   // 完整十进制串
  "garage":   {                                                               // ← 键是 vehicle id
    "current": "cv8",
    "owned":   ["trail", "sport", …],
    "forms":   { "cv8": true },
    "vehicles": {
      "cv8": { "id":"cv8", "engine":500, "tire":500, "frame":500, "susp":500,
               "boughtAt":"…", "formAt":"…", "odometerM":123456, "runs":42 }
    }
  },
  "campaign": { "unlocked": 431, "sel": 12, "stars": [ … 432 项 … ],
                "finaleSeg": 0, "finaleDone": true, "invited": true },
  "ranked":   { "rating": 1350, "wins": 7, "losses": 2, "promoClaimed": 1350, "advanced": false },
  "space":    { "rating": 480, "records": { "L2-B-1": { "runs": 9, "wins": 6, "best": 1 } } },
  "lifetime": { "runs": 132, "meters": 123456, "seconds": 7321, "lastPlayed": "…",
                "byMode": { "level": {…}, "race": {…}, "ranked": {…}, "space": {…}, "free": {…} } },
  "settings": { "muted": false }
}
```

**关键约定**

1. **车库一律用 `vehicle.id` 做键**，任何地方都不许再写数组下标。删车 / 重排因此变成无风险操作。
2. **金币存完整十进制字符串**。余额会到 1e25 量级，`String()` 在那个量级输出 `"1e+25"`，任何按十进制读的路径都会解析成另一个数（本项目历史上因此丢过档）。
3. 每次写入 = **一次** `localStorage.setItem`，内容是整份文档。
4. `migratedFrom` 记录来源版本号，玩家能从存档里看出来历。

## 4. 迁移路径（当前仍在跑）

`loadSave()` 的顺序：

```
读 dale_save ──有──► applyDoc()                     ← 正常路径
      │
      └─无──► 检查是否存在任一 bike_* 键
                 ├─有──► legacyDocFrom() → applyDoc → 写 dale_save → **删掉旧键**
                 └─无──► resetSave()（全新存档）
```

也就是说：**玩家只要访问一次网站，旧存档就自动升级并原地改写成新格式**，不需要任何手动操作，也不会丢任何一项进度。

旧下标 → 车辆 id 的对照表是 `LEGACY_VEHICLE_IDS`，记录 2026-10 精简**之前**的 33 辆车顺序。被精简掉的车的数据随迁移一并丢弃（它们已经不存在了，没有别的去处）。

导入（`parseSave` / `importSave`）**同时接受两种格式**：`format: 2`（文档）与 `format: 1`（裸键），后者当场转成文档。玩家存了好几年的老导出文件不会作废。

## 5. ⚠️ 下一个开发周期：把兼容层删掉

本文件存在的原因就是这条 TODO。到下一个开发周期，**应当永久移除旧方案支持**。

需要删掉的东西（都在 `src/core/storage.js`）：

| 符号 | 位置 | 作用 |
|---|---|---|
| `LEGACY_VEHICLE_IDS` | 文件中段 | 旧下标 → id 对照表 |
| `legacyIdAt()` | 同上 | 按旧下标查 id |
| `legacyLevelsOf()` | 同上 | 旧升级格式取值（含早期"全局单一升级"扁平格式） |
| `legacyDocFrom()` | 同上 | 旧键 → v5 文档 |
| `hasLegacyData()` | 同上 | 探测旧键是否存在 |
| `clearLegacyKeys()` | 同上 | 删旧键 |
| `loadSave()` 里的 `else if (hasLegacyData())` 分支 | 读档主路径 | 自动迁移 |
| `parseSave()` 里的 `else if (obj.format === 1)` 分支 | 导入 | 识别旧格式 |
| `migrateLegacyMap` 的调用点 | 导入 | 同上 |
| `LSET` 里对 `SAVE_KEYS.ver` 的版本迁移（`ver < 2` 货币 ×10） | `legacyDocFrom` 内 | 历史货币换算 |
| `constants.js` 的 `SAVE_KEYS` 里除 `doc` / `ach` / `up`… 之外的全部旧键 | 配置 | 旧键清单 |

同时要改的：

- `constants.js`：`SAVE_FORMAT` 保持 2；`SAVE_KEYS` 精简到只留 `doc` 与 `ach`。
  **注意 `bike_ach`（成就清单）不在文档里**，它是一个独立的小键、体积小、且历史上从未变过方案 —— 可以保留。若要一并并入文档，请同步改 `loadAchList` / `saveAchList` 并给已发过的成就键做一次同样的迁移。
- `deleteSlot()` 里那段"扫描所有 `bike_*` 键删掉"的兜底：`SAVE_KEYS` 里旧键删干净之后它可以简化成只删 `dale_save`。
- 建议同时把 `loadSave()` 里删 `bike_trial` 的那一行去掉 —— 它是一次性的迁移清理，不是运行时逻辑。

**删之前确认两件事**（否则会把玩家的档删掉）：

1. 距离本次迁移已过去**至少一个发布周期**，让绝大多数活跃玩家至少访问过一次。
2. 若仍想留个后手，可以保留一个 `localStorage.dale_save_migrated_at` 时间戳：写入 `dale_save` 的同时打一个戳，
   见到"有旧键但没有戳"的档就说明是迁移失败的老玩家，提示导出而不是直接丢弃。

## 6. 怎么验证你真的删干净了

删完之后：

1. 在 devtools 里塞一份纯旧档（`bike_gold` / `bike_owned` / `bike_up` …，**不要** `dale_save`），刷新。
   预期：进游戏看到的是**全新存档**（旧键被忽略），而不是崩溃或半份数据。
2. `grep -n "bike_" src/` 应该只剩 `bike_ach`（若保留）与 `deleteSlot` 里针对历史残留的清理。
3. `grep -rn "LEGACY_VEHICLE_IDS\|legacyDocFrom\|hasLegacyData" src/` 应该零命中。

## 7. 相关文件

| 文件 | 作用 |
|---|---|
| `src/core/storage.js` | 读写、迁移、导入导出（**兼容层全在这里**） |
| `src/core/store.js` | 运行时状态；`garageMeta` / `space` / `stat.byMode` 是 v5 新增的 |
| `src/config/constants.js` | `SAVE_KEYS` / `SAVE_SCHEMA` / `SAVE_FORMAT` 的单一事实来源 |
| `src/ui/panels.js` | 存档面板：导出/导入/对比/槽位 |
| `src/ui/shop.js` `src/game/game.js` `src/game/progress.js` | 各自的落盘点（一律走 `save()`） |
