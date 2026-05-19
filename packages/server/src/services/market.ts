import type { MarketOverview, SectorInfo, MarketEvent } from '@allin/shared';
import { SECTOR_STYLE_MAP } from '@allin/shared';

// ============================================================
// Seeded RNG — deterministic "random" per sector name
// ============================================================

function hashString(s: string): number {
  let hash = 0;
  for (let i = 0; i < s.length; i++) {
    const char = s.charCodeAt(i);
    hash = ((hash << 5) - hash) + char;
    hash |= 0;
  }
  return Math.abs(hash);
}

function seededRandom(name: string, offset: number = 0): number {
  const hash = hashString(name) + offset * 15485863;
  const x = Math.sin(hash) * 10000;
  return x - Math.floor(x);
}

// ============================================================
// Sector data
// ============================================================

const SECTORS: string[] = [
  '电子',
  '食品饮料',
  '电力设备及新能源',
  '医药',
  '银行',
  '计算机',
  '通信',
  '传媒',
  '非银行金融',
  '有色金属',
  '汽车',
  '机械',
  '基础化工',
  '国防军工',
  '建筑',
  '交通运输',
  '电力及公用事业',
  '房地产',
  '煤炭',
  '石油石化',
  '家电',
  '纺织服装',
  '轻工制造',
  '商贸零售',
  '餐饮旅游',
  '农林牧渔',
  '建材',
  '钢铁',
  '综合',
  '综合金融',
];

const POSITIVE_REASONS = [
  '政策利好推动，龙头股领涨',
  '资金持续流入，板块热度提升',
  '行业景气度回升，业绩预期改善',
  '估值修复行情启动，外资加仓',
  '技术突破带来新增长点，市场情绪乐观',
  '旺季需求拉动，供需格局向好',
  '新产品放量带动产业链，盈利预期上修',
  '利好消息催化，短线资金追捧',
];

const NEGATIVE_REASONS = [
  '资金获利了结，板块短期承压',
  '政策调控加码，行业景气度下滑',
  '估值偏高回调，风险偏好下降',
  '外围市场拖累，避险情绪升温',
  '业绩不及预期，机构下调评级',
  '供给过剩压力显现，产品价格走弱',
  '前期涨幅过大，技术性回调需求',
  '行业竞争加剧，利润空间压缩',
];

function getStyleTag(name: string): string {
  return SECTOR_STYLE_MAP[name] || name;
}

function pct(n: number): string {
  return `${n >= 0 ? '+' : ''}${n.toFixed(2)}%`;
}

// ============================================================
// generateMarketOverview
// ============================================================

export function generateMarketOverview(): MarketOverview {
  const today = new Date();
  const dateStr = today.toISOString().slice(0, 10);

  // --- Generate sector data ---
  const allSectors: SectorInfo[] = SECTORS.map((name) => {
    const r0 = seededRandom(name, 0);
    const r1 = seededRandom(name, 1);
    const r2 = seededRandom(name, 2);
    const r3 = seededRandom(name, 3);
    const r4 = seededRandom(name, 4);

    // changePercent in [-5%, +8%] — biased towards small positive
    const changePercent = parseFloat((r0 * 13 - 5).toFixed(2));

    // change5d correlated with today's change but with drift
    const drift = (r1 - 0.5) * 6;
    const change5d = parseFloat((changePercent + drift).toFixed(2));

    // netInflow correlated with change
    const baseInflow = changePercent * 2.5 + (r2 - 0.4) * 15;
    const netInflow = parseFloat(baseInflow.toFixed(2));

    // upCount / downCount — more up than down if positive
    const totalConstituents = 30 + Math.floor(r3 * 80); // 30-110 constituents
    let upCount: number;
    let downCount: number;
    if (changePercent > 0) {
      const upRatio = 0.5 + (r4 * 0.4) + (changePercent / 100) * 3;
      upCount = Math.min(totalConstituents, Math.floor(totalConstituents * upRatio));
      downCount = totalConstituents - upCount;
    } else {
      const downRatio = 0.5 + (r4 * 0.4) + (Math.abs(changePercent) / 100) * 3;
      downCount = Math.min(totalConstituents, Math.floor(totalConstituents * downRatio));
      upCount = totalConstituents - downCount;
    }

    // reason
    const reasonIdx = Math.floor(r0 * POSITIVE_REASONS.length);
    const reason = changePercent >= 0
      ? POSITIVE_REASONS[reasonIdx]
      : NEGATIVE_REASONS[reasonIdx];

    // isHot — pre-mark false, set later for consecutive gainers
    const isHot = false;

    return {
      name,
      changePercent,
      change5d,
      netInflow,
      upCount,
      downCount,
      reason,
      isHot,
    };
  });

  // Sort by changePercent descending
  allSectors.sort((a, b) => b.changePercent - a.changePercent);

  // --- Mark hot sectors (3+ consecutive days up) ---
  // Pick 3-5 sectors from the positive half and mark as hot
  const positiveSectors = allSectors.filter((s) => s.changePercent > 0);
  const hotCount = 3 + Math.floor(seededRandom('HOT_COUNT', 0) * 3); // 3-5
  const hotCandidates = positiveSectors.slice(0, 8); // from the top 8 positive
  const shuffled = [...hotCandidates].sort(() => seededRandom('HOT_SHUFFLE', 0) - 0.5);
  const hotSet = new Set(shuffled.slice(0, Math.min(hotCount, shuffled.length)).map((s) => s.name));

  for (const sector of allSectors) {
    if (hotSet.has(sector.name)) {
      sector.isHot = true;
      sector.reason = sector.reason + '，连续3日上涨 ' + '\u{1F525}';
    }
  }

  // Top gainers (top 5), top losers (bottom 5), hot sectors
  const topGainers = allSectors.slice(0, 5);
  const topLosers = allSectors.slice(-5).reverse();
  const hotSectors = allSectors.filter((s) => s.isHot);

  // --- Generate market events ---
  const events = generateMarketEvents(today, allSectors);

  // --- Identify opportunities and risks ---
  const { opportunities, risks } = identifyOpportunities(allSectors, events);

  return {
    date: dateStr,
    topGainers,
    topLosers,
    hotSectors,
    allSectors,
    events,
    opportunities,
    risks,
  };
}

