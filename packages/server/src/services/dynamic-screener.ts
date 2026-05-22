// ============================================================
// 动态基金筛选器 — 分周期粗筛 + 五维量化评分
//
// MVP: 近1年期绩优池
// 架构: 三层漏斗 — 周期粗筛 → 五维评分 → 排序输出
// 每次请求实时计算，结果短时缓存 60 秒。
// ============================================================

import type { FundInfo } from '@allin/shared';
import { fetchAllFunds, fetchFundDetail, type NAVEntry } from '../adapters/eastmoney.js';

// ============================================================
// 类型定义
// ============================================================

export type ScreenerPeriod = '1y' | '6m' | '3m' | '3y';

export interface FiveDimScore {
  returnCapability: number;  // 收益能力 0-30
  riskControl: number;        // 风险控制 0-25
  riskAdjustedReturn: number; // 风险调整后收益 0-20
  managerStability: number;   // 基金经理稳定性 0-15
  marketAdaptability: number; // 当前市场适应性 0-10
  total: number;              // 综合得分 0-100
}

export interface ScreenedFund {
  code: string;
  name: string;
  type: string;
  score: FiveDimScore;
  nav: number;
  navDate: string;
  ret1y: number;
  maxDrawdown: number;
  sharpe: number;
  calmar: number;
  annualVolatility: number;
  managerYears: number;
}

export interface ScreenerResult {
  period: string;
  funds: ScreenedFund[];
  totalScanned: number;
  coarsePassed: number;
  generatedAt: string;
}

// ============================================================
// 缓存
// ============================================================

let cachedResult: ScreenerResult | null = null;
let cachedAt = 0;
const CACHE_TTL_MS = 60_000; // 60 秒

// ============================================================
// 粗筛 — 近1年期
// ============================================================

interface FundWithNAV {
  fund: FundInfo;
  navData: NAVEntry[];
}

async function coarseFilter1Y(candidates: FundWithNAV[]): Promise<FundWithNAV[]> {
  // 计算所有基金的近1年收益和最大回撤，用于排名
  const metrics = candidates.map(c => ({
    fwn: c,
    ret1y: calcPeriodReturn(c.navData, 365),
    maxDD: calcMaxDrawdown(c.navData),
  }));

  // 排除净值数据不足的
  const withData = metrics.filter(m => m.fwn.navData.length >= 20);

  // 排名百分位阈值
  const retThreshold = percentile(withData.map(m => m.ret1y), 50); // 收益前50%
  const ddThreshold = percentile(withData.map(m => m.maxDD), 50); // 回撤前50%（回撤越小越好，所以用反向）

  const passed: FundWithNAV[] = [];

  for (const m of withData) {
    const fund = m.fwn.fund;

    // 1. 近1年收益率排名前50%
    if (m.ret1y < retThreshold) continue;

    // 2. 最大回撤排名前50%（回撤值低于阈值 = 回撤控制好）
    if (m.maxDD < 0.5) continue; // 排除异常小回撤的数据不足情况
    if (m.maxDD > ddThreshold) continue; // 回撤太大，排除

    // 3. 规模 2~80 亿
    if (fund.scale > 0 && (fund.scale < 2 || fund.scale > 80)) continue;

    // 4. 基金经理任职满 1.5 年
    const managerYears = parseTenureYears(fund.tenure);
    if (managerYears > 0 && managerYears < 1.5) continue;

    // 5. 排除纯债/货币
    const type = fund.type || '';
    if (type.includes('债券') || type.includes('货币')) continue;

    passed.push(m.fwn);
  }

  return passed;
}

// ============================================================
// 五维评分
// ============================================================

