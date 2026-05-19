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

## 接下来要做什么
1. **模块一** — 每日基金智能推荐（Top 5），六维评分筛选
2. **模块二** — 持仓管理，交易信号 + 定投策略 + 止盈规则
3. **模块三** — 基金查询与评分报告
4. **模块四** — 重仓股透视与风格识别
5. **模块五** — 板块排行与市场要闻

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
| `packages/client/src/App.tsx` | React 前端入口 |
| `packages/client/src/components/ui/` | shadcn/ui 组件 (Button, Card) |

## 常见命令
```bash
npm install              # 安装所有依赖
npm run dev              # 同时启动前后端
npm run build            # 构建所有包
```
