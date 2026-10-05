# macOS 金色猫桌面宠物

原生 HTML/CSS/JavaScript + Electron，只有一个直接依赖，不使用框架或打包器。仅新增的动画素材经过整理，原有 tools/ 脚本不运行。

## 目录

```text
package.json          npm 启动入口、Electron 依赖
main.js               窗口、托盘、资源扫描、拖拽、重力、自检
preload.js            隔离的 IPC 桥
config.json           首次 GUI 启动自动生成
renderer/
  index.html
  style.css
  renderer.js         绘制、预缓存 alpha、像素命中检测
  model.js            状态机、时序、帧语义
assets/idle/          已有素材；读取，不修改
assets/sleep/         新增趴卧睡眠四帧 + 原始生成图
assets/petted/        新增被摸四帧 + 原始生成图
assets/dragged/       新增被拎起四帧 + 原始生成图
assets/alert/         旧左右张望四帧，保留
assets/alert-left/    新增向左转头八帧
assets/alert-right/   新增向右转头八帧
assets/idle-tilt/     新增歪头八帧
assets/idle-blink/    新增眨眼八帧
assets/petted-smooth/ 新增抚摸八帧
assets/sleep-enter/   新增入睡八帧
assets/sleep-wake/    新增醒来八帧
assets/sleep-breathe/ 新增睡眠呼吸八帧
assets/lifted/        固定被拎起单帧
assets/falling/       固定下落单帧
tools/                已有脚本；不运行
previews/             已有预览；不修改
```

## 安装与运行

需要 Node.js/npm 和 macOS 图形会话。在项目目录运行：

```sh
npm install --no-package-lock
npm start
npm start -- --selftest
```

上面的普通 npm install 会由 npm 生成 node_modules。若要严格保持项目目录只新增本任务指定的文件，使用外置依赖：

```sh
npm install --prefix /private/tmp/cat-electron-runtime electron@44.5.1 --no-package-lock --registry=https://registry.npmjs.org
PATH="/private/tmp/cat-electron-runtime/node_modules/.bin:$PATH" npm start
PATH="/private/tmp/cat-electron-runtime/node_modules/.bin:$PATH" npm start -- --selftest
```

临时目录可能被系统清理，届时重新安装。无 GUI 时还可运行 `node main.js --selftest`；相同断言，不加载 Electron、不生成配置、不创建窗口。通过返回 0，失败返回 1。

初次显示位于主屏幕 workArea 底部居中。原图固定 256×256，不裁剪、不重采样源文件。显示缩放采用 canvas 的 CSS 尺寸；位置使用 `top = groundY - 248 × scale`，因此窗口底边为 `groundY + 8 × scale`。

## 交互与托盘

- 猫身体上点击：播放 petted-smooth 专属八帧动画，从睁眼到眯眼、抬下巴、歪头再恢复；每帧 150ms，一次播放共 1.2 秒。缺少新版时使用旧 petted 四帧。新增动作不存在时才使用主待机帧提亮回退。
- 身体上按住拖动：按下先保留当前姿势，移动超过 3 个屏幕像素才进入 dragged；未超过阈值的单击在松手时直接播放抚摸，避免先闪被拎姿势。dragged 优先级最高，渲染进程发送绝对屏幕坐标，主进程以固定抓取偏移跟随；每个渲染帧最多发送一次，避免累计 delta 引起抖动。按住时循环播放身体悬垂、前爪收起的被拎动画；松手下落期间保持此姿势，落地后返回待机。
- 猫周围透明区域：穿透到下面的窗口。alpha > 20 才可交互；alpha 数据在加载时缓存，mousemove 只查表，只在命中状态变化时发送 IPC。
- 鼠标靠近睡觉的猫会唤醒；警觉时鼠标从附近移开会回到待机。
- 托盘提供暂停/恢复动画、0.5/1/1.5/2 倍缩放、显示/隐藏、动作选择、开机自启和退出。暂停冻结动画时钟，拖拽和重力仍可用。缩放保持当前脚底位置。
- 开机自启调用 Electron `app.setLoginItemSettings` 并重新读取系统实际状态。macOS 的该 API 注册应用服务，不接受项目路径参数；开发模式运行的 Electron 未打包为本项目的应用，可能被系统拒绝或只注册 Electron 本身。可靠的本项目自启需要后续打包、签名及系统批准，本任务未添加打包工具。

## 帧语义与状态

优先级：`dragged > petted > alert > sleep > idle`。

| 帧 | 固定用途 |
| --- | --- |
| frame1 | 主待机，长驻；缺失动作回退 |
| frame2 | 120ms 眨眼叠加层；睡眠现在使用独立 sleep 动作 |
| frame3 | 原始警觉帧保留；警觉现在使用独立 alert 动作 |
| frame4 | 随机歪头待机变体，持续 1.8 秒 |

眨眼仅在 idle 上覆盖显示，不进入状态机；结束后继续原来的待机显示。随机事件间隔 20–40 秒，睡眠持续 20–60 秒；事件完成后重新等待下一次随机事件。当前高优先级交互期间不启动低优先级随机事件。

