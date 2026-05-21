// ============================================================
// MCP 市场数据缓存
//
// Claude Code 通过 MCP deepq-finance 工具获取真实市场数据，
// 写入此缓存供 Node.js 服务端读取。
// ============================================================

import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const CACHE_PATH = path.join(__dirname, '..', '..', 'data', 'mcp_market.json');

export interface MCPMarketData {
  fearGreedIndex: number;      // 恐贪指数 0-100
  marketTemperature: number;   // 市场温度 -10 to 10
  marketWidthPercentile: number; // 市场宽度分位数
  momentumPercentile: number;  // 动量分位数
  todaySummary: string;        // 今日盘面摘要
  forwardLook: string;         // 后市观点
  hotSectors: string[];        // 热门板块
  topGainSectors: string[];    // 领涨板块
  topLossSectors: string[];    // 领跌板块
  upCount: number;             // 上涨家数
  downCount: number;           // 下跌家数
  updatedAt: string;
}

const DEFAULT_DATA: MCPMarketData = {
  fearGreedIndex: 50,
  marketTemperature: 0,
  marketWidthPercentile: 0.5,
  momentumPercentile: 0.5,
  todaySummary: '',
  forwardLook: '',
  hotSectors: [],
  topGainSectors: [],
  topLossSectors: [],
  upCount: 2000,
  downCount: 2000,
  updatedAt: '',
};

export function readMCPCache(): MCPMarketData {
  try {
    if (fs.existsSync(CACHE_PATH)) {
      const raw = fs.readFileSync(CACHE_PATH, 'utf-8');
      return { ...DEFAULT_DATA, ...JSON.parse(raw) };
    }
  } catch { /* ignore */ }
  return DEFAULT_DATA;
}

export function writeMCPCache(data: Partial<MCPMarketData>): void {
  try {
    const dir = path.dirname(CACHE_PATH);
    if (!fs.existsSync(dir)) fs.mkdirSync(dir, { recursive: true });
    const existing = readMCPCache();
    const merged = { ...existing, ...data, updatedAt: new Date().toISOString() };
    fs.writeFileSync(CACHE_PATH, JSON.stringify(merged, null, 2), 'utf-8');
  } catch { /* ignore */ }
}