function scoreAllFunds(funds: FundWithNAV[]): Map<string, FiveDimScore> {
  const result = new Map<string, FiveDimScore>();

  // 收集所有指标用于截面排名百分位化
  const allRet = funds.map(f => calcAnnualizedReturn(f.navData));
  const allInfoRatio = funds.map(f => calcInfoRatio(f.navData));
  const allMaxDD = funds.map(f => calcMaxDrawdown(f.navData));
  const allVol = funds.map(f => calcAnnualVolatility(f.navData));
  const allDownside = funds.map(f => calcDownsideStd(f.navData));
  const allRecovery = funds.map(f => calcRecoveryDays(f.navData));
  const allSharpe = funds.map(f => calcSharpe(f.navData));
  const allCalmar = funds.map(f => calcCalmar(f.navData));
  const allSortino = funds.map(f => calcSortino(f.navData));
  const allManagerYrs = funds.map(f => parseTenureYears(f.fund.tenure));
  const allRetStability = funds.map(f => calcReturnStability(f.navData));

  for (let i = 0; i < funds.length; i++) {
    const { fund, navData } = funds[i];

    // 收益能力 (0-30)
    const retScore = pctRank(allRet[i], allRet) * 15;
    const infoScore = pctRank(allInfoRatio[i], allInfoRatio) * 10;
    const stabilityScore = pctRank(allRetStability[i], allRetStability) * 5;
    const returnCapability = Math.round(retScore + infoScore + stabilityScore);

    // 风险控制 (0-25)
    // 回撤、波动、下行标准差都是反向指标
    const ddScore = (1 - pctRank(allMaxDD[i], allMaxDD)) * 10;
    const volScore = (1 - pctRank(allVol[i], allVol)) * 7;
    const downScore = (1 - pctRank(allDownside[i], allDownside)) * 5;
    const recScore = (1 - pctRank(allRecovery[i], allRecovery)) * 3;
    const riskControl = Math.round(ddScore + volScore + downScore + recScore);

    // 风险调整后收益 (0-20)
    const sharpeScore = pctRank(allSharpe[i], allSharpe) * 10;
    const calmarScore = pctRank(allCalmar[i], allCalmar) * 6;
    const sortinoScore = pctRank(allSortino[i], allSortino) * 4;
    const riskAdjustedReturn = Math.round(sharpeScore + calmarScore + sortinoScore);

    // 基金经理稳定性 (0-15)
    const yrsScore = Math.min(1, allManagerYrs[i] / 8) * 10;
    const tenureBonus = allManagerYrs[i] >= 2 ? 5 : allManagerYrs[i] >= 1 ? 3 : 0;
    const managerStability = Math.round(yrsScore + tenureBonus);

    // 当前市场适应性 (0-10)
    const adaptabilityScore = calcMarketAdaptability(fund, navData);
    const marketAdaptability = Math.round(adaptabilityScore);

    const total = returnCapability + riskControl + riskAdjustedReturn + managerStability + marketAdaptability;

    result.set(fund.code, {
      returnCapability: clamp(returnCapability, 0, 30),
      riskControl: clamp(riskControl, 0, 25),
      riskAdjustedReturn: clamp(riskAdjustedReturn, 0, 20),
      managerStability: clamp(managerStability, 0, 15),
      marketAdaptability: clamp(marketAdaptability, 0, 10),
      total: clamp(total, 0, 100),
    });
  }

  return result;
}

// ============================================================
// 市场适应性评分 (当前简化版)
// ============================================================

function calcMarketAdaptability(fund: FundInfo, navData: NAVEntry[]): number {
  let score = 5; // 基准分

  // 近1月收益动量 — 匹配强势行情
  const ret1m = calcPeriodReturn(navData, 30);
  if (ret1m > 5) score += 2;
  else if (ret1m > 0) score += 1;
  else score -= 1;

  // 风格判断简化 — 基于基金类型和名称
  const combined = `${fund.name}${fund.type || ''}`;
  if (combined.includes('成长') || combined.includes('科技') || combined.includes('创新')) score += 1;
  if (combined.includes('价值') || combined.includes('红利') || combined.includes('稳健')) score += 1;
  if (combined.includes('新能源') || combined.includes('医药')) score -= 0.5;

  // 规模适中加分
  if (fund.scale > 5 && fund.scale < 50) score += 1;
  else if (fund.scale > 100) score -= 1;

  return clamp(score, 0, 10);
}

