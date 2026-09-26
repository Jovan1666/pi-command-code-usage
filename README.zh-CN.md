# Command Code 额度 —— pi 扩展

在你**已经打开的 pi 里**直接看到 **Command Code** 套餐还剩多少——
5 小时、每周、每月三条窗口，带重置时间，常驻在输入框上方。

跑在你本机、不经过模型，所以**查额度不消耗额度**。

[English](README.md) · [核实记录](docs/FINDINGS.md)

[![Check](https://github.com/Jovan1666/pi-command-code-usage/actions/workflows/check.yml/badge.svg)](https://github.com/Jovan1666/pi-command-code-usage/actions/workflows/check.yml)

---

```
────────────────────────────────────────────────────────────  ← 输入框
CC GOAT │ 5h ███▎░░░░░░ 32% 3h12m后重置 │ 周 ████▏░░░░░ 41% 10-03重置 │ 月 █▊░░░░░░░░ 18% 剩$57.60 10-25重置
~                                                              ← pi 的默认 footer（不动它）
0.0%/1.0M (auto)                    (anthropic) claude-opus-4-8 • medium
```

这一行是 `belowEditor` widget：pi 的默认 footer 原样保留，它加在 footer 之上。

## 安装

```sh
pi install git:github.com/Jovan1666/pi-command-code-usage

# 或从本地克隆装
pi install ./pi-command-code-usage
```

手动装也可以，但**要把 `index.ts` 和 `src/cc-usage.mjs` 一起拷过去**——
只拷 `index.ts` 的话脚本定位不到，widget 会静默为空，不会报错：

```sh
mkdir -p ~/.pi/agent/extensions/commandcode-usage
cp index.ts src/cc-usage.mjs ~/.pi/agent/extensions/commandcode-usage/
```

扩展会在 `index.ts` 旁边和 `src/` 子目录两处找 `cc-usage.mjs`，两种布局都认。
实现就是这一个脚本：不用构建，也不装任何依赖。

全程不需要你填 API key——脚本自己去找，见[凭证](#凭证)。

## 显示什么

| 窗口 | 含义 | GOAT 档 |
|---|---|---|
| 5 小时 | 滚动突发上限——一次长会话掏不空整个月 | $14 |
| 每周 | 滚动 7 天上限 | $35 |
| 月度 | 计费周期内的额度 | $70 |

每条显示**已用百分比**、进度条、**重置时间**（一天内给倒计时，超过一天给日期）。
月度那条额外显示剩余金额。

颜色跟着用量走：低于 60% 绿、到 85% 黄、再高变红。（终端面板和 HTML 面板用更早的
50 / 80 分档——状态栏是那个为"余光扫一眼"调过的，所以报警更晚。）

没有滚动窗口的套餐（Provider、Enterprise）只显示余额。
没有 API 权限的套餐（Go）在状态栏里什么都不显示——不报错、也不留空位；
但你主动要终端面板时它会**如实报错**，因为那是你直接问的问题，沉默反而是错的。

## 没在用的时候它会自己藏起来

如果你配了 Command Code 却切到了别的模型，常驻的额度条就是噪音。
脚本会**逐轮**判断这个会话到底有没有走它：

1. **本地路由自己的映射** —— `cc-switch` 这类工具会把
   `ANTHROPIC_DEFAULT_OPUS_MODEL` / `..._MODEL_NAME` 成对写进环境变量，
   脚本读这对值就知道真实上游是谁。这是路由自己的配置，不是推测。
   （这条属于[推断而非实测](docs/FINDINGS.md)——万一拿不到，脚本会往下走而不是乱猜。）
2. **会话记录** —— 每条消息实际用的模型。
3. **账号活跃度** —— 兜底，只在前两条都给不出结论时用。

拿到的真实模型名去对照 Command Code 的公开模型目录（`/provider/v1/models`，免鉴权）。
不在目录里 → 隐藏。

有些模型名天然有歧义（`claude-opus-5` 原生和 Command Code 目录里都有），
这种情况**故意不猜**——用 `--model <子串>` 自己补。

**本扩展不走这道闸门**：它用 `--always` 取行，所以 widget 不会中途整行消失，
而是一直显示上次取到的数字。想要逐轮判定和"为什么现在不显示"，自己跑一次
`node src/cc-usage.mjs --statusline --why`；也可以给 `--idle-hide <分钟>` 用账号闲置兜底隐藏。

## 命令

本平台**没有 `/quota`**——扩展注册的是 `/ccq-bar`，而且由扩展自己处理，
不走模型，所以不消耗对话轮次。

```
/ccq-bar             查看状态（配置 + 当前数据）
/ccq-bar on|off      显示 / 隐藏
/ccq-bar toggle      切换
/ccq-bar refresh     立刻刷新
/ccq-bar status      等同于 `/ccq-bar` 不带参数
```

认不出的参数会退回状态报告，而不是报错。每条都会发一条通知，所以你能看到是哪条生效了。

## 行为

- 启动时取一次，之后每 60 秒一次，另外**每轮对话结束后补刷一次**
  （额度最值得看的时刻恰好是一轮刚结束）
- 重叠的刷新会被去重，不会叠加
- 取数失败时保留上一次的好数据，不显示错误——widget 上挂红字比旧数字更没用
- widget **不会自动截断**：`render()` 返回的行比终端宽会中断整个 TUI。
  靠 `cc-usage.mjs` 自己的宽度降级阶梯保证不超宽（它读 `COLUMNS`，扩展把值设成 120）
- 非 TUI 模式（`pi -p` / `--mode json`）下没有可画的界面，widget 是空操作；
  数据仍会取，但没人看得见

## 改这份代码前必须知道的一件事

**pi 明确禁止跨会话持有 `ctx`。** 用旧 ctx 调用任何 UI 方法会直接抛：

```
Error: This extension ctx is stale after session replacement or reload.
```

所以这里的写法是刻意的：

- `setWidget` 用**组件工厂**形式，从工厂参数里拿到 `tui` 句柄并长期持有
- 刷新数据后只调 `tui.requestRender()`，**不碰 ctx**
- 每次要调 `setWidget` 时，都用**本次事件自己拿到的** ctx

最初的版本把 `ctx` 存进变量、在定时器里复用，pi 直接用上面那个错误崩掉了——
这一点在 pi 的类型定义里看不出来，只有真跑才会暴露。

## 凭证

自动查找，顺序如下：

1. `COMMAND_CODE_API_KEY` / `COMMANDCODE_API_KEY` / `CMD_API_KEY`
2. 名字里含 `commandcode` 的任何环境变量
3. `~/.commandcode/auth.json`（官方 CLI 的登录态）
4. 你自己配置里的 Command Code provider 路由（读取的路径包含 `~/.pi/agent/settings.json`）
5. 直接写着 key、或写出要读哪个环境变量的文本配置（`apiKeyEnv` 二次解析）

全都找不到时状态栏**直接不渲染**——它不会把错误打到你的编辑器里。

## 环境要求

- **Node 18+**（脚本用；扩展本身不需要别的）
- 有 API 权限的 Command Code 套餐——$1 的 Go 档没有
- 带扩展与 widget 能力的 pi（开发时对着 pi 0.86.1 实测，`belowEditor` 那一行抓屏确认过）

## 关于"按当前速度会超限"的预警

脚本会算一个速度外推。**widget 里永远不显示它**；终端面板、`--compact`、`--md`、
`--html` 仍会打印，`--json` 里也一直有。

不让它进状态栏是有原因的：短样本外推几乎每次都会说"你要超了"——5 小时窗口刚开 25 分钟时，
一段正常的使用就能推出 140%——而一条永远亮着的警告等于没有警告。这些面板本来就是你主动
要来看的，多一行不碍事。

## 参与开发

```sh
node scripts/check.mjs          # 全部检查：渲染、判定、阈值、各输出格式、密钥、扩展自己的规则
node scripts/check.mjs --quiet  # 每个套件只打一行
```

这就是 CI 跑的那份脚本，本地过了线上就是绿的。它不联网、也不要凭证。

`src/cc-usage.mjs` 就是实现本体，直接改它——本仓库里没有任何生成或同步出来的副本。

## 许可

MIT —— 见 [LICENSE](LICENSE)。
