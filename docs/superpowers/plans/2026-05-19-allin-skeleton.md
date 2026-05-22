# Allin 骨架搭建 — 实现计划

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** 搭建 Monorepo（npm workspaces）骨架，前后端 + 共享类型通信链路跑通，浏览器展示健康检查结果。

**Architecture:** npm workspaces Monorepo，三个包：`shared`（类型+常量）、`server`（Express+SQLite+定时任务）、`client`（React+Vite+Tailwind+shadcn/ui）。前后端通过 HTTP JSON API 通信。

**Tech Stack:** TypeScript, Express, React 18, Vite, Tailwind CSS v3, shadcn/ui, better-sqlite3, concurrently

---

### Task 1: 根目录 Workspace 配置

**Files:**
- Modify: `package.json` (根目录)
- Create: `tsconfig.base.json`

- [ ] **Step 1: 更新根 package.json 为 workspace root**

```bash
cd "C:\Users\BH647\Desktop\Allin"
```

将 `package.json` 改为：

```json
{
  "name": "allin",
  "private": true,
  "workspaces": ["packages/*"],
  "scripts": {
    "dev": "concurrently -n server,client -c blue,green \"npm run dev -w packages/server\" \"npm run dev -w packages/client\"",
    "build": "npm run build -w packages/shared && npm run build -w packages/server && npm run build -w packages/client",
    "lint": "tsc --noEmit -p tsconfig.base.json"
  },
  "devDependencies": {
    "concurrently": "^9.1.0",
    "typescript": "^5.7.0"
  }
}
```

- [ ] **Step 2: 创建 tsconfig.base.json**

```json
{
  "compilerOptions": {
    "target": "ES2022",
    "module": "ESNext",
    "moduleResolution": "bundler",
    "strict": true,
    "esModuleInterop": true,
    "skipLibCheck": true,
    "forceConsistentCasingInFileNames": true,
    "declaration": true,
    "sourceMap": true,
    "resolveJsonModule": true,
    "isolatedModules": true
  }
}
```

- [ ] **Step 3: 创建 packages 目录**

```bash
mkdir -p packages/shared/src/types packages/shared/src/constants packages/server/src/routes packages/server/src/services packages/server/src/adapters packages/server/src/db packages/server/src/scheduler packages/client/src
```

- [ ] **Step 4: 提交**

```bash
git add package.json tsconfig.base.json && git commit -m "$(cat <<'EOF'
feat: add monorepo root workspace config

Co-Authored-By: Claude Opus 4.7 <noreply@anthropic.com>
EOF
)"
```

---

### Task 2: Shared 包 — 类型定义与常量

**Files:**
- Create: `packages/shared/package.json`
- Create: `packages/shared/tsconfig.json`
- Create: `packages/shared/src/types/index.ts`
- Create: `packages/shared/src/constants/index.ts`
- Create: `packages/shared/src/index.ts`

- [ ] **Step 1: 创建 packages/shared/package.json**

```json
{
  "name": "@allin/shared",
  "version": "1.0.0",
  "private": true,
  "main": "./src/index.ts",
  "types": "./src/index.ts",
  "scripts": {
    "build": "tsc",
    "typecheck": "tsc --noEmit"
  }
}
```

- [ ] **Step 2: 创建 packages/shared/tsconfig.json**

```json
{
  "extends": "../../tsconfig.base.json",
  "compilerOptions": {
    "outDir": "./dist",
    "rootDir": "./src"
  },
  "include": ["src"]
}
```

- [ ] **Step 3: 创建 packages/shared/src/types/index.ts**