// ============================================================
// 百分比排名 (0-1)
// ============================================================

function pctRank(value: number, arr: number[]): number {
  if (arr.length === 0) return 0.5;
  const sorted = [...arr].sort((a, b) => a - b);
  const idx = sorted.findIndex(v => v >= value);
  if (idx < 0) return 1;
  return idx / sorted.length;
}

function percentile(arr: number[], pct: number): number {
  if (arr.length === 0) return 0;
  const sorted = [...arr].sort((a, b) => a - b);
  const idx = Math.floor(sorted.length * (pct / 100));
  return sorted[Math.min(idx, sorted.length - 1)];
}

// ============================================================
// 因子计算
// ============================================================

function calcPeriodReturn(navData: NAVEntry[], days: number): number {
  if (navData.length < 2) return 0;
  const targetIdx = Math.max(0, navData.length - 1 - Math.min(days, navData.length - 1));
  const startNav = navData[targetIdx].nav;
  const endNav = navData[navData.length - 1].nav;
  if (startNav <= 0) return 0;
  return ((endNav - startNav) / startNav) * 100;
}

function calcAnnualizedReturn(navData: NAVEntry[]): number {
  const totalRet = calcPeriodReturn(navData, 365);
  if (navData.length < 20) return totalRet;
  return totalRet; // 对于1年期，直接使用区间收益
}

function calcMaxDrawdown(navData: NAVEntry[]): number {
  if (navData.length < 2) return 100;
  let peak = navData[0].nav;
  let maxDD = 0;
  for (const e of navData) {
    if (e.nav > peak) peak = e.nav;
    const dd = ((peak - e.nav) / peak) * 100;
    if (dd > maxDD) maxDD = dd;
  }
  return maxDD;
}

function calcAnnualVolatility(navData: NAVEntry[]): number {
  const returns: number[] = [];
  for (let i = 1; i < navData.length; i++) returns.push(navData[i].dailyReturn || 0);
  if (returns.length < 2) return 0;
  const mean = returns.reduce((a, b) => a + b, 0) / returns.length;
  const variance = returns.reduce((s, r) => s + (r - mean) ** 2, 0) / returns.length;
  return Math.sqrt(variance) * Math.sqrt(252);
}

function calcSharpe(navData: NAVEntry[]): number {
  const returns: number[] = [];
  for (let i = 1; i < navData.length; i++) returns.push(navData[i].dailyReturn || 0);
  if (returns.length < 2) return 0;
  const mean = returns.reduce((a, b) => a + b, 0) / returns.length;
  const variance = returns.reduce((s, r) => s + (r - mean) ** 2, 0) / returns.length;
  const std = Math.sqrt(variance);
  return std > 0 ? (mean / std) * Math.sqrt(252) : 0;
}

function calcCalmar(navData: NAVEntry[]): number {
  const ret = calcAnnualizedReturn(navData);
  const dd = calcMaxDrawdown(navData);
  return dd > 0 ? ret / dd : 0;
}

function calcSortino(navData: NAVEntry[]): number {
  const returns: number[] = [];
  for (let i = 1; i < navData.length; i++) returns.push(navData[i].dailyReturn || 0);
  if (returns.length < 10) return 0;
  const negReturns = returns.filter(r => r < 0);
  if (negReturns.length < 3) return 0;
  const meanNeg = negReturns.reduce((a, b) => a + b, 0) / negReturns.length;
  const variance = negReturns.reduce((s, r) => s + (r - meanNeg) ** 2, 0) / negReturns.length;
  const downsideDev = Math.sqrt(variance) * Math.sqrt(252);
  const mean = returns.reduce((a, b) => a + b, 0) / returns.length;
  const annualRet = mean * 252;
  return downsideDev > 0 ? annualRet / downsideDev : 0;
}