// ============================================================
// Market events
// ============================================================

function generateMarketEvents(today: Date, sectors: SectorInfo[]): MarketEvent[] {
  const y = today.getFullYear();
  const m = String(today.getMonth() + 1).padStart(2, '0');
  const d = String(today.getDate()).padStart(2, '0');
  const date = `${y}-${m}-${d}`;

  const events: MarketEvent[] = [
    {
      title: '央行降准0.25个百分点，释放长期资金约5000亿元',
      time: `${date} 09:30`,
      source: '中国人民银行',
      summary: '央行宣布下调存款准备金率0.25个百分点，释放流动性约5000亿元',
      bullishSectors: ['银行', '房地产', '非银行金融'],
      bearishSectors: [],
      severity: 'critical',
    },
    {
      title: '新能源汽车5月销量同比增长42%，再创单月新高',
      time: `${date} 10:15`,
      source: '乘联会',
      summary: '5月新能源乘用车零售销量达85万辆，同比增长42%，渗透率突破45%',
      bullishSectors: ['电力设备及新能源', '汽车', '有色金属'],
      bearishSectors: ['石油石化'],
      severity: 'important',
    },
    {
      title: '美国宣布对华半导体出口管制进一步收紧',
      time: `${date} 08:00`,
      source: '商务部',
      summary: '美方新增12家中国实体至出口管制清单，涉及AI芯片领域',
      bullishSectors: ['电子', '计算机'],
      bearishSectors: ['电子'],
      severity: 'critical',
    },
    {
      title: '国际原油价格突破90美元/桶，创年内新高',
      time: `${date} 11:00`,
      source: '新华社',
      summary: 'OPEC+延续减产叠加地缘紧张，布伦特原油突破90美元关口',
      bullishSectors: ['石油石化', '煤炭'],
      bearishSectors: ['交通运输', '基础化工'],
      severity: 'important',
    },
    {
      title: '5月CPI同比上涨0.3%，通胀温和消费复苏信号明确',
      time: `${date} 09:45`,
      source: '国家统计局',
      summary: 'CPI温和上行，核心CPI环比转正，消费需求回暖趋势确立',
      bullishSectors: ['食品饮料', '家电', '餐饮旅游'],
      bearishSectors: [],
      severity: 'normal',
    },
  ];

  return events;
}

// ============================================================
// Opportunities & risks
// ============================================================

function identifyOpportunities(
  sectors: SectorInfo[],
  events: MarketEvent[],
): { opportunities: string[]; risks: string[] } {
  const opportunities: string[] = [];
  const risks: string[] = [];

  // Top 3 gaining sectors → suggest related fund types
  const top3 = sectors.slice(0, 3);
  for (const sector of top3) {
    const tag = getStyleTag(sector.name);
    opportunities.push(
      `【${sector.name}】${pct(sector.changePercent)} — ` +
      `${sector.reason.replace(/，连续3日上涨.*$/, '')}，建议关注${tag}主题基金`,
    );
  }

  // Sectors with positive events + positive momentum (top gainers reference)
  const eventSectorNames = new Set<string>();
  for (const event of events) {
    for (const name of event.bullishSectors) {
      eventSectorNames.add(name);
    }
  }

  for (const sector of sectors) {
    if (eventSectorNames.has(sector.name) && sector.changePercent > 0 && sector.change5d > 0) {
      const tag = getStyleTag(sector.name);
      const alreadyInTop3 = top3.some((s) => s.name === sector.name);
      if (!alreadyInTop3) {
        opportunities.push(
          `【${sector.name}】${pct(sector.changePercent)} — ` +
          `利好事件催化+资金流入，建议关注${tag}主题基金`,
        );
      }
    }
  }

  // Risks — sectors with negative events or bottom performers
  for (const event of events) {
    for (const name of event.bearishSectors) {
      const sector = sectors.find((s) => s.name === name);
      if (sector) {
        risks.push(
          `【${sector.name}】${pct(sector.changePercent)} — ` +
          `${event.title.slice(0, 25)}...，板块承压明显`,
        );
      }
    }
  }

  // Bottom 3 sectors as risks if not already covered
  const bottom3 = sectors.slice(-3);
  for (const sector of bottom3) {
    const alreadyCovered = risks.some((r) => r.startsWith(`【${sector.name}】`));
    if (!alreadyCovered && sector.changePercent < -1) {
      risks.push(
        `【${sector.name}】${pct(sector.changePercent)} — ${sector.reason}`,
      );
    }
  }

  return { opportunities, risks };
}