```typescript
// ============================================================
// 基金评分体系 — 六维度加权（总分 100）
// ============================================================

export interface FundScore {
  momentum: number;       // 收益动量 0-25
  riskControl: number;    // 风险控制 0-20
  riskAdjusted: number;   // 风险调整收益 0-15
  manager: number;        // 经理能力 0-15
  scale: number;          // 规模流动性 0-15
  sectorMatch: number;    // 行业景气匹配 0-10
  total: number;          // 综合得分 0-100
}

export type ScoreDimension = keyof Omit<FundScore, 'total'>;

// ============================================================
// 交易信号
// ============================================================

export type TradeSignal = 'buy' | 'hold' | 'reduce' | 'sell';

export interface SignalResult {
  signal: TradeSignal;
  score: number;
  reason: string;
  suggestedPosition: string; // e.g. "10%-20%"
}

// ============================================================
// 基金基本信息
// ============================================================

export interface FundInfo {
  code: string;
  name: string;
  type: string;           // 偏股混合型 / 灵活配置型 / 指数型 ...
  manager: string;
  tenure: string;         // 任职年限
  managerReturn: string;  // 任职回报
  scale: number;          // 规模（亿元）
  inception: string;      // 成立日期
  company: string;        // 基金公司
}

// ============================================================
// 基金完整分析
// ============================================================

export interface FundAnalysis extends FundInfo {
  score: FundScore;
  signal: SignalResult;
  investAdvice: InvestAdvice | null;
  analysis: string;       // 200字以上分析文本
  riskMetrics: RiskMetrics;
  holdings: TopHolding[];
  sectorTags: string[];   // 行业标签
  peerComparison: PeerComparison;
}

// ============================================================
// 定投建议
// ============================================================

export interface InvestAdvice {
  pePercentile: number;   // PE 历史分位
  multiplier: number;     // 定投倍数 (0 / 0.5 / 1.0 / 1.2-1.5 / 1.5-2.0)
  strategy: string;       // 策略说明
}

// ============================================================
// 风险指标
// ============================================================

export interface RiskMetrics {
  maxDrawdown: number;    // 最大回撤 (%)
  volatility: number;     // 年化波动率 (%)
  sharpe: number;         // 夏普比率
  sortino: number;        // 索提诺比率
  calmar: number;         // 卡尔玛比率
  infoRatio: number;      // 信息比率
  beta: number;           // Beta
  alpha: number;          // Alpha
}

// ============================================================
// 重仓股
// ============================================================

export interface TopHolding {
  stockCode: string;
  stockName: string;
  weight: number;         // 占净值比 (%)
  changeToday: number;    // 今日涨跌幅 (%)
}

// ============================================================
// 同业比较
// ============================================================

export interface PeerComparison {
  rankPercentile: number; // 同类排名百分位
  totalPeers: number;
  categoryAvgReturn: number;
  fundReturn: number;
}

// ============================================================
// 行业板块
// ============================================================

export interface SectorInfo {
  name: string;
  changePercent: number;
  change5d: number;
  netInflow: number;      // 主力资金净流入（亿）
  upCount: number;
  downCount: number;
  reason: string;         // 涨跌理由
  isHot: boolean;         // 连续3日上涨标记
}

// ============================================================
// 市场概览
// ============================================================

export interface MarketOverview {
  date: string;
  topGainers: SectorInfo[];
  topLosers: SectorInfo[];
  hotSectors: SectorInfo[];
  events: MarketEvent[];
  opportunities: string[];
  risks: string[];
}

export interface MarketEvent {
  title: string;
  time: string;
  source: string;
  summary: string;
  bullishSectors: string[];
  bearishSectors: string[];
  severity: 'critical' | 'important' | 'normal';
}

// ============================================================
// API 通用响应
// ============================================================

export interface ApiResponse<T> {
  success: boolean;
  data: T;
  error?: string;
  timestamp: string;
}
```

- [ ] **Step 4: 创建 packages/shared/src/constants/index.ts**