function calcInfoRatio(navData: NAVEntry[]): number {
  // 简化为超额收益/跟踪误差，无基准时用夏普*0.65近似
  return calcSharpe(navData) * 0.65;
}

function calcDownsideStd(navData: NAVEntry[]): number {
  const returns: number[] = [];
  for (let i = 1; i < navData.length; i++) returns.push(navData[i].dailyReturn || 0);
  const neg = returns.filter(r => r < 0);
  if (neg.length < 3) return 0;
  const meanNeg = neg.reduce((a, b) => a + b, 0) / neg.length;
  const variance = neg.reduce((s, r) => s + (r - meanNeg) ** 2, 0) / neg.length;
  return Math.sqrt(variance) * Math.sqrt(252);
}

function calcRecoveryDays(navData: NAVEntry[]): number {
  // 简化为最近一次大幅回撤后的恢复天数
  if (navData.length < 2) return 365;
  let peak = navData[0].nav;
  let trough = navData[0].nav;
  let troughIdx = 0;
  for (let i = 1; i < navData.length; i++) {
    if (navData[i].nav > peak) peak = navData[i].nav;
    const dd = (peak - navData[i].nav) / peak * 100;
    if (dd > (peak - trough) / peak * 100) {
      trough = navData[i].nav;
      troughIdx = i;
    }
  }
  // 从最低点至今的天数
  return navData.length - troughIdx;
}

function calcReturnStability(navData: NAVEntry[]): number {
  // 月度收益标准差（越小越稳定）
  const returns: number[] = [];
  for (let i = 1; i < navData.length; i++) returns.push(navData[i].dailyReturn || 0);
  if (returns.length < 5) return 0;
  const mean = returns.reduce((a, b) => a + b, 0) / returns.length;
  const variance = returns.reduce((s, r) => s + (r - mean) ** 2, 0) / returns.length;
  // 逆向：波动越小 → 稳定性越高
  return Math.max(0, 1 - Math.sqrt(variance) * 10);
}

// ============================================================
// 工具函数
// ============================================================

function parseTenureYears(raw: string): number {
  if (!raw) return 0;
  const yearMatch = raw.match(/(\d+)年/);
  const dayMatch = raw.match(/(\d+)天/);
  const years = yearMatch ? parseInt(yearMatch[1], 10) : 0;
  const days = dayMatch ? parseInt(dayMatch[1], 10) : 0;
  return years + days / 365;
}

function clamp(value: number, min: number, max: number): number {
  return Math.max(min, Math.min(max, value));
}

// ============================================================
// 主入口
// ============================================================

