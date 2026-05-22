# Allin — 设计文档

- 日期：2026-05-19
- 版本：v1.0
- 状态：已批准

## 技术选型

| 决策 | 选择 | 原因 |
|------|------|------|
| 界面 | Web 本地浏览器 | 图表丰富，交互好，适合 Dashboard |
| 前端 | React 18 + Vite | 生态丰富，组件化适合多模块 |
| 后端 | Node.js + Express | 代理 API、SQLite、定时任务 |
| 语言 | TypeScript | 多数据结构，类型安全减少错误 |
| 组织 | Monorepo (npm workspaces) | 前后端分离，共享类型 |
| UI | shadcn/ui + Tailwind | 现代、灵活、TypeScript 友好 |
| 图表 | Recharts | React 原生，声明式 API |
| 数据库 | SQLite (better-sqlite3) | 轻量零配置，本地运行 |

## 项目结构

```
Allin/
├── packages/
│   ├── shared/
│   │   ├── types/          # Fund, Score, Position, Sector, News
│   │   └── constants/      # 评分权重、行业映射、信号阈值
│   ├── server/
│   │   ├── src/
│   │   │   ├── routes/     # /api/funds, /api/scores, /api/sectors...
│   │   │   ├── services/   # 评分计算、基金筛选、定投逻辑、行业排行
│   │   │   ├── adapters/   # 东方财富、天天基金、新浪财经 API 适配
│   │   │   ├── db/         # SQLite 初始化、迁移、查询
│   │   │   └── scheduler/  # 每日收盘后数据同步，盘中 5 分钟刷新
│   │   └── package.json
│   └── client/
│       ├── src/
│       │   ├── components/ # ui/ (shadcn 组件), fund/, dashboard/
│       │   ├── pages/      # Recommend, Portfolio, Search, Holdings, Market
│       │   ├── hooks/      # useFunds, useScores, useSectors
│       │   ├── lib/        # fetch 封装，类型安全的 API 客户端
│       │   └── App.tsx
│       └── package.json
├── docs/                   # 规格文档 + 设计文档
├── CLAUDE.md
├── package.json            # workspace root
└── tsconfig.base.json
```

## 数据流

```
外部 API（东方财富/天天基金/新浪） → adapter → service → route → JSON → React → UI
                                                         ↓
                                                       SQLite（历史缓存）
```

- **实时数据**：后端代理请求外部 API，聚合后返回前端
- **历史数据**：存入 SQLite，支持趋势查询
- **定时任务**：node-cron 驱动，收盘后全量更新，盘中每 5 分钟刷新实时价格
- **评分计算**：纯后端服务层，六维加权公式，不依赖外部 API

## 模块与 API 路由映射

| 模块 | 前端页面 | 后端路由 | 核心服务 |
|------|---------|---------|---------|
| 一：每日推荐 | `/recommend` | `GET /api/funds/recommend` | 六维评分 + Top N 筛选 |
| 二：持仓管理 | `/portfolio` | `GET/POST /api/portfolio/*` | 信号计算 + 定投 + 止盈 |
| 三：基金查询 | `/search` | `GET /api/funds/:code` | 评分报告生成 |
| 四：重仓股透视 | `/holdings` | `GET /api/funds/:code/holdings` | 持仓聚合 + 风格识别 |
| 五：市场概览 | `/market` | `GET /api/market/overview` | 板块排行 + 事件聚合 |

## 共享类型（packages/shared/types/）

```ts
// 基金评分
interface FundScore {
  momentum: number;      // 收益动量 0-25
  riskControl: number;   // 风险控制 0-20
  riskAdjusted: number;  // 风险调整 0-15
  manager: number;       // 经理能力 0-15
  scale: number;         // 规模流动 0-15
  sectorMatch: number;   // 景气匹配 0-10
  total: number;         // 总分 0-100
}

// 交易信号
type TradeSignal = 'buy' | 'hold' | 'reduce' | 'sell';

// 基金信息
interface FundInfo {
  code: string;
  name: string;
  type: string;
  manager: string;
  tenure: string;
  scale: number;
  score: FundScore;
  signal: TradeSignal;
}
```

## 第一优先级：搭建骨架

先不实现业务逻辑，搭建 Monorepo + 前后端通信骨架，跑通一个简单的 `/api/health` → 前端展示的链路。

### 验证标准
1. `npm install` 在根目录一键安装所有依赖
2. `npm run dev` 同时启动前后端
3. 浏览器打开显示一个可工作的前端页面
4. 前端能成功调用后端 API 并展示数据