```typescript
// ============================================================
// 评分权重（模块一 / 模块二持仓评估共用）
// ============================================================

export const SCORE_WEIGHTS = {
  momentum: 0.25,       // 收益动量 25%
  riskControl: 0.20,    // 风险控制 20%
  riskAdjusted: 0.15,   // 风险调整收益 15%
  manager: 0.15,        // 经理能力 15%
  scale: 0.15,          // 规模流动性 15%
  sectorMatch: 0.10,    // 行业景气匹配 10%
} as const;

// ============================================================
// 评分等级
// ============================================================

export const SCORE_GRADES = [
  { min: 85, label: '⭐⭐⭐⭐⭐', text: '强烈推荐' },
  { min: 75, label: '⭐⭐⭐⭐', text: '推荐' },
  { min: 65, label: '⭐⭐⭐', text: '谨慎偏乐观' },
  { min: 50, label: '⭐⭐', text: '观望' },
  { min: 0,  label: '⭐', text: '不推荐' },
] as const;

// ============================================================
// 交易信号阈值
// ============================================================

export const SIGNAL_THRESHOLDS = {
  buy:    80,  // >= 80 买入
  hold:   60,  // >= 60 持有
  reduce: 40,  // >= 40 减持
  // < 40 清仓
} as const;

// ============================================================
// 定投倍数（基于 PE 历史分位）
// ============================================================

export const INVEST_MULTIPLIERS = [
  { maxPercentile: 20,  multiplier: [1.5, 2.0], strategy: '加倍投入，估值极度低估' },
  { maxPercentile: 30,  multiplier: [1.2, 1.5], strategy: '适度加码，低估区间' },
  { maxPercentile: 70,  multiplier: [1.0, 1.0], strategy: '正常投入，合理估值区间' },
  { maxPercentile: 90,  multiplier: [0.5, 0.5], strategy: '减少投入，高估区间' },
  { maxPercentile: 100, multiplier: [0, 0],     strategy: '停止定投，极度高估' },
] as const;

// ============================================================
// 行业 → 风格标签映射
// ============================================================

export const SECTOR_STYLE_MAP: Record<string, string> = {
  '电子': '科技-TMT',
  '通信': '科技-TMT',
  '计算机': '科技-TMT',
  '传媒': '科技-TMT',
  '电力设备': '新能源',
  '新能源': '新能源',
  '食品饮料': '消费',
  '家电': '消费',
  '纺织服装': '消费',
  '医药': '医药',
  '银行': '金融地产',
  '非银行金融': '金融地产',
  '房地产': '金融地产',
  '有色金属': '能源材料',
  '煤炭': '能源材料',
  '石油石化': '能源材料',
  '基础化工': '能源材料',
  '国防军工': '军工',
  '机械': '制造',
  '汽车': '制造',
  '电力及公用事业': '公用事业',
  '建筑': '基建',
  '交通运输': '基建',
};
```

- [ ] **Step 5: 创建 packages/shared/src/index.ts**

```typescript
export * from './types';
export * from './constants';
```

- [ ] **Step 6: 提交**

```bash
git add packages/shared && git commit -m "$(cat <<'EOF'
feat: add shared types and constants package

Co-Authored-By: Claude Opus 4.7 <noreply@anthropic.com>
EOF
)"
```

---

### Task 3: Server 包 — Express + TypeScript 骨架

**Files:**
- Create: `packages/server/package.json`
- Create: `packages/server/tsconfig.json`
- Create: `packages/server/src/index.ts`
- Create: `packages/server/src/routes/health.ts`
- Create: `packages/server/src/db/index.ts`

- [ ] **Step 1: 创建 packages/server/package.json**

```json
{
  "name": "@allin/server",
  "version": "1.0.0",
  "private": true,
  "type": "module",
  "scripts": {
    "dev": "tsx watch src/index.ts",
    "build": "tsc",
    "start": "node dist/index.js",
    "typecheck": "tsc --noEmit"
  },
  "dependencies": {
    "@allin/shared": "*",
    "better-sqlite3": "^11.7.0",
    "cors": "^2.8.5",
    "express": "^4.21.0",
    "node-cron": "^3.0.3"
  },
  "devDependencies": {
    "@types/better-sqlite3": "^7.6.12",
    "@types/cors": "^2.8.17",
    "@types/express": "^5.0.0",
    "@types/node": "^22.10.0",
    "@types/node-cron": "^3.0.11",
    "tsx": "^4.19.0"
  }
}
```

- [ ] **Step 2: 创建 packages/server/tsconfig.json**

```json
{
  "extends": "../../tsconfig.base.json",
  "compilerOptions": {
    "outDir": "./dist",
    "rootDir": "./src",
    "module": "ESNext",
    "moduleResolution": "bundler"
  },
  "include": ["src"],
  "references": [
    { "path": "../shared" }
  ]
}
```

- [ ] **Step 3: 创建 packages/server/src/db/index.ts**