新版动画由 renderer/animation.js 按状态及经过时间选择，优先使用八帧素材：

| 动作 | 素材 | 播放方式 |
| --- | --- | --- |
| 警觉 | alert-left、alert-right 各 8 帧 | 左转顺序→左转倒序→右转顺序→右转倒序，共 2.5 秒 |
| 歪头 | idle-tilt 8 帧 | 500ms 渐入、800ms 保持、500ms 返回 |
| 抚摸 | petted-smooth 8 帧 | 每帧 150ms，单次 1.2 秒 |
| 入睡 | sleep-enter 8 帧 | 每帧 100ms，800ms 后进入呼吸 |
| 呼吸 | sleep-breathe 8 帧 | 每帧 350ms，2.8 秒一轮，帧间 220ms 缓和 |
| 醒来 | sleep-wake 8 帧 | 每帧 100ms，800ms 返回待机 |
| 眨眼 | idle-blink 8 帧 | 合计 240ms，其中两张完全闭眼帧合计保持 120ms |
| 拖拽 | lifted 1 帧 | 固定姿势，移动超过 3px 才触发 |
| 下落 | falling 1 帧 | 固定姿势，落地回待机 |

入睡中途被鼠标唤醒时，从当前入睡帧倒序返回，避免先跳到完全趴卧。完全睡着后才播放独立醒来动作。醒来属于显示过渡，状态已回 idle；期间延后随机眨眼、歪头和事件，抚摸与拖拽会立即打断醒来。眨眼仍是 idle 叠加层，不会打断 sleep。

中间帧主要使用 30ms 的短衔接，眨眼不淡化，避免长时间叠出两张脸。歪头和眨眼错开至少 300ms。所有新帧预缓存渲染后的 alpha，点击区域随实际显示和混合比例更新，mousemove 不调用 getImageData。旧素材及显示补偿配置保留作为回退；原 PNG 不修改。


## 新增动作

直接放入 `assets/walk/frame1.png` … `frame4.png`，重启即可自动扫描并显示在托盘动作菜单，不改代码。目录内只识别 `frame1..N.png`，按数字排序，忽略 `_preview.png` 等文件。动作可有任意帧数，沿用相同尺寸、透明背景和脚底锚点。

idle 使用上面的语义映射；sleep/dragged 循环，petted 单次播放，alert 按张望顺序播放；其他新增动作按 fps 循环播放。`followCursor: true` 时自动请求 walk；尚未提供 walk 时只显示 idle/frame1，并且每个缺失动作仅打印一次：

```text
[assets] missing action: walk, falling back to idle
```

未来的 jump 等动作目录也会自动出现于托盘动作选择；当前没有自动跳跃行为。

## config.json

首次 GUI 启动自动生成以下值；修改后重启生效，托盘缩放会即时保存。

```json
{
  "fps": 8,
  "scale": 1.0,
  "startPosition": "bottom-center",
  "followCursor": false,
  "blinkIntervalMs": [3000, 8000],
  "blinkDurationMs": 120,
  "idleVariants": true,
  "sleepEnabled": true,
  "alwaysOnTop": true,
  "frameDisplayScale": { "idle": { "4": 1.06 } },
  "sleepFrameDurationMs": 900,
  "pettedFrameDurationMs": 300,
  "draggedFrameDurationMs": 240,
  "alertFrameDurationMs": 500
}
```

| 配置 | 含义 |
| --- | --- |
| fps | 新增动作的播放帧率，1–60；idle 不作为四帧循环播放 |
| scale | 显示缩放：0.5、1、1.5、2；不修改素材 |
| startPosition | 目前支持 bottom-center，即主屏幕工作区底部居中 |
| followCursor | 是否水平跟随鼠标并请求 walk，默认关闭 |
| blinkIntervalMs | 眨眼间隔的最小值与最大值，毫秒 |
| blinkDurationMs | 闭眼叠加层持续时间，默认 120ms |
| idleVariants | 是否随机显示 frame4 歪头变体 |
| sleepEnabled | 是否允许随机睡觉；关闭后随机事件只有 alert |
| alwaysOnTop | 是否保持在普通窗口上方，默认 true |
| frameDisplayScale | 单帧的显示补偿，例如 `{"idle":{"4":1.06}}`，歪头帧放大 6%；以 `(128,248)` 为锚点，脚底不移动，不修改 PNG。未指定帧保持 1；有效范围 0.8–1.12，修改后重启 |
| sleepFrameDurationMs | 旧版 sleep 回退每帧停留时间，默认 900；新版按上表播放 |
| pettedFrameDurationMs | 旧版 petted 回退每帧停留时间，默认 300；新版按上表播放 |

| draggedFrameDurationMs | 被拎起循环每帧停留时间，默认 240ms |
| alertFrameDurationMs | 旧版 alert 回退每段停留时间，默认 500；新版总时长仍为 2.5 秒 |

## 自检与实际验收

selftest 覆盖资源发现/排序/预览排除、缺失动作回退、新增动作发现、优先级、眨眼叠加层及 120ms 持续时间、睡眠不被眨眼打断、唤醒、警觉时长、随机睡眠、待机变体、帧语义及四档缩放的脚底补偿。