export async function runScreener(period: ScreenerPeriod = '1y'): Promise<ScreenerResult> {
  // 检查缓存
  const now = Date.now();
  if (cachedResult && cachedResult.period === period && now - cachedAt < CACHE_TTL_MS) {
    console.log(`[screener] 返回缓存结果（${Math.round((now - cachedAt) / 1000)}秒前）`);
    return cachedResult;
  }

  console.log(`[screener] 开始动态筛选 period=${period}...`);

  // Step 1: 获取全量基金列表
  const allFunds = await fetchAllFunds();
  console.log(`[screener] 总基金池: ${allFunds.length} 只`);

  // Step 2: 预筛选 — 仅保留股票/混合型，排除债券/货币/QDII
  const RELEVANT_TYPES = ['股票', '混合', '灵活配置', '偏股'];
  const irrelevantSet = new Set(['债券', '货币', 'QDII', 'ETF联接', '指数']);
  const filtered = allFunds.filter(f => {
    const type = f.type || '';
    // 命中无关类型 → 排除
    for (const kw of irrelevantSet) {
      if (type.includes(kw)) return false;
    }
    // 必须命中相关类型
    return RELEVANT_TYPES.some(kw => type.includes(kw));
  });
  console.log(`[screener] 类型预筛选: ${allFunds.length} → ${filtered.length} 只（仅股票/混合型）`);

  // Step 3: 使用真实数据（无需mock补全）
  const fundsWithMock = filtered;

  // Step 4: 全量批量获取净值（并发 20，首次较慢，5分钟内缓存复用）
  const candidates: FundWithNAV[] = [];
  const batchSize = 20;
  let completed = 0;

  for (let i = 0; i < fundsWithMock.length; i += batchSize) {
    const batch = fundsWithMock.slice(i, i + batchSize);
    const results = await Promise.allSettled(
      batch.map(async (fund) => {
        try {
          const detail = await fetchFundDetail(fund.code);
          if (detail && detail.navHistory.length >= 20) {
            return { fund: { ...fund, name: detail.name || fund.name }, navData: detail.navHistory };
          }
        } catch { /* skip */ }
        return { fund, navData: [] };
      }),
    );
    for (const r of results) {
      if (r.status === 'fulfilled' && r.value.navData.length >= 10) {
        candidates.push(r.value);
      }
    }
    completed += batch.length;
    if (completed % 200 === 0 || completed >= fundsWithMock.length) {
      console.log(`[screener] 净值获取进度: ${completed}/${fundsWithMock.length} (已收集 ${candidates.length})`);
    }
  }

  console.log(`[screener] 净值获取完成: ${candidates.length} 只`);

  // Step 4: 粗筛
  let coarsePassed: FundWithNAV[];
  coarsePassed = await coarseFilter1Y(candidates);
  console.log(`[screener] 粗筛通过: ${coarsePassed.length} 只`);

  // 如果粗筛结果太少，放宽条件
  if (coarsePassed.length < 10) {
    console.log('[screener] 粗筛结果过少，放宽条件...');
    // 放宽：只用收益和回撤过滤，不限规模
    const metrics = candidates.map(c => ({
      fwn: c,
      ret1y: calcPeriodReturn(c.navData, 365),
      maxDD: calcMaxDrawdown(c.navData),
    }));
    const retThreshold = percentile(metrics.map(m => m.ret1y), 60);
    const ddThreshold = percentile(metrics.map(m => m.maxDD), 60);
    coarsePassed = metrics
      .filter(m => m.ret1y >= retThreshold && m.maxDD <= ddThreshold)
      .map(m => m.fwn);
  }

  // Step 5: 五维评分
  const scoreMap = scoreAllFunds(coarsePassed);

  // Step 6: 排序输出 Top 20
  const ranked = coarsePassed
    .map(c => {
      const score = scoreMap.get(c.fund.code)!;
      const nav = c.navData[c.navData.length - 1];
      return {
        code: c.fund.code,
        name: c.fund.name,
        type: c.fund.type || '混合型',
        score,
        nav: nav.nav,
        navDate: nav.date,
        ret1y: Math.round(calcPeriodReturn(c.navData, 365) * 100) / 100,
        maxDrawdown: Math.round(calcMaxDrawdown(c.navData) * 100) / 100,
        sharpe: Math.round(calcSharpe(c.navData) * 100) / 100,
        calmar: Math.round(calcCalmar(c.navData) * 100) / 100,
        annualVolatility: Math.round(calcAnnualVolatility(c.navData) * 100) / 100,
        managerYears: Math.round(parseTenureYears(c.fund.tenure) * 100) / 100,
      };
    })
    .sort((a, b) => b.score.total - a.score.total)
    .slice(0, 20);

  console.log(`[screener] 最终输出: ${ranked.length} 只`);

  const result: ScreenerResult = {
    period,
    funds: ranked,
    totalScanned: candidates.length,
    coarsePassed: coarsePassed.length,
    generatedAt: new Date().toISOString(),
  };

  cachedResult = result;
  cachedAt = now;
  return result;
}