```typescript
import Database from 'better-sqlite3';
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const DB_PATH = path.join(__dirname, '..', '..', 'data', 'allin.db');

let db: Database.Database;

export function getDb(): Database.Database {
  if (!db) {
    const dataDir = path.dirname(DB_PATH);
    if (!fs.existsSync(dataDir)) {
      fs.mkdirSync(dataDir, { recursive: true });
    }
    db = new Database(DB_PATH);
    db.pragma('journal_mode = WAL');
    db.pragma('foreign_keys = ON');
    initSchema(db);
  }
  return db;
}

function initSchema(db: Database.Database): void {
  db.exec(`
    CREATE TABLE IF NOT EXISTS funds (
      code TEXT PRIMARY KEY,
      name TEXT NOT NULL,
      type TEXT,
      manager TEXT,
      scale REAL,
      inception TEXT,
      company TEXT,
      updated_at TEXT DEFAULT (datetime('now'))
    );

    CREATE TABLE IF NOT EXISTS fund_scores (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      fund_code TEXT NOT NULL,
      date TEXT NOT NULL,
      momentum REAL,
      risk_control REAL,
      risk_adjusted REAL,
      manager_score REAL,
      scale_score REAL,
      sector_match REAL,
      total REAL,
      FOREIGN KEY (fund_code) REFERENCES funds(code),
      UNIQUE(fund_code, date)
    );

    CREATE TABLE IF NOT EXISTS daily_recommendations (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      date TEXT NOT NULL,
      rank INTEGER NOT NULL,
      fund_code TEXT NOT NULL,
      total_score REAL NOT NULL,
      signal TEXT NOT NULL,
      FOREIGN KEY (fund_code) REFERENCES funds(code),
      UNIQUE(date, rank)
    );
  `);
}
```

- [ ] **Step 4: 创建 packages/server/src/routes/health.ts**

```typescript
import { Router, Request, Response } from 'express';
import type { ApiResponse } from '@allin/shared';

const router = Router();

router.get('/health', (_req: Request, res: Response) => {
  const body: ApiResponse<{ status: string; uptime: number }> = {
    success: true,
    data: {
      status: 'ok',
      uptime: process.uptime(),
    },
    timestamp: new Date().toISOString(),
  };
  res.json(body);
});

export default router;
```

- [ ] **Step 5: 创建 packages/server/src/index.ts**

```typescript
import express from 'express';
import cors from 'cors';
import healthRouter from './routes/health.js';

const app = express();
const PORT = process.env.PORT || 3001;

app.use(cors());
app.use(express.json());

// Routes
app.use('/api', healthRouter);

app.listen(PORT, () => {
  console.log(`[server] running at http://localhost:${PORT}`);
});
```

- [ ] **Step 6: 安装依赖**

```bash
cd "C:\Users\BH647\Desktop\Allin" && npm install
```

- [ ] **Step 7: 验证服务器启动**

```bash
cd "C:\Users\BH647\Desktop\Allin" && npx tsx packages/server/src/index.ts
```

预期看到 `[server] running at http://localhost:3001`，Ctrl+C 停止。

- [ ] **Step 8: 提交**

```bash
git add packages/server package.json && git commit -m "$(cat <<'EOF'
feat: add Express server with health endpoint and SQLite schema

Co-Authored-By: Claude Opus 4.7 <noreply@anthropic.com>
EOF
)"
```

---

### Task 4: Client 包 — React + Vite + Tailwind + shadcn/ui

**Files:**
- Create: `packages/client/package.json`
- Create: `packages/client/tsconfig.json`
- Create: `packages/client/vite.config.ts`
- Create: `packages/client/index.html`
- Create: `packages/client/src/main.tsx`
- Create: `packages/client/src/App.tsx`
- Create: `packages/client/src/index.css`
- Create: `packages/client/tailwind.config.js`
- Create: `packages/client/postcss.config.js`
- Create: `packages/client/src/lib/utils.ts`
- Create: `packages/client/src/components/ui/`

- [ ] **Step 1: 创建 packages/client/package.json**

```json
{
  "name": "@allin/client",
  "version": "1.0.0",
  "private": true,
  "type": "module",
  "scripts": {
    "dev": "vite",
    "build": "tsc -b && vite build",
    "preview": "vite preview",
    "typecheck": "tsc --noEmit"
  },
  "dependencies": {
    "react": "^18.3.1",
    "react-dom": "^18.3.1",
    "react-router-dom": "^7.0.0",
    "recharts": "^2.13.0",
    "class-variance-authority": "^0.7.1",
    "clsx": "^2.1.1",
    "tailwind-merge": "^2.6.0",
    "lucide-react": "^0.460.0"
  },
  "devDependencies": {
    "@types/react": "^18.3.12",
    "@types/react-dom": "^18.3.1",
    "@vitejs/plugin-react": "^4.3.4",
    "autoprefixer": "^10.4.20",
    "postcss": "^8.4.49",
    "tailwindcss": "^3.4.16",
    "typescript": "^5.7.0",
    "vite": "^6.0.0"
  }
}
```

- [ ] **Step 2: 创建 packages/client/tsconfig.json**

