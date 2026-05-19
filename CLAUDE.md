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

## 接下来要做什么
1. **模块三** — 基金查询与评分报告
2. **模块四** — 重仓股透视与风格识别
3. **模块五** — 板块排行与市场要闻

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
| `packages/server/src/routes/portfolio.ts` | GET/DELETE /api/portfolio |
| `packages/server/src/services/scoring.ts` | 六维评分引擎 |
| `packages/server/src/services/recommend.ts` | 推荐管道（5步） |
| `packages/server/src/services/signals.ts` | 交易信号生成器 |
| `packages/server/src/services/technical.ts` | 技术指标计算 (MA/RSI/MACD) |
| `packages/server/src/services/invest.ts` | 定投计算器（PE分位 × 预算） |
| `packages/server/src/services/takeProfit.ts` | 止盈规则引擎（5种策略） |
| `packages/server/src/adapters/eastmoney.ts` | 天天基金 API 适配器 |
| `packages/server/src/scheduler/daily.ts` | 每日定时刷新（15:30） |
| `packages/client/src/App.tsx` | React 前端入口（路由） |
| `packages/client/src/pages/RecommendPage.tsx` | 每日推荐 Top 5 页面 |
| `packages/client/src/components/fund/FundCard.tsx` | 基金评分卡片组件 |
| `packages/client/src/components/fund/ScoreRadar.tsx` | 六维雷达图组件 |
| `packages/client/src/hooks/useRecommendations.ts` | 推荐数据获取 hook |
| `packages/client/src/hooks/usePortfolio.ts` | 持仓数据 CRUD hook |
| `packages/client/src/pages/PortfolioPage.tsx` | 持仓管理页面 |
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