新增检查涵盖 sleep/petted 四帧资源、256×256 RGBA 编码、睡眠循环及唤醒返回 idle、被摸动作播放及末帧保持、拖拽优先级与专属动作缺失时的回退。生成提示词和新素材整理方法记录在 `renderer/generated-assets.md`。整理脚本只接受新动作目录，不覆盖旧目录，原有 idle 素材保持不变。

实际点击穿透需要 macOS 图形会话：把另一个窗口的可点击控件放在宠物窗口透明角落下面，先移动鼠标再点击，确认下层控件响应；随后点击猫身体确认被摸反馈，再拖拽确认松手落地。仅自检通过不能证明操作系统级穿透通过。

`renderer/verify.html` 是独立的本地点击计数页，可用浏览器打开作为下层窗口。`npm start -- --diagnostics` 输出显示帧、命中切换和落地坐标；诊断模式下 Command+Option+Shift+P 弹出同一个托盘菜单。`npm start -- --verify-menu` 在真实 Electron 图形会话里调用实际托盘菜单回调，断言暂停/恢复、四档窗口缩放及脚底锚点、显示/隐藏；尝试并恢复开机自启设置，最后通过菜单退出。此检查需要 GUI，不能替代真实鼠标的系统级穿透验收。

本机验证记录（2026-10-05）：

- `npm start -- --selftest`：退出码 0。
- Electron 实际启动；主屏工作区为 `{x:0,y:30,width:2560,height:1309}`，最终窗口为 `{x:1152,y:1091,width:256,height:256}`，脚底 `1091+248=1339`，窗口底边 `1347=1339+8`。
- 应用定向鼠标输入触发 `interactive true`、`dragged`、`petted`；较大拖动触发 `release fall` 和正确落地。
- 原生菜单回调检查：暂停/恢复、四档缩放、脚底锚点、隐藏/显示及退出通过；测试后恢复 scale=1。
- macOS 拒绝登录项注册，输出 `Operation not permitted`，返回 `status: not-found, openAtLogin: false`；开机自启未通过验收。
- 当前自动化输入直接投递给所选应用，无法证明系统实际选择的点击接收方；真实鼠标的透明区域穿透仍待人工确认，不能记为已通过。
- 新增动画验证：sleep/petted 各四张 256×256 RGBA 帧，整理时逐帧确认接触线 y=248。实际窗口截图显示专属被摸闭眼姿势；日志确认 petted 帧 1→2→3→4 后返回 idle，以及 sleep 四帧连续循环。新增自检退出码 0，原有 idle/tools/previews 的 10 个文件哈希未变。

新增拖拽/警觉验证：八张 256×256 RGBA 帧，脚底 y=248；自检检查拖拽专属帧、缺失回退与警觉 1→2→1→3→4 顺序。实际窗口截图确认被拎姿势，日志确认下落期间继续 dragged 并正确落地，以及 alert 完整张望顺序。原有 idle/sleep/petted 共 15 个文件哈希未变。

## 已知限制

目前已有坐姿、趴卧、张望、抚摸、固定被拎起/下落及上述八帧动作，没有 walk、jump；缺失动作显示 idle/frame1。生成的八帧之间仍可能存在少量毛线、脸形与位置差异；补帧和短过渡能柔化切换，但不等同于逐像素手工动画。身体命中区域随当前帧 alpha 更新。macOS 系统权限提示、安全桌面、部分全屏应用或独占窗口可能不允许宠物覆盖。开发运行尚未提供应用打包，开机自启不保证启动本项目。参见 [Electron 官方登录项文档](https://www.electronjs.org/docs/latest/api/app#appsetloginitemsettingssettings-macos-windows)。

## 固定拖拽与下落姿势

用户选定被拎起 A、下落 B。新增 assets/lifted/frame1.png 与 assets/falling/frame1.png，均为固定单帧、256×256 RGBA。真实拖拽只显示 lifted；松手重力下落只显示 falling；落地回待机。旧 dragged 四帧保留作菜单预览，不再用于真实拖拽。draggedFrameDurationMs 仅影响旧动作预览。原始候选与提示词保存在 renderer/pose-candidates/。

## 八帧版本验证

`npm start -- --selftest` 检查 64 张新 RGBA 帧、闭眼 120ms、左右转头顺序与倒序、歪头保持与返回、入睡→呼吸→醒来、提前醒来逆播、交互打断及固定拖拽/下落。
`npm start -- --diagnostics --verify-animation` 在真实窗口中依次播放入睡、呼吸、醒来、抚摸与警觉，检查恢复待机；测试阶段暂不采纳鼠标靠近，结束后恢复正常交互。
生成模式为内置 imagegen，完整提示词和资产目录记录在 [renderer/smooth-assets.md](renderer/smooth-assets.md)。旧素材保持不变。

新版 idle-tilt 八帧统一做 1.09 倍显示补偿，以 (128,248) 为缩放锚点；脚底不移动，点击 alpha 同步按补偿后的画面缓存，源 PNG 不修改。