```json
{
  "extends": "../../tsconfig.base.json",
  "compilerOptions": {
    "jsx": "react-jsx",
    "outDir": "./dist",
    "rootDir": "./src",
    "baseUrl": ".",
    "paths": {
      "@/*": ["./src/*"]
    }
  },
  "include": ["src"],
  "references": [
    { "path": "../shared" }
  ]
}
```

- [ ] **Step 3: 创建 packages/client/vite.config.ts**

```typescript
import { defineConfig } from 'vite';
import react from '@vitejs/plugin-react';
import path from 'node:path';

export default defineConfig({
  plugins: [react()],
  resolve: {
    alias: {
      '@': path.resolve(__dirname, './src'),
    },
  },
  server: {
    port: 5173,
    proxy: {
      '/api': {
        target: 'http://localhost:3001',
        changeOrigin: true,
      },
    },
  },
});
```

- [ ] **Step 4: 创建 packages/client/tailwind.config.js**

```javascript
/** @type {import('tailwindcss').Config} */
export default {
  content: [
    "./index.html",
    "./src/**/*.{js,ts,jsx,tsx}",
  ],
  theme: {
    extend: {},
  },
  plugins: [],
};
```

- [ ] **Step 5: 创建 packages/client/postcss.config.js**

```javascript
export default {
  plugins: {
    tailwindcss: {},
    autoprefixer: {},
  },
};
```

- [ ] **Step 6: 创建 packages/client/index.html**

```html
<!DOCTYPE html>
<html lang="zh-CN">
  <head>
    <meta charset="UTF-8" />
    <meta name="viewport" content="width=device-width, initial-scale=1.0" />
    <title>Allin - 基金智能投资决策工具</title>
  </head>
  <body class="bg-slate-50 text-slate-900 antialiased">
    <div id="root"></div>
    <script type="module" src="/src/main.tsx"></script>
  </body>
</html>
```

- [ ] **Step 7: 创建 packages/client/src/index.css**

```css
@tailwind base;
@tailwind components;
@tailwind utilities;
```

- [ ] **Step 8: 创建 packages/client/src/lib/utils.ts**

```typescript
import { type ClassValue, clsx } from "clsx";
import { twMerge } from "tailwind-merge";

export function cn(...inputs: ClassValue[]) {
  return twMerge(clsx(inputs));
}
```

- [ ] **Step 9: 创建 packages/client/src/main.tsx**

```typescript
import React from 'react';
import ReactDOM from 'react-dom/client';
import { BrowserRouter } from 'react-router-dom';
import App from './App';
import './index.css';

ReactDOM.createRoot(document.getElementById('root')!).render(
  <React.StrictMode>
    <BrowserRouter>
      <App />
    </BrowserRouter>
  </React.StrictMode>
);
```

- [ ] **Step 10: 创建 packages/client/src/App.tsx**

```typescript
import { useState, useEffect } from 'react';
import type { ApiResponse } from '@allin/shared';

interface HealthData {
  status: string;
  uptime: number;
}

function App() {
  const [health, setHealth] = useState<HealthData | null>(null);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    fetch('/api/health')
      .then(res => res.json())
      .then((data: ApiResponse<HealthData>) => {
        if (data.success) {
          setHealth(data.data);
        } else {
          setError(data.error || 'Unknown error');
        }
      })
      .catch(err => setError(err.message));
  }, []);

  return (
    <div className="min-h-screen flex items-center justify-center">
      <div className="max-w-md w-full mx-4">
        <div className="bg-white rounded-xl shadow-sm border border-slate-200 p-8">
          <h1 className="text-2xl font-bold mb-2">Allin</h1>
          <p className="text-slate-500 mb-6">基金智能投资决策工具</p>

          <div className="space-y-2 text-sm">
            <div className="flex justify-between py-2 border-b border-slate-100">
              <span className="text-slate-500">后端状态</span>
              <span className={health ? 'text-green-600 font-medium' : error ? 'text-red-600' : 'text-slate-400'}>
                {health ? '✅ 连接正常' : error ? '❌ 连接失败' : '⏳ 连接中...'}
              </span>
            </div>
            {health && (
              <div className="flex justify-between py-2 border-b border-slate-100">
                <span className="text-slate-500">运行时间</span>
                <span className="font-medium">{Math.floor(health.uptime)}s</span>
              </div>
            )}
            {error && (
              <div className="py-2 text-red-500 text-xs">
                {error}
              </div>
            )}
          </div>
        </div>
      </div>
    </div>
  );
}

export default App;
```

