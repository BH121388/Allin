# Allin — 基金智能投资决策工具

## 项目概述
本地运行的基金投资决策工具，集成五大核心模块：基金推荐、持仓管理、深度查询、重仓股透视、市场分析。基于量化策略模型和多因子评分体系。

## 技术栈
- Monorepo: npm workspaces (shared / server / client)
- 前端: React 18 + Vite + Tailwind CSS v3 + shadcn/ui + Recharts
- 后端: Node.js + Express + TypeScript + better-sqlite3
- 定时任务: node-cron
- 共享层: TypeScript 类型定义 + 业务常量

## 运行方式
```bash
npm install          # 安装所有依赖
npm run dev          # 同时启动前后端
```
- 前端: http://localhost:5173
- 后端: http://localhost:3001
- API 代理: Vite /api/* → 后端 3001

## 上次进行到哪了（2026-05-19）
- 完成需求规格说明书 v1.0
- 完成技术选型与架构设计
- **骨架搭建完成** — Monorepo + 前后端通信链路 + shadcn/ui 集成
- 端到端验证通过（健康检查 API + UI）
- **Task 1: 天天基金 API 适配器** — 基金数据抓取、解析、缓存
- **Task 2: 六维评分引擎** — 收益动量、风险控制、风险调整、经理能力、规模流动、景气匹配
- **Task 3: 推荐管道 + API 路由** — /api/funds/recommend 端点，每日推荐管道
- **Task 4: 前端推荐页面** — 推荐页面（雷达图 + Top 5 基金卡片），路由切换
- **Task 5: 定时刷新** — node-cron 每个交易日 15:30 + 启动时首次运行
- **模块一全部完成** — 端到端验证通过，API 返回 Top 5，前端展示完整
- **Task 1: 数据库 + 持仓 CRUD API** — SQLite 建表、funds/portfolio 路由、端到端验证
- **Task 2: 交易信号 + 技术指标服务** — generateSignal/getSignalSummary + MA/RSI/MACD/趋势判断
- **Task 3: 定投 + 止盈服务** — invest.ts / takeProfit.ts + API 端点
- **Task 4: 前端持仓页面** — PortfolioPage + HoldingCard + SignalBadge + InvestModal + AddFundForm + usePortfolio hook
- **Task 5: 导航 + 路由整合** — App.tsx 添加顶部导航栏（推荐/持仓），路由切换
- **模块二全部完成** — 持仓 CRUD、交易信号、定投计算、止盈评估、前端页面，端到端验证通过
- **模块三 Task 1: 基金查询 API** — GET /api/funds/search?code=XXXXXX，返回完整 FundAnalysis
- **模块三 Task 2: 前端搜索页面** — SearchPage 搜索框 + 分析报告（评分/风险/持仓/同类比较），导航栏新增"查询"
- **模块三全部完成** — 搜索 API 返回完整分析（354字分析+8项风险指标+5只重仓），前端搜索页+报告展示，端到端验证通过
- **模块四 Task 1: 重仓股详情 API + 板块识别** — holdings.ts 服务（6大类×10只股票模板 / 风格匹配 / 加权涨跌幅 / 板块自动识别 / 风格判定），GET /api/funds/:code/holdings 端点
- **模块四 Task 2: 前端 HoldingsPanel + 集成** — HoldingsPanel 十大重仓表格+板块标签+加权涨跌，集成到 SearchPage 和 PortfolioPage
- **模块四全部完成** — 重仓股透视 API（6风格/10只/加权涨跌/板块识别），前端面板+集成，端到端验证通过
- **模块五 Task 1: 市场数据服务 + API** — market.ts 服务（30个板块/涨跌生成/热度标记/新闻事件/机会风险），GET /api/market/overview 端点
- **模块五 Task 2: 前端市场页面** — MarketPage（板块排行30行表格+前5绿底后5红底/今日要闻/市场影响总结/红利机会/风险提示），useMarket hook，导航栏新增"市场"tab
- **模块五全部完成** — 市场概览 API + 前端市场页面，端到端TypeScript编译通过

## 接下来要做什么
- 🎉 **全部五大模块开发完成**（2026-05-19），共 29 个提交
- 后续可扩展：接入真实 API 数据源、增加更多基金类型、优化移动端体验

## 关键文件索引

### 文档
| 文件 | 内容 |
|------|------|
| `docs/01-项目总览.md` | 完整需求规格说明书 |
| `docs/superpowers/specs/2026-05-19-allin-design.md` | 技术设计文档 |
| `docs/superpowers/plans/2026-05-19-allin-skeleton.md` | 骨架实现计划 |

### 代码
| 文件 | 内容 |
|------|------|
| `packages/shared/src/types/index.ts` | 所有 TypeScript 类型定义 |
| `packages/shared/src/constants/index.ts` | 评分权重、阈值、映射常量 |
| `packages/server/src/index.ts` | Express 服务入口 (port 3001) |
| `packages/server/src/db/index.ts` | SQLite 数据库初始化 (3 张表) |
| `packages/server/src/routes/health.ts` | GET /api/health |
| `packages/server/src/routes/funds.ts` | GET /api/funds/recommend |
| `packages/server/src/routes/portfolio.ts` | POST/GET/DELETE /api/portfolio |
| `packages/server/src/routes/search.ts` | GET /api/funds/search?code=X |
| `packages/server/src/routes/holdings.ts` | GET /api/funds/:code/holdings |
| `packages/server/src/services/scoring.ts` | 六维评分引擎 |
| `packages/server/src/services/holdings.ts` | 重仓股详情服务（6类模板/板块识别/风格判定） |
| `packages/server/src/services/recommend.ts` | 推荐管道（5步） |
| `packages/server/src/services/signals.ts` | 交易信号生成器 |
| `packages/server/src/services/technical.ts` | 技术指标计算 (MA/RSI/MACD) |
| `packages/server/src/services/invest.ts` | 定投计算器（PE分位 × 预算） |
| `packages/server/src/services/takeProfit.ts` | 止盈规则引擎（5种策略） |
| `packages/server/src/adapters/eastmoney.ts` | 天天基金 API 适配器 |
| `packages/server/src/scheduler/daily.ts` | 每日定时刷新（15:30） |
| `packages/server/src/services/market.ts` | 市场数据生成器（板块/新闻/机会/风险） |
| `packages/server/src/routes/market.ts` | GET /api/market/overview |
| `packages/client/src/App.tsx` | React 前端入口（路由） |
| `packages/client/src/pages/RecommendPage.tsx` | 每日推荐 Top 5 页面 |
| `packages/client/src/pages/SearchPage.tsx` | 基金查询与完整分析报告页面 |
| `packages/client/src/components/fund/FundCard.tsx` | 基金评分卡片组件 |
| `packages/client/src/components/fund/ScoreRadar.tsx` | 六维雷达图组件 |
| `packages/client/src/components/fund/HoldingsPanel.tsx` | 十大重仓股面板（表格+板块+风格） |
| `packages/client/src/hooks/useRecommendations.ts` | 推荐数据获取 hook |
| `packages/client/src/hooks/useFundSearch.ts` | 基金查询 hook |
| `packages/client/src/hooks/usePortfolio.ts` | 持仓数据 CRUD hook |
| `packages/client/src/hooks/useHoldings.ts` | 重仓股数据获取 hook |
| `packages/client/src/hooks/useMarket.ts` | 市场数据获取 hook |
| `packages/client/src/pages/PortfolioPage.tsx` | 持仓管理页面 |
| `packages/client/src/pages/MarketPage.tsx` | 市场概览页面（板块排行+要闻+机会） |
| `packages/client/src/components/portfolio/SignalBadge.tsx` | 交易信号标签组件 |
| `packages/client/src/components/portfolio/HoldingCard.tsx` | 持仓卡片（含止盈评估） |
| `packages/client/src/components/portfolio/InvestModal.tsx` | 定投计算弹窗 |
| `packages/client/src/components/portfolio/AddFundForm.tsx` | 添加基金表单 |
| `packages/client/src/components/ui/` | shadcn/ui 组件 (Button, Card) |

## 常见命令
```bash
npm install              # 安装所有依赖
npm run dev              # 同时启动前后端
npm run build            # 构建所有包
```
