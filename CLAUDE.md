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

## 上次进行到哪了（2026-05-21）

### 模块一～五全部完成（2026-05-19~20）
- 骨架搭建、六维评分、推荐管道、前端推荐页、定时刷新
- 数据库 + 持仓 CRUD、交易信号、定投/止盈、前端持仓页
- 基金查询 API + 前端搜索页（完整分析报告）
- 市场数据服务 + 前端市场概览页

### 三大修复（2026-05-20）
- ✅ **Fix 1: STOCK_NAME_MAP 扩展** — 500+只覆盖 AI 算力/光模块/半导体/机器人/低空经济/创新药等
- ✅ **Fix 2: 真实净值** — portfolio 和 takeProfit 用 fetchFundDetail() 获取真实净值
- ✅ **Fix 3: 中小盘转向** — mock 基金池 10 只中小盘热门赛道；评分权重调整

### 优先级 2 完成 — 重仓股全真实数据（2026-05-21）
- ✅ **holdings 路由重写** — 移除 6 类模板 mock 降级，优先天天基金持仓明细 + 新浪实时行情
- ✅ **search 路由同步** — 查询报告持仓改为真实数据，删除 ~120 行 mock 代码
- ✅ **板块识别升级** — 300+ 股票关键词 → 10 大板块标签自动匹配
- ✅ **AddFundForm bug 修复** — 成本净值改用 navHistory 最后一条（官方净值），不再误用盘中估算

### A股股票模块（2026-05-21~22 完整版）
- ✅ **六维评分引擎** — 动量25+风控20+风调15+质量15+估值15+景气10，支持自定义权重
- ✅ **数据适配器** — 东方财富(A股列表/K线/基本面/财报) + 新浪(实时行情) + MCP deepq-finance(恐贪/温度/板块/观点)
- ✅ **推荐管道** — 过滤(>2000亿大票/ST/退市/亏损) → K线获取 → 六维评分 → Top 10中盘成长股
- ✅ **五维预测引擎** — 情绪30+技术25+宽度20+板块15+日历10 → 买/不买 + 波动区间 + 自动复盘
- ✅ **八项技术指标** — MA/RSI/MACD/BOLL/KDJ/OBV/趋势判断/OBV背离
- ✅ **策略回测** — 历史评分模拟 → 收益追踪 → 胜率/Alpha → 有效性验证
- ✅ **止盈止损** — 移动止盈/目标止盈/评分下降/技术止损四策略
- ✅ **八前端页面** — 仪表盘/推荐/查询/对比/回测/持仓/筛选/市场
- ✅ **响应式** — 桌面全功能 + 移动汉堡菜单
- ✅ **11个API** — recommend/search/compare/backtest/screener/market/predict/sector/portfolio(CRUD+Export)/watchlist(CRUD)
- ✅ **6张数据表** — stocks/stock_scores/stock_recommendations/stock_portfolio/predictions/watchlist
- ✅ **定时调度** — 15:30 推荐刷新 + 15:35 预测生成

## 接下来要做的事（后续迭代）
- 更多数据源接入（龙虎榜/北向资金/两融）
- 实盘交易接口对接
- AI 智能问答
## 接下来要做的事（后续迭代）
- 更多数据源接入（龙虎榜/北向资金/两融）
- 实盘交易接口对接
- AI 智能问答

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

### 股票模块
| 文件 | 内容 |
|------|------|
| `packages/shared/src/types/stock.ts` | 股票 TypeScript 类型定义 |
| `packages/shared/src/constants/stock.ts` | 股票评分权重、阈值、行业映射常量 |
| `packages/server/src/adapters/stock.ts` | 东方财富 + 新浪股票数据适配器 |
| `packages/server/src/services/stock-scoring.ts` | 股票六维评分引擎 |
| `packages/server/src/services/stock-recommend.ts` | 股票每日推荐管道 |
| `packages/server/src/routes/stock-search.ts` | GET /api/stocks/search?code=X |
| `packages/server/src/routes/stock-recommend.ts` | GET /api/stocks/recommend |
| `packages/client/src/pages/StockRecommendPage.tsx` | 股票推荐页面 |
| `packages/client/src/pages/StockSearchPage.tsx` | 股票查询分析页面 |
| `packages/client/src/hooks/useStockRecommendations.ts` | 股票推荐 hook |
| `packages/client/src/hooks/useStockSearch.ts` | 股票查询 hook |
| `packages/server/src/routes/stock-portfolio.ts` | 股票持仓 CRUD API |
| `packages/client/src/pages/StockPortfolioPage.tsx` | 股票持仓管理页面 |
| `packages/client/src/hooks/useStockPortfolio.ts` | 股票持仓 hook |
| `packages/server/src/services/stock-screener.ts` | 多条件股票筛选服务 |
| `packages/server/src/routes/stock-screener.ts` | GET /api/stocks/screener |
| `packages/client/src/pages/StockScreenerPage.tsx` | 股票筛选器页面 |
| `packages/client/src/hooks/useStockScreener.ts` | 股票筛选 hook |
| `packages/server/src/services/stock-market.ts` | A股市场概览服务 |
| `packages/server/src/routes/stock-market.ts` | GET /api/stocks/market |
| `packages/client/src/pages/StockMarketPage.tsx` | A股市场概览页面 |
| `packages/client/src/hooks/useStockMarket.ts` | 市场数据 hook |

## 常见命令
```bash
npm install              # 安装所有依赖
npm run dev              # 同时启动前后端
npm run build            # 构建所有包
```