- [ ] **Step 11: 安装依赖并验证前端启动**

```bash
cd "C:\Users\BH647\Desktop\Allin" && npm install
```

然后在一个终端启动后端：
```bash
npx tsx packages/server/src/index.ts
```

另一个终端启动前端：
```bash
npx vite packages/client
```

浏览器打开 `http://localhost:5173`，应该看到 "Allin" 标题和 "后端状态：连接中..."，后端启动后刷新显示 "✅ 连接正常"。

- [ ] **Step 12: 提交**

```bash
git add packages/client package.json && git commit -m "$(cat <<'EOF'
feat: add React+Vite client with Tailwind, health check UI

Co-Authored-By: Claude Opus 4.7 <noreply@anthropic.com>
EOF
)"
```

---

### Task 5: shadcn/ui 组件初始化

**Files:**
- Create: `packages/client/components.json`
- Create: `packages/client/src/components/ui/button.tsx`
- Create: `packages/client/src/components/ui/card.tsx`

- [ ] **Step 1: 创建 packages/client/components.json**

```json
{
  "$schema": "https://ui.shadcn.com/schema.json",
  "style": "default",
  "rsc": false,
  "tsx": true,
  "tailwind": {
    "config": "tailwind.config.js",
    "css": "src/index.css",
    "baseColor": "slate",
    "cssVariables": true
  },
  "aliases": {
    "components": "@/components",
    "utils": "@/lib/utils"
  }
}
```

- [ ] **Step 2: 更新 packages/client/src/index.css（添加 CSS 变量）**

```css
@tailwind base;
@tailwind components;
@tailwind utilities;

@layer base {
  :root {
    --background: 0 0% 100%;
    --foreground: 222.2 84% 4.9%;
    --card: 0 0% 100%;
    --card-foreground: 222.2 84% 4.9%;
    --popover: 0 0% 100%;
    --popover-foreground: 222.2 84% 4.9%;
    --primary: 222.2 47.4% 11.2%;
    --primary-foreground: 210 40% 98%;
    --secondary: 210 40% 96.1%;
    --secondary-foreground: 222.2 47.4% 11.2%;
    --muted: 210 40% 96.1%;
    --muted-foreground: 215.4 16.3% 46.9%;
    --accent: 210 40% 96.1%;
    --accent-foreground: 222.2 47.4% 11.2%;
    --destructive: 0 84.2% 60.2%;
    --destructive-foreground: 210 40% 98%;
    --border: 214.3 31.8% 91.4%;
    --input: 214.3 31.8% 91.4%;
    --ring: 222.2 84% 4.9%;
    --radius: 0.5rem;
  }
}

@layer base {
  * {
    @apply border-border;
  }
  body {
    @apply bg-background text-foreground;
  }
}
```

- [ ] **Step 3: 创建 packages/client/src/components/ui/button.tsx**

```typescript
import * as React from "react";
import { cva, type VariantProps } from "class-variance-authority";
import { cn } from "@/lib/utils";

const buttonVariants = cva(
  "inline-flex items-center justify-center whitespace-nowrap rounded-md text-sm font-medium ring-offset-background transition-colors focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-offset-2 disabled:pointer-events-none disabled:opacity-50",
  {
    variants: {
      variant: {
        default: "bg-primary text-primary-foreground hover:bg-primary/90",
        destructive: "bg-destructive text-destructive-foreground hover:bg-destructive/90",
        outline: "border border-input bg-background hover:bg-accent hover:text-accent-foreground",
        secondary: "bg-secondary text-secondary-foreground hover:bg-secondary/80",
        ghost: "hover:bg-accent hover:text-accent-foreground",
        link: "text-primary underline-offset-4 hover:underline",
      },
      size: {
        default: "h-10 px-4 py-2",
        sm: "h-9 rounded-md px-3",
        lg: "h-11 rounded-md px-8",
        icon: "h-10 w-10",
      },
    },
    defaultVariants: {
      variant: "default",
      size: "default",
    },
  }
);

export interface ButtonProps
  extends React.ButtonHTMLAttributes<HTMLButtonElement>,
    VariantProps<typeof buttonVariants> {}

const Button = React.forwardRef<HTMLButtonElement, ButtonProps>(
  ({ className, variant, size, ...props }, ref) => {
    return (
      <button
        className={cn(buttonVariants({ variant, size, className }))}
        ref={ref}
        {...props}
      />
    );
  }
);
Button.displayName = "Button";

export { Button, buttonVariants };
```

