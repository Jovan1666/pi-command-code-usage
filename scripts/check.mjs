#!/usr/bin/env node
/**
 * 一条命令给出整个仓库的结论。
 *
 *   node scripts/check.mjs            全部检查
 *   node scripts/check.mjs --quiet    每个套件只打一行
 *
 * CI 直接调这个文件，所以本地和线上是同一套判定——不会出现"本地过了 CI 挂"。
 * 不联网、不需要真实凭证。
 */
import { spawnSync } from 'node:child_process';
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath, pathToFileURL } from 'node:url';

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const CORE = path.join(ROOT, 'src', 'cc-usage.mjs');
const ENTRY = path.join(ROOT, 'index.ts');
const QUIET = process.argv.includes('--quiet');

const suites = [];
const record = (name, fn) => suites.push({ name, fn });

/* ---------------------------------------------------------------- 工具 */

let failures = [];

function assert(condition, message) {
  if (!condition) failures.push(message);
}

/** 跑一次 core（不联网）并返回去掉 ANSI 的 stdout。 */
function runCore(args, env = {}) {
  const r = spawnSync(process.execPath, [CORE, ...args], {
    encoding: 'utf8',
    env: { ...process.env, ...env },
    timeout: 30_000,
  });
  if (r.error) throw r.error;
  return String(r.stdout || '').replace(/\x1b\[[0-9;]*m/g, '');
}

/** 显示宽度：CJK/全角算 2，其余算 1，与 core 内部口径一致。 */
function displayWidth(text) {
  let w = 0;
  for (const ch of text) {
    const cp = ch.codePointAt(0);
    w += cp >= 0x1100 && (
      cp <= 0x115f || cp === 0x2329 || cp === 0x232a ||
      (cp >= 0x2e80 && cp <= 0xa4cf) || (cp >= 0xac00 && cp <= 0xd7a3) ||
      (cp >= 0xf900 && cp <= 0xfaff) || (cp >= 0xfe30 && cp <= 0xfe6f) ||
      (cp >= 0xff00 && cp <= 0xff60) || (cp >= 0xffe0 && cp <= 0xffe6)
    ) ? 2 : 1;
  }
  return w;
}

function walk(dir, out = []) {
  for (const entry of fs.readdirSync(dir, { withFileTypes: true })) {
    if (entry.name === '.git' || entry.name === 'node_modules' || entry.name === '.devdeps') continue;
    const full = path.join(dir, entry.name);
    if (entry.isDirectory()) walk(full, out);
    else out.push(full);
  }
  return out;
}

/* ----------------------------------------------------- 1. 状态栏渲染 */

record('statusline', () => {
  let checked = 0;

  // 按量计费套餐的输出是确定的（金额固定、没有时间），可以逐字断言。
  const provider = runCore(['--statusline', '--rows', '1', '--demo', 'provider'], { COLUMNS: '140' }).trim();
  assert(provider === 'CC Provider │ 余额 $47.66',
    `按量计费套餐应只显示余额，实际得到：${JSON.stringify(provider)}`);
  checked += 1;

  for (const scenario of ['normal', 'hot', 'max']) {
    const line = runCore(['--statusline', '--rows', '1', '--demo', scenario], { COLUMNS: '140' }).trim();
    const name = `--demo ${scenario}`;
    assert(line.startsWith('CC '), `${name}: 应以 "CC " 开头，实际 ${JSON.stringify(line.slice(0, 20))}`);
    assert(line.split('│').length === 4, `${name}: 单行模式应有 4 段（套餐名 + 三条窗口），实际 ${line.split('│').length}`);
    assert(/\d+%/.test(line), `${name}: 应含百分比`);
    assert(line.includes('重置'), `${name}: 三条窗口都该带重置时间`);
    // 绝不带 ANSI：宿主把输出当纯文本渲染，带上会原样显示成乱码。
    assert(!/\x1b\[/.test(runCore(['--statusline', '--rows', '1', '--demo', scenario])), `${name}: 不应输出 ANSI`);
    checked += 1;

    const three = runCore(['--statusline', '--demo', scenario], { COLUMNS: '140' }).trim();
    assert(three.split('\n').length === 3, `${name}: 三行模式应输出 3 行`);
    checked += 1;
  }

  // 宽度自适应：任何终端宽度下都不能折行（折行会让整个底部错位）。
  for (const cols of ['200', '140', '120', '110', '100', '95', '90', '80']) {
    const line = runCore(['--statusline', '--rows', '1', '--demo'], { COLUMNS: cols }).trim();
    const w = displayWidth(line);
    assert(w <= Number(cols), `COLUMNS=${cols}: 行宽 ${w} 超了`);
    assert(!line.includes('\n'), `COLUMNS=${cols}: 不该折行`);
    checked += 1;
  }

  return `${checked} 项渲染断言`;
});

/* -------------------------------------------------------- 2. 隐藏逻辑 */

record('gating', async () => {
  // 直接测判定函数，不跑整条流水线：整条要凭证、要联网，CI 上两样都没有。
  // 之前就是那样写的，于是本地过、CI 挂。
  const { decideRoute, normalizeModel, routeDecision } = await import(pathToFileURL(CORE).href);
  const catalog = ['deepseek-v4.1-flash', 'claude-opus-5', 'kimi-k2.7-code'];

  assert(normalizeModel('deepseek/deepseek-v4.1-flash') === 'deepseek-v4.1-flash', '归一化应去掉 vendor 前缀');
  assert(normalizeModel('claude-opus-5[1M]') === 'claude-opus-5', '归一化应去掉 [1M] 这类后缀');
  assert(normalizeModel('K2.7 Code') === 'k2.7-code', '归一化应把空白折成连字符');

  assert(decideRoute('deepseek/deepseek-v4.1-flash', catalog) === 'yes', '目录里有的模型 -> 在用');
  assert(decideRoute('totally-made-up-xyz', catalog) === 'no', '目录里没有 -> 不在用');
  assert(decideRoute(null, catalog) === 'unknown', '拿不到模型名 -> 未知，交给下一级判据');
  assert(decideRoute('deepseek-v4.1-flash', null) === 'unknown', '没有目录 -> 未知，不猜');

  // 裸 claude-* 名字原生 Anthropic 也有，必须回避而不是当成命中
  assert(decideRoute('claude-opus-5', catalog) === 'unknown', 'claude-* 有歧义 -> 不猜');
  assert(decideRoute('claude-opus-5', catalog, { trustedSource: true }) === 'yes',
    '来自本地路由映射的 claude-* 是确定的，应当显示');

  // 用户自己补的别名优先于目录
  assert(decideRoute('kimi-k2.7-code', catalog, { modelPatterns: ['k2.7-code'] }) === 'yes', '用户别名应命中');
  assert(decideRoute('deepseek-v4.1-flash', catalog, { modelPatterns: ['k2.7-code'] }) === 'no',
    '给了别名就按别名来，不再看目录');

  // 两种宿主的 stdin 形状不同，routeDecision 必须都认：
  // 一种把 model 作为**纯字符串**给（那时它直接就是真实模型名，而 transcript_path 是空的）；
  // 另一种给对象 { id, display_name }，真实模型要去 transcript 里找。
  // 显式传空的 env：不然结果取决于跑测试那台机器有没有设 cc-switch 的模型映射，
  // 那正是上一个版本「本地过 CI 挂」的原因。
  const stringModel = routeDecision(
    { model: 'gpt-5.6-terra', transcript_path: '' },
    { catalog: [...catalog, 'gpt-5.6-terra'], env: {} });
  assert(stringModel.decision === 'yes', '字符串形状的 model 应当被认出来');

  const stringModelOutside = routeDecision({ model: 'gpt-5.6-terra', transcript_path: '' }, { catalog, env: {} });
  assert(stringModelOutside.decision === 'no', '给的模型不在目录里就该隐藏');

  const noModel = routeDecision({ transcript_path: '' }, { catalog, env: {} });
  assert(noModel.decision === 'unknown', '没给 model 时是未知，不是"不在用"');

  const objectModel = routeDecision({ model: { id: 'claude-opus-5[1M]' }, transcript_path: '' }, { catalog, env: {} });
  assert(objectModel.decision === 'unknown',
    '对象形状的 model 不该被当成模型名——真实模型在 transcript 里');

  return '15 项判定断言';
});

/* ------------------------------------------------------- 3. 阈值与钩子 */

record('threshold+hook', () => {
  const under = runCore(['--statusline', '--threshold', '70', '--demo']).trim();
  assert(under === '', `未过阈值不该有输出，实际：${JSON.stringify(under.slice(0, 40))}`);

  const over = runCore(['--statusline', '--threshold', '30', '--demo']).trim();
  assert(over.startsWith('CC '), '过了阈值应输出面板');

  // 钩子必须吐合法 JSON，且 systemMessage 是纯文本
  const hook = runCore(['--hook', '--always', '--demo']).trim();
  let parsed = null;
  try { parsed = JSON.parse(hook); } catch { /* 下面断言会报 */ }
  assert(parsed && typeof parsed.systemMessage === 'string', `钩子应输出 {"systemMessage": …}，实际：${hook.slice(0, 60)}`);
  assert(parsed && !/\x1b\[/.test(parsed.systemMessage), 'systemMessage 不能含 ANSI（会原样显示成乱码）');
  assert(parsed && !parsed.hookSpecificOutput, '钩子不该用 additionalContext——那会进模型上下文、每轮烧 token');

  return '阈值静默 + 钩子 JSON 形状';
});

/* ------------------------------------------------------------ 4. 其它输出 */

record('formats', () => {
  let n = 0;
  for (const [args, marker, name] of [
    [['--demo'], 'Command Code', '终端面板'],
    [['--md', '--demo'], '|', 'Markdown'],
    [['--compact', '--demo'], 'CC GOAT', '单行摘要'],
  ]) {
    const out = runCore(args);
    assert(out.includes(marker), `${name} 应包含 ${JSON.stringify(marker)}`);
    n += 1;
  }
  const json = runCore(['--json', '--demo']);
  let doc = null;
  try { doc = JSON.parse(json); } catch { /* 断言会报 */ }
  assert(doc && doc.plan && doc.windows && doc.monthly, '--json 应是自洽快照');
  n += 1;

  // 不联网的 demo 不该碰网络；--help 不该跑主流程
  assert(runCore(['--help']).includes('--statusline'), '--help 应列出 --statusline');
  n += 1;
  return `${n} 种输出`;
});

/* ------------------------------------------------------- 5. 全仓静态检查 */

record('static', () => {
  const files = walk(ROOT);
  let json = 0;
  let js = 0;

  for (const f of files) {
    if (f.endsWith('.json')) {
      try { JSON.parse(fs.readFileSync(f, 'utf8')); json += 1; }
      catch (err) { assert(false, `JSON 非法: ${path.relative(ROOT, f)} — ${err.message}`); }
    }
  }

  for (const f of files) {
    if (!/\.(mjs|cjs|js)$/.test(f)) continue;
    const r = spawnSync(process.execPath, ['--check', f], { encoding: 'utf8', timeout: 20_000 });
    assert(r.status === 0, `语法错误: ${path.relative(ROOT, f)}`);
    js += 1;
  }

  return `${json} 个 JSON + ${js} 个 JS`;
});

/* -------------------------------------------------------- 6. 密钥与隐私 */

record('secrets', () => {
  // 别让 API key、本机绝对路径或邮箱被提交进去——这是要公开发布的仓库。
  const patterns = [
    [/user_[A-Za-z0-9_-]{16,}/, 'Command Code key'],
    [/sk-[A-Za-z0-9]{20,}/, 'OpenAI 风格 key'],
    [/ghp_[A-Za-z0-9]{20,}/, 'GitHub token'],
    [/github_pat_[A-Za-z0-9_]{20,}/, 'GitHub PAT'],
    [/C:[\\/]Users[\\/](?!admin[\\/]\.claude)[A-Za-z0-9._-]+/, '个人绝对路径'],
    [/[A-Za-z0-9._%+-]+@(?!example\.com|users\.noreply)[A-Za-z0-9.-]+\.[A-Za-z]{2,}/, '邮箱'],
  ];
  let scanned = 0;
  for (const f of walk(ROOT)) {
    if (/\.(png|jpg|ico|woff2?|lock)$/.test(f)) continue;
    // 本文件自己的规则里就写着这些形态，跳过它
    if (f === fileURLToPath(import.meta.url)) continue;
    const text = fs.readFileSync(f, 'utf8');
    for (const [re, label] of patterns) {
      const hit = text.match(re);
      if (hit) assert(false, `${label} 出现在 ${path.relative(ROOT, f)}: ${hit[0].slice(0, 24)}…`);
    }
    scanned += 1;
  }
  return `${scanned} 个文件已扫描`;
});

/* ------------------------------------------------- 7. 扩展自己的规矩 */

record('extension', () => {
  let checked = 0;
  const src = fs.readFileSync(ENTRY, 'utf8');

  // 本平台没有 /quota（那是提示词命令，要花一轮对话）；这里注册的是扩展自己处理的 /ccq-bar。
  const reg = /pi\.registerCommand\(\s*'([^']+)'/.exec(src);
  assert(reg && reg[1] === 'ccq-bar',
    `应注册 /ccq-bar，实际 ${reg ? `/${reg[1]}` : '没找到 registerCommand'}`);
  checked += 1;

  // 五个子命令都要真的被处理：on / off / toggle / refresh 各有分支，status 是缺省那支。
  for (const sub of ['on', 'off', 'toggle', 'refresh']) {
    assert(new RegExp(`cmd === '${sub}'`).test(src), `/ccq-bar ${sub} 没有单独的处理分支`);
  }
  assert(/\|\|\s*'status'/.test(src), '/ccq-bar 不带参数时应落到 status');
  assert(/\}\s*else\s*\{/.test(src), '/ccq-bar 缺一个兜底分支：认不出的参数也该回状态报告而不是什么都不做');
  checked += 1;

  // 说明文字得列全五个，否则用户看不见 status（缺省那支）能做什么。
  const description = /description:\s*'([^']*)'/.exec(src);
  const desc = description ? description[1] : '';
  assert(/on\s*\|\s*off\s*\|\s*toggle\s*\|\s*refresh\s*\|\s*status/.test(desc),
    `/ccq-bar 的说明应列全 on | off | toggle | refresh | status，实际：${JSON.stringify(desc)}`);
  checked += 1;

  // 显示位：必须在输入框上方的 belowEditor，widget 才看得见。
  assert(/placement:\s*'belowEditor'/.test(src), 'widget 应当装在 belowEditor 上（否则跑到别的槽位去了）');
  checked += 1;

  // 取的是"永远显示的单行"：--statusline --rows 1 --always，并且给足宽度的档位。
  assert(/'--statusline'/.test(src) && /'--rows'/.test(src), '扩展应当以 --statusline --rows 1 取行');
  assert(/'--always'/.test(src), '扩展用 --always 取行——不这样的话脚本的逐轮判定会把行藏掉');
  assert(/COLUMNS/.test(src), '应当设置 COLUMNS：widget 不会自动截断，超宽会中断整个 TUI');
  checked += 1;

  // 脚本就在 src/ 下，扩展两处都找得到（只拷 index.ts 会静默为空）。
  assert(/'src',\s*'cc-usage\.mjs'/.test(src), '入口应能在 src/ 布局下找到 cc-usage.mjs');
  assert(fs.existsSync(CORE), 'src/cc-usage.mjs 不存在——扩展装上也取不到数');
  checked += 1;

  // ctx 绝不能存进变量：pi 禁止跨会话持有 ctx，旧 ctx 调任何 UI 方法都会直接抛。
  assert(!/(let|var)\s+ctx\b/.test(src), '不能把 ctx 存进变量——pi 的 ctx 会过期，复用会直接崩');
  checked += 1;

  // 包元数据：已发布的名字不许改，发布出去的包里必须带上 index.ts 与脚本。
  const pkg = JSON.parse(fs.readFileSync(path.join(ROOT, 'package.json'), 'utf8'));
  assert(pkg.name === 'pi-commandcode-usage', `包名应保持 pi-commandcode-usage，实际 ${pkg.name}`);
  assert(pkg.pi && Array.isArray(pkg.pi.extensions) && pkg.pi.extensions.includes('./index.ts'),
    'package.json 的 pi.extensions 应指向 ./index.ts');
  for (const rel of pkg.files ?? []) {
    assert(fs.existsSync(path.join(ROOT, rel)), `files 里的 ${rel} 不存在——发布出去的包会缺文件`);
  }
  for (const rel of ['index.ts', 'src/cc-usage.mjs', 'README.md']) {
    assert((pkg.files ?? []).includes(rel), `files 里缺 ${rel}`);
  }
  for (const key of ['homepage', 'repository']) {
    assert(typeof pkg[key] === 'string' && pkg[key].endsWith('github.com/Jovan1666/pi-command-code-usage'),
      `${key} 应指向本仓库，实际 ${pkg[key]}`);
  }
  checked += 1;

  // 版本号一致：CHANGELOG 最上面那条就是 package.json 的版本。
  const changelog = fs.readFileSync(path.join(ROOT, 'CHANGELOG.md'), 'utf8');
  const top = /^##\s+(\S+)\s+—/m.exec(changelog);
  assert(top && top[1] === pkg.version,
    `CHANGELOG 最上面的版本（${top ? top[1] : '没有解析到'}）与 package.json（${pkg.version}）不一致`);
  checked += 1;

  return `${checked} 项扩展断言`;
});

/* ------------------------------------------------------------ 执行 */

console.log('Command Code Usage (pi) — 仓库检查\n');
let failed = 0;

for (const { name, fn } of suites) {
  failures = [];
  const started = Date.now();
  let summary = '';
  try {
    summary = (await fn()) ?? '';
  } catch (err) {
    failures.push(`套件抛错：${err instanceof Error ? err.message : String(err)}`);
  }
  const ms = Date.now() - started;

  if (failures.length === 0) {
    console.log(`${QUIET ? '' : '  ok    '}${name.padEnd(14)} ${summary}  (${ms}ms)`);
  } else {
    failed += 1;
    console.log(`${QUIET ? '' : '  FAIL  '}${name.padEnd(14)} —  (${ms}ms)`);
    for (const f of failures) console.log(`          ${f}`);
  }
}

console.log('');
if (failed > 0) {
  console.log(`${failed} 个套件失败。`);
  process.exit(1);
}
console.log(`${suites.length} 个套件全部通过。`);
