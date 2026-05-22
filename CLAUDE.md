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

## 上次进行到哪了（2026-05-22）

### 虚构数据全面清零修复（2026-05-22）
- ✅ **股票查询真实数据** — 腾讯API (qt.gtimg.cn) 获取PE/PB/ROE/市值，新浪API K线 + 实时价
- ✅ **买卖日期逻辑修正** — 仅当 signal=buy 时设置 buyDate/sellDate，其他信号显示"不建议买入"
- ✅ **K线不再降级为mock** — 新浪K线API优先，东方财富K线兜底，全部失败返回空数组
- ✅ **市场板块真实数据** — 优先东方财富 push2his API，回退 MCP 缓存（deepq-finance 真实数据）
- ✅ **市场要闻真实化** — 从 MCP 缓存读取真实新闻和后市观点，不做硬编码
- ✅ **今日实时分析 API** — GET /api/stocks/predict/today 提供精确到分钟的今日买卖建议
- ✅ **明日预测优化** — 与今日分析逻辑统一，区分今日/明日日历因子
- ✅ **仪表盘更新** — 同时展示今日实时分析和明日预测，每60秒自动刷新

### 数据源可靠性记录
| 数据源 | 状态 | 用途 |
|--------|------|------|
| 腾讯 qt.gtimg.cn (HTTP) | ✅ 稳定 | 股票基本面 PE/PB/市值 |
| 新浪 hq.sinajs.cn (HTTPS) | ✅ 稳定 | 实时行情 价格/涨跌幅 |
| 新浪 K线 money.finance.sina.com.cn (HTTPS) | ✅ 较稳定 | K线历史数据 |
| 东方财富 push2his K线 (HTTPS) | ✅ 较稳定 | K线兜底 |
| 东方财富 push2 股票列表 (HTTP/HTTPS) | ❌ 不可用 | 已弃用 |
| 东方财富 push2 板块行情 (HTTP/HTTPS) | ❌ 不可用 | 改用 push2his + MCP |
| MCP deepq-finance | ✅ 稳定 | 恐贪/温度/板块/新闻/后市

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