- [ ] **Step 4: 创建 packages/client/src/components/ui/card.tsx**

```typescript
import * as React from "react";
import { cn } from "@/lib/utils";

const Card = React.forwardRef<HTMLDivElement, React.HTMLAttributes<HTMLDivElement>>(
  ({ className, ...props }, ref) => (
    <div ref={ref} className={cn("rounded-lg border bg-card text-card-foreground shadow-sm", className)} {...props} />
  )
);
Card.displayName = "Card";

const CardHeader = React.forwardRef<HTMLDivElement, React.HTMLAttributes<HTMLDivElement>>(
  ({ className, ...props }, ref) => (
    <div ref={ref} className={cn("flex flex-col space-y-1.5 p-6", className)} {...props} />
  )
);
CardHeader.displayName = "CardHeader";

const CardTitle = React.forwardRef<HTMLParagraphElement, React.HTMLAttributes<HTMLHeadingElement>>(
  ({ className, ...props }, ref) => (
    <h3 ref={ref} className={cn("text-2xl font-semibold leading-none tracking-tight", className)} {...props} />
  )
);
CardTitle.displayName = "CardTitle";

const CardDescription = React.forwardRef<HTMLParagraphElement, React.HTMLAttributes<HTMLParagraphElement>>(
  ({ className, ...props }, ref) => (
    <p ref={ref} className={cn("text-sm text-muted-foreground", className)} {...props} />
  )
);
CardDescription.displayName = "CardDescription";

const CardContent = React.forwardRef<HTMLDivElement, React.HTMLAttributes<HTMLDivElement>>(
  ({ className, ...props }, ref) => (
    <div ref={ref} className={cn("p-6 pt-0", className)} {...props} />
  )
);
CardContent.displayName = "CardContent";

const CardFooter = React.forwardRef<HTMLDivElement, React.HTMLAttributes<HTMLDivElement>>(
  ({ className, ...props }, ref) => (
    <div ref={ref} className={cn("flex items-center p-6 pt-0", className)} {...props} />
  )
);
CardFooter.displayName = "CardFooter";

export { Card, CardHeader, CardFooter, CardTitle, CardDescription, CardContent };
```

- [ ] **Step 5: 更新 packages/client/src/App.tsx 使用 Card 组件**

```typescript
import { useState, useEffect } from 'react';
import { Card, CardHeader, CardTitle, CardDescription, CardContent } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import type { ApiResponse } from '@allin/shared';

interface HealthData {
  status: string;
  uptime: number;
}

function App() {
  const [health, setHealth] = useState<HealthData | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [loading, setLoading] = useState(true);

  const checkHealth = () => {
    setLoading(true);
    setError(null);
    fetch('/api/health')
      .then(res => res.json())
      .then((data: ApiResponse<HealthData>) => {
        if (data.success) {
          setHealth(data.data);
        } else {
          setError(data.error || 'Unknown error');
        }
      })
      .catch(err => setError(err.message))
      .finally(() => setLoading(false));
  };

  useEffect(() => { checkHealth(); }, []);

  return (
    <div className="min-h-screen flex items-center justify-center bg-slate-50">
      <Card className="w-full max-w-md mx-4">
        <CardHeader>
          <CardTitle>Allin</CardTitle>
          <CardDescription>基金智能投资决策工具 v1.0</CardDescription>
        </CardHeader>
        <CardContent className="space-y-4">
          <div className="space-y-2 text-sm">
            <div className="flex justify-between py-2 border-b">
              <span className="text-muted-foreground">后端状态</span>
              <span className={
                loading ? 'text-muted-foreground' :
                health ? 'text-green-600 font-medium' :
                'text-red-600'
              }>
                {loading ? '⏳ 连接中...' :
                 health ? '✅ 连接正常' :
                 '❌ 连接失败'}
              </span>
            </div>
            {health && (
              <div className="flex justify-between py-2 border-b">
                <span className="text-muted-foreground">运行时间</span>
                <span className="font-medium">{Math.floor(health.uptime)}s</span>
              </div>
            )}
            {error && (
              <p className="text-red-500 text-xs py-1">{error}</p>
            )}
          </div>
          <Button onClick={checkHealth} variant="outline" className="w-full" disabled={loading}>
            {loading ? '检测中...' : '重新检测'}
          </Button>
        </CardContent>
      </Card>
    </div>
  );
}

export default App;
```

- [ ] **Step 6: 安装依赖并验证**

```bash
cd "C:\Users\BH647\Desktop\Allin" && npm install
```

启动后端和前端（两个终端）：
```bash
# Terminal 1
npx tsx packages/server/src/index.ts
# Terminal 2
npx vite packages/client
```

打开 `http://localhost:5173`，应看到卡片式 UI，显示后端连接状态。

- [ ] **Step 7: 提交**

```bash
git add packages/client && git commit -m "$(cat <<'EOF'
feat: add shadcn/ui Button and Card components, wire up health check UI

Co-Authored-By: Claude Opus 4.7 <noreply@anthropic.com>
EOF
)"
```

---

### Task 6: 端到端验证 & CLAUDE.md 更新

- [ ] **Step 1: 运行 `npm run dev` 一次性启动前后端**

确认根目录 `package.json` 的 dev script 已配置好，然后运行：

```bash
cd "C:\Users\BH647\Desktop\Allin" && npm run dev
```

应同时看到：
```
[server] running at http://localhost:3001
[client] Local: http://localhost:5173/
```

- [ ] **Step 2: 浏览器验证**

打开 `http://localhost:5173`，确认：
- 显示卡片式 UI、标题 "Allin"
- 后端状态显示 "✅ 连接正常"
- 点击 "重新检测" 按钮可刷新状态

- [ ] **Step 3: API 直接验证**

```bash
curl http://localhost:3001/api/health
```

预期返回：
```json
{"success":true,"data":{"status":"ok","uptime":3.14},"timestamp":"2026-05-19T..."}
```

- [ ] **Step 4: 更新 CLAUDE.md**

将 `C:\Users\BH647\Desktop\Allin\CLAUDE.md` 更新为：

```markdown
# Allin — 基金智能投资决策工具

## 项目概述
本地运行的基金投资决策工具，集成五大核心模块：基金推荐、持仓管理、深度查询、重仓股透视、市场分析。基于量化策略模型和多因子评分体系。

## 技术栈
- Monorepo: npm workspaces (shared / server / client)
- 前端: React 18 + Vite + Tailwind CSS + shadcn/ui + Recharts
- 后端: Node.js + Express + TypeScript
- 数据库: SQLite (better-sqlite3)
- 定时任务: node-cron

## 运行方式
```bash
npm install          # 安装所有依赖
npm run dev          # 同时启动前后端
```
- 前端: http://localhost:5173
- 后端: http://localhost:3001
- API 代理: 前端 /api/* → 后端 3001

## 上次进行到哪了（2026-05-19）
- 完成需求规格说明书 v1.0
- 完成技术选型与架构设计
- 搭建 Monorepo 骨架（workspaces + shared/server/client）
- 完成前后端通信链路（健康检查 API + UI）
- shadcn/ui 组件集成（Button, Card）

## 接下来要做什么
1. 模块一：每日基金智能推荐（Top 5）— 六维评分筛选
2. 模块二：持仓管理与操作建议 — 信号 + 定投 + 止盈
3. 模块三：基金查询与评分报告
4. 模块四：重仓股透视与风格识别
5. 模块五：板块排行与市场要闻

## 关键文件索引
| 文件 | 内容 |
|------|------|
| `docs/01-项目总览.md` | 完整需求规格说明书 |
| `docs/superpowers/specs/2026-05-19-allin-design.md` | 技术设计文档 |
| `docs/superpowers/plans/2026-05-19-allin-skeleton.md` | 骨架实现计划 |
| `packages/shared/src/types/index.ts` | 所有 TypeScript 类型定义 |
| `packages/shared/src/constants/index.ts` | 评分权重、阈值、映射常量 |
| `packages/server/src/index.ts` | Express 服务入口 |
| `packages/server/src/db/index.ts` | SQLite 数据库初始化 |
| `packages/client/src/App.tsx` | React 前端入口 |
```

- [ ] **Step 5: 最终提交**

```bash
git add CLAUDE.md && git commit -m "$(cat <<'EOF'
docs: update CLAUDE.md with skeleton completion status

Co-Authored-By: Claude Opus 4.7 <noreply@anthropic.com>
EOF
)"
```

- [ ] **Step 6: 查看完整 git log**

```bash
cd "C:\Users\BH647\Desktop\Allin" && git log --oneline
```
