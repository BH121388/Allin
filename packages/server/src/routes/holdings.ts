// ============================================================
// 重仓股详情路由 — GET /api/funds/:code/holdings
//
// 全部使用真实数据：天天基金持仓明细 + 新浪实时行情。
// 无真实数据时显示"暂无持仓披露"，不再降级为模拟模板。
// ============================================================

import { Router, Request, Response } from 'express';
import type { ApiResponse } from '@allin/shared';
import type { HoldingsDetail } from '../services/holdings.js';
import { fetchAllFunds, getMockFunds, fetchFundDetail, fetchFundHoldings, fetchStockChanges, lookupStockName } from '../adapters/eastmoney.js';

const router = Router();

router.get('/funds/:code/holdings', async (req: Request, res: Response) => {
  try {
    const code = (req.params.code as string || '').trim();

    if (!code) {
      const body: ApiResponse<never> = {
        success: false,
        error: '请提供基金代码（/api/funds/XXXXXX/holdings）',
        timestamp: new Date().toISOString(),
      };
      res.status(400).json(body);
      return;
    }

    // Step 1: 获取基金基本信息（真实 API + mock 补齐字段）
    const allFunds = await fetchAllFunds();
    let fund = allFunds.find((f) => f.code === code);
    if (fund) {
      const mockFunds = getMockFunds();
      const mockMatch = mockFunds.find((f) => f.code === code);
      if (mockMatch) fund = { ...fund, ...mockMatch };
    } else {
      const mockFunds = getMockFunds();
      fund = mockFunds.find((f) => f.code === code);
    }

    if (!fund) {
      const body: ApiResponse<never> = {
        success: false,
        error: '基金代码不存在',
        timestamp: new Date().toISOString(),
      };
      res.status(404).json(body);
      return;
    }

    // Step 2: 并行获取 pingzhongdata 详情 + 天天基金持仓明细
    const [detail, holdingsDetail] = await Promise.all([
      fetchFundDetail(code),
      fetchFundHoldings(code),
    ]);

    // Step 3: 收集所有待查询的股票代码（优先用持仓明细，其次 pingzhongdata）
    let stockCodes: string[] = [];
    let hasRealHoldings = false;

    if (holdingsDetail.length > 0) {
      // ✅ 有真实持仓明细（含名称 + 权重）
      stockCodes = holdingsDetail.map(h => h.stockCode);
      hasRealHoldings = true;
    } else if (detail && detail.stockCodes.length > 0) {
      // ⚠️ 仅有持仓代码（无名称/权重）
      stockCodes = detail.stockCodes.slice(0, 10);
    }

    // Step 4: 获取所有股票的实时涨跌幅（新浪行情）
    const stockChanges = stockCodes.length > 0
      ? await fetchStockChanges(stockCodes)
      : new Map<string, number>();

    // Step 5: 构建持仓数据
    if (hasRealHoldings) {
      // --- 路径 A：有真实持仓明细（天天基金） ---
      let totalWeight = 0;
      const holdings = holdingsDetail.slice(0, 10).map((h) => {
        totalWeight += h.weight;
        return {
          stockCode: h.stockCode,
          stockName: h.stockName || lookupStockName(h.stockCode) || h.stockCode,
          weight: h.weight,
          changeToday: stockChanges.get(h.stockCode) ?? 0,
        };
      });

      // 归一化权重到 100%
      if (totalWeight > 0 && Math.abs(totalWeight - 100) > 0.5) {
        for (const h of holdings) {
          h.weight = Math.round((h.weight / totalWeight) * 100 * 100) / 100;
        }
      }

      const weightedChange = Math.round(
        holdings.reduce((sum, h) => sum + h.weight * h.changeToday, 0) * 100
      ) / 10000;

      const stockNames = holdings.map(h => h.stockName);
      const sectorTags = deriveSectorTags(stockNames);
      const style = determineStyleFromSectors(sectorTags);

      const data: HoldingsDetail = {
        fundCode: code,
        fundName: fund.name || detail?.name || '',
        holdings,
        weightedChange,
        sectorTags,
        sectorBreakdown: buildSectorBreakdown(holdings, stockNames),
        style,
        dataDate: detail?.dataDate || new Date().toISOString().slice(0, 10),
        source: '天天基金',
      };

      res.json({ success: true, data, timestamp: new Date().toISOString() } as ApiResponse<HoldingsDetail>);
      return;
    }

    if (detail && stockCodes.length > 0) {
      // --- 路径 B：仅有 pingzhongdata 代码（无权重明细）---
      const holdings = stockCodes.map((sc) => {
        const name = lookupStockName(sc) || sc;
        return {
          stockCode: sc,
          stockName: name,
          weight: Math.round((100 / stockCodes.length) * 100) / 100,
          changeToday: stockChanges.get(sc) ?? 0,
        };
      });

      const weightedChange = Math.round(
        holdings.reduce((sum, h) => sum + h.weight * h.changeToday, 0) * 100
      ) / 10000;

      const stockNames = holdings.map(h => h.stockName);
      const sectorTags = deriveSectorTags(stockNames);

      const data: HoldingsDetail = {
        fundCode: code,
        fundName: fund.name || detail.name,
        holdings,
        weightedChange,
        sectorTags,
        sectorBreakdown: [],
        style: determineStyleFromSectors(sectorTags),
        dataDate: detail.dataDate,
        source: '天天基金（等权估算）',
      };

      res.json({ success: true, data, timestamp: new Date().toISOString() } as ApiResponse<HoldingsDetail>);
      return;
    }

    // --- 路径 C：暂无持仓披露（新基金或数据缺失）---
    const data: HoldingsDetail = {
      fundCode: code,
      fundName: fund.name || detail?.name || '',
      holdings: [],
      weightedChange: 0,
      sectorTags: [],
      sectorBreakdown: [],
      style: '',
      dataDate: detail?.dataDate || new Date().toISOString().slice(0, 10),
      source: '暂无持仓披露',
    };

    res.json({ success: true, data, timestamp: new Date().toISOString() } as ApiResponse<HoldingsDetail>);
  } catch (err) {
    const message = err instanceof Error ? err.message : 'Unknown error';
    console.error('[holdings] 查询异常:', message);

    const body: ApiResponse<never> = {
      success: false,
      error: message,
      timestamp: new Date().toISOString(),
    };
    res.status(500).json(body);
  }
});

// ============================================================
// 板块标签推导 — 基于真实股票名称关键词匹配
// ============================================================

interface KeywordSectorMap {
  [keyword: string]: string[];
}

const KEYWORD_SECTORS: KeywordSectorMap = {
  // === 消费 ===
  '茅台': ['消费'], '五粮液': ['消费'], '泸州老窖': ['消费'], '洋河': ['消费'],
  '古井': ['消费'], '汾酒': ['消费'], '舍得': ['消费'], '酒鬼': ['消费'],
  '伊利': ['消费'], '蒙牛': ['消费'], '海天': ['消费'], '千禾': ['消费'],
  '洽洽': ['消费'], '盐津': ['消费'], '安井': ['消费'], '百润': ['消费'],
  '牧原': ['消费'], '温氏': ['消费'], '双汇': ['消费'],
  '美的': ['消费'], '格力': ['消费'], '海尔': ['消费'], '苏泊尔': ['消费'],
  '九阳': ['消费'], '老板': ['消费'], '科沃斯': ['消费'], '石头': ['消费'],
  '安克': ['消费'], '小熊': ['消费'],
  '老白干': ['消费'], '水井坊': ['消费'], '迎驾': ['消费'], '今世缘': ['消费'],
  '张裕': ['消费'], '珠江啤酒': ['消费'], '重庆啤酒': ['消费'], '青岛啤酒': ['消费'], '燕京': ['消费'],
  '爱美客': ['消费'], '华熙': ['消费'],

  // === 新能源 ===
  '宁德': ['新能源'], '比亚迪': ['新能源', '制造'], '隆基': ['新能源'],
  '阳光电源': ['新能源'], '通威': ['新能源'], '亿纬': ['新能源'],
  '天合': ['新能源'], '晶澳': ['新能源'], '锦浪': ['新能源'],
  '派能': ['新能源'], '固德威': ['新能源'], '禾迈': ['新能源'],
  '昱能': ['新能源'], '海优': ['新能源'], '奥特维': ['新能源'],
  '迈为': ['新能源'], '捷佳': ['新能源'], '德业': ['新能源'],
  '上能': ['新能源'], '东方日升': ['新能源'], '正泰': ['新能源'], '爱旭': ['新能源'],
  '天赐': ['新能源'], '恩捷': ['新能源'], '星源': ['新能源'],
  '科达利': ['新能源'], '新宙邦': ['新能源'], '中伟': ['新能源'],
  '容百': ['新能源'], '振华新材': ['新能源'], '德方': ['新能源'],
  '孚能': ['新能源'], '欣旺达': ['新能源'], '国轩': ['新能源'],
  '先导': ['新能源'], '科士达': ['新能源'], '易事特': ['新能源'], '南都': ['新能源'],
  // 光伏
  '福莱特': ['新能源'], '福斯特': ['新能源'], 'TCL中环': ['新能源'], '中环': ['新能源'],
  '联泓': ['新能源'], '大全': ['新能源'],
  // 风电
  '金风': ['新能源'], '天顺': ['新能源'], '大金': ['新能源'],
  '新强联': ['新能源'], '日月': ['新能源'], '运达': ['新能源'],
  '明阳': ['新能源'],

  // === 医药 ===
  '迈瑞': ['医药'], '恒瑞': ['医药'], '爱尔': ['医药'], '药明': ['医药'],
  '智飞': ['医药'], '长春高新': ['医药'], '泰格': ['医药'], '康龙': ['医药'],
  '复星医药': ['医药'], '华东医药': ['医药'], '华兰': ['医药'], '健帆': ['医药'],
  '通策': ['医药'], '乐普': ['医药'], '沃森': ['医药'], '东阿': ['医药'],
  '同仁堂': ['医药'], '片仔癀': ['医药'], '云南白药': ['医药'],
  '我武': ['医药'], '信立泰': ['医药'], '丽珠': ['医药'], '恩华': ['医药'],
  '康泰': ['医药'], '安科': ['医药'], '众生': ['医药'],
  '天士力': ['医药'], '步长': ['医药'], '以岭': ['医药'],
  '红日': ['医药'], '佐力': ['医药'], '华润三九': ['医药'],
  '达仁堂': ['医药'], '鱼跃': ['医药'], '理邦': ['医药'],
  '开立': ['医药'], '心脉': ['医药'], '正海': ['医药'],
  '欧普康视': ['医药'], '爱博': ['医药'],
  '百济': ['医药'], '君实': ['医药'], '信达': ['医药'],
  '艾力斯': ['医药'], '康希诺': ['医药'], '荣昌': ['医药'],
  '泽璟': ['医药'], '微芯': ['医药'], '神州细胞': ['医药'],
  '百奥泰': ['医药'], '诺唯赞': ['医药'],
  '贝达': ['医药'], '凯莱英': ['医药'], '药石': ['医药'],
  '美迪西': ['医药'], '皓元': ['医药'], '键凯': ['医药'],
  '博腾': ['医药'], '天宇': ['医药'], '九洲': ['医药'],
  '诺泰': ['医药'], '山河药辅': ['医药'], '科兴': ['医药'],
  '康方': ['医药'], '诺辉': ['医药'],

  // === 科技-TMT ===
  '海康': ['科技-TMT'], '科大': ['科技-TMT'], '立讯': ['科技-TMT'],
  '腾讯': ['科技-TMT'], '阿里': ['科技-TMT'], '美团': ['科技-TMT'],
  '京东': ['科技-TMT'], '网易': ['科技-TMT'], '百度': ['科技-TMT'],
  '快手': ['科技-TMT'], '小米': ['科技-TMT'], '哔哩哔哩': ['科技-TMT'],
  '金山': ['科技-TMT'], '中芯': ['科技-TMT'],
  '紫光': ['科技-TMT'], '兆易': ['科技-TMT'], '韦尔': ['科技-TMT'],
  '歌尔': ['科技-TMT'], '中兴': ['科技-TMT'], '京东方': ['科技-TMT'],
  '三安': ['科技-TMT'], '卓胜微': ['科技-TMT'], '圣邦': ['科技-TMT'],
  // AI/算力/CPO
  '新易盛': ['科技-TMT'], '中际': ['科技-TMT'], '天孚': ['科技-TMT'],
  '源杰': ['科技-TMT'], '光迅': ['科技-TMT'], '联特': ['科技-TMT'],
  '剑桥': ['科技-TMT'], '太辰光': ['科技-TMT'], '德科立': ['科技-TMT'],
  '烽火': ['科技-TMT'], '长飞': ['科技-TMT'], '中天科技': ['科技-TMT'],
  '博创': ['科技-TMT'], '光库': ['科技-TMT'], '仕佳': ['科技-TMT'],
  '腾景': ['科技-TMT'], '飞荣达': ['科技-TMT'],
  '寒武纪': ['科技-TMT'], '海光': ['科技-TMT'], '景嘉微': ['科技-TMT'],
  '龙芯': ['科技-TMT'], '中科曙光': ['科技-TMT'], '浪潮': ['科技-TMT'],
  '奇安信': ['科技-TMT'], '深信服': ['科技-TMT'], '启明星辰': ['科技-TMT'],
  '中科星图': ['科技-TMT'], '易华录': ['科技-TMT'], '东方国信': ['科技-TMT'],
  '虹软': ['科技-TMT'], '中科创达': ['科技-TMT'],
  // 半导体/芯片
  '北方华创': ['科技-TMT'], '沪硅': ['科技-TMT'], '长电': ['科技-TMT'],
  '通富': ['科技-TMT'], '华天': ['科技-TMT'], '晶方': ['科技-TMT'],
  '南大光电': ['科技-TMT'], '上海新阳': ['科技-TMT'], '安集': ['科技-TMT'],
  '华峰': ['科技-TMT'], '盛美': ['科技-TMT'], '芯源': ['科技-TMT'],
  '拓荆': ['科技-TMT'], '华海清科': ['科技-TMT'], '华大九天': ['科技-TMT'],
  '概伦': ['科技-TMT'], '广立微': ['科技-TMT'], '思瑞浦': ['科技-TMT'],
  '晶丰': ['科技-TMT'], '富瀚微': ['科技-TMT'], '纳芯': ['科技-TMT'],
  '聚辰': ['科技-TMT'], '东微': ['科技-TMT'], '东芯': ['科技-TMT'],
  '佰维': ['科技-TMT'], '复旦微电': ['科技-TMT'], '格科': ['科技-TMT'],
  '和辉': ['科技-TMT'], '中瓷': ['科技-TMT'], '雅克': ['科技-TMT'],
  '江丰': ['科技-TMT'], '东山精密': ['科技-TMT'], '至纯': ['科技-TMT'],
  '晶盛': ['科技-TMT'], '芯原': ['科技-TMT'], '晶晨': ['科技-TMT'],
  '乐鑫': ['科技-TMT'], '恒玄': ['科技-TMT'], '全志': ['科技-TMT'],
  '汇顶': ['科技-TMT'], '北京君正': ['科技-TMT'], '芯海': ['科技-TMT'],
  '臻镭': ['科技-TMT'], '国博': ['科技-TMT'], '长盈通': ['科技-TMT'],
  // 计算机/信创
  '中国软件': ['科技-TMT'], '中国长城': ['科技-TMT'], '宝兰德': ['科技-TMT'],
  '福昕': ['科技-TMT'], '博思': ['科技-TMT'],
  '广联达': ['科技-TMT'], '恒华': ['科技-TMT'], '远光': ['科技-TMT'],
  '恒生电子': ['科技-TMT'], '赢时胜': ['科技-TMT'], '指南针': ['科技-TMT'],
  '万兴': ['科技-TMT'], '美亚': ['科技-TMT'], '数字政通': ['科技-TMT'],
  '舜宇': ['科技-TMT'], '瑞声': ['科技-TMT'], 'ASMPT': ['科技-TMT'],
  '联想': ['科技-TMT'], '华虹': ['科技-TMT'], '微盟': ['科技-TMT'],

  // === 制造（机器人/自动化/工业母机） ===
  '绿的谐波': ['制造'], '埃斯顿': ['制造'], '拓斯达': ['制造'],
  '机器人': ['制造'], '汇川': ['制造'], '禾川': ['制造'],
  '鸣志': ['制造'], '步科': ['制造'], '昊志': ['制造'],
  '丰立': ['制造'], '埃夫特': ['制造'], '新时达': ['制造'],
  '江苏北人': ['制造'], '华中数控': ['制造'], '维宏': ['制造'],
  '中大力德': ['制造'], '信捷': ['制造'], '杰普特': ['制造'],
  '江苏雷利': ['制造'], '汉宇': ['制造'], '雷赛': ['制造'],
  '创世纪': ['制造'], '海天精工': ['制造'], '国盛': ['制造'],
  '浙海德曼': ['制造'], '华锐': ['制造'], '欧科亿': ['制造'],
  '日发': ['制造'], '鲍斯': ['制造'], '上海机电': ['制造'],
  '三一': ['制造'], '潍柴': ['制造'], '中集': ['制造'],
  '天准': ['制造'], '科德': ['制造'], '大族': ['制造'],
  '海目星': ['制造'], '联赢': ['制造'], '赢合': ['制造'],
  '华域': ['制造'], '精锻': ['制造'], '旭升': ['制造'],
  '文灿': ['制造'], '广东鸿图': ['制造'],

  // === 军工/航天 ===
  '航发': ['军工'], '中航': ['军工'], '航天': ['军工'],
  '中信海直': ['军工'], '万丰': ['军工'], '纵横': ['军工'],
  '观典': ['军工'], '海特': ['军工'], '光智': ['军工'],
  '威海广泰': ['军工'], '超卓': ['军工'], '广联航空': ['军工'],
  '安达维尔': ['军工'], '新兴装备': ['军工'],
  '火炬': ['军工'], '鸿远': ['军工'], '宏达': ['军工'],
  '钢研': ['军工'], '西部超导': ['军工'], '航宇': ['军工'],
  '爱乐达': ['军工'], '中航西飞': ['军工'], '中航沈飞': ['军工'],
  '中国船舶': ['军工'], '中船': ['军工'], '中国动力': ['军工'],
  '中直': ['军工'], '铂力特': ['军工'], '坤恒': ['军工'],
  '晨曦': ['军工'], '三角防务': ['军工'], '北摩': ['军工'],
  '中简': ['军工'], '迈信林': ['军工'],

  // === 金融地产 ===
  '招商银行': ['金融地产'], '平安': ['金融地产'], '兴业': ['金融地产'],
  '工商银行': ['金融地产'], '建设银行': ['金融地产'], '农业银行': ['金融地产'],
  '交通银行': ['金融地产'], '民生银行': ['金融地产'], '光大银行': ['金融地产'],
  '宁波银行': ['金融地产'], '江苏银行': ['金融地产'], '杭州银行': ['金融地产'],
  '南京银行': ['金融地产'], '华夏银行': ['金融地产'], '贵阳银行': ['金融地产'],
  '成都银行': ['金融地产'], '青岛银行': ['金融地产'], '瑞丰': ['金融地产'],
  '中信证券': ['金融地产'], '广发证券': ['金融地产'], '华泰证券': ['金融地产'],
  '招商证券': ['金融地产'], '国泰': ['金融地产'], '申万': ['金融地产'],
  '中信建投': ['金融地产'], '海通': ['金融地产'], '东方证券': ['金融地产'],
  '东财': ['金融地产'], '东方财富': ['金融地产'], '同花顺': ['金融地产'],
  '太保': ['金融地产'], '人寿': ['金融地产'],
  '万科': ['金融地产'], '保利': ['金融地产'], '招商蛇口': ['金融地产'],
  '金地': ['金融地产'], '华侨城': ['金融地产'], '华发': ['金融地产'],
  '中国建筑': ['金融地产'], '新城': ['金融地产'],
  '汇丰': ['金融地产'], '港交所': ['金融地产'],

  // === 能源/材料 ===
  '紫金': ['能源材料'], '神华': ['能源材料'], '中石化': ['能源材料'],
  '中石油': ['能源材料'], '海螺': ['能源材料'],
  '北新建材': ['能源材料'], '东方雨虹': ['能源材料'], '中国巨石': ['能源材料'],
  '华鲁': ['能源材料'], '鲁西': ['能源材料'], '中泰化学': ['能源材料'],
  '万华': ['能源材料'], '龙佰': ['能源材料'], '卫星': ['能源材料'],
  '宝丰': ['能源材料'], '东方盛虹': ['能源材料'], '荣盛': ['能源材料'],
  '恒逸': ['能源材料'], '恒力': ['能源材料'], '齐翔': ['能源材料'],
  '宝钢': ['能源材料'], '鞍钢': ['能源材料'], '华菱': ['能源材料'],
  '包钢': ['能源材料'], '中信特钢': ['能源材料'], '久立': ['能源材料'],
  '洛阳钼业': ['能源材料'], '铜陵': ['能源材料'], '江西铜业': ['能源材料'],
  '西部矿业': ['能源材料'], '盛达': ['能源材料'], '银泰黄金': ['能源材料'],
  '赤峰黄金': ['能源材料'], '湖南黄金': ['能源材料'], '中金黄金': ['能源材料'],
  '中煤': ['能源材料'], '兖矿': ['能源材料'], '潞安': ['能源材料'],
  '山西焦煤': ['能源材料'], '山煤': ['能源材料'], '晋控': ['能源材料'],
  '天奈': ['能源材料'], '凯赛': ['能源材料'], '奥来德': ['能源材料'],
  '蓝晓': ['能源材料'], '格林美': ['能源材料'], '金发': ['能源材料'],
  '中海油': ['能源材料'],

  // === 公用事业 ===
  '长江电力': ['公用事业'], '中国广核': ['公用事业'], '中国核电': ['公用事业'],
  '国投电力': ['公用事业'], '华能': ['公用事业'], '川投': ['公用事业'],
  '浙能': ['公用事业'], '国电': ['公用事业'],
  '太阳能': ['公用事业'], '湖北能源': ['公用事业'], '节能': ['公用事业'],
  '芯能': ['公用事业'], '嘉泽': ['公用事业'],
  '伟明环保': ['公用事业'], '中国天楹': ['公用事业'], '碧水源': ['公用事业'],
  '瀚蓝': ['公用事业'], '上海环境': ['公用事业'],

  // === 汽车/智能驾驶 ===
  '上汽': ['制造'], '长安': ['制造'], '长城汽车': ['制造'], '广汽': ['制造'],
  '赛力斯': ['制造'], '北汽': ['制造'], '江淮': ['制造'], '宇通': ['制造'],
  '一汽': ['制造'], '中国重汽': ['制造'], '福田': ['制造'],
  '伯特利': ['制造'], '科博达': ['制造'], '均胜': ['制造'],
  '华阳': ['制造'], '保隆': ['制造'], '路畅': ['制造'],
  '万集': ['制造'], '四维图新': ['科技-TMT'], '东软': ['科技-TMT'],
  '道通': ['制造'], '阿尔特': ['制造'], '华安': ['制造'],

  // === 传媒/游戏 ===
  '芒果': ['传媒'], '三七': ['传媒'], '世纪华通': ['传媒'],
  '游族': ['传媒'], '掌趣': ['传媒'], '吉比特': ['传媒'],
  '巨人': ['传媒'], '光线': ['传媒'], '人民网': ['传媒'],
  '东方明珠': ['传媒'], '利欧': ['传媒'], '蓝色光标': ['传媒'],
  '华策': ['传媒'], '天龙': ['传媒'],
  '云音乐': ['传媒'], '奈雪': ['消费'],

  // === 交通运输 ===
  '国航': ['交通运输'], '南航': ['交通运输'], '东航': ['交通运输'],
  '京沪高铁': ['交通运输'], '顺丰': ['交通运输'], '圆通': ['交通运输'], '韵达': ['交通运输'],
  '上海机场': ['交通运输'], '深圳机场': ['交通运输'], '白云机场': ['交通运输'],
  '招商轮船': ['交通运输'], '中远海控': ['交通运输'], '中国外运': ['交通运输'],
  '北部湾': ['交通运输'], '宁波港': ['交通运输'], '唐山港': ['交通运输'],

  // === 农业 ===
  '隆平': ['农业'], '大北农': ['农业'], '神农': ['农业'],
  '北大荒': ['农业'], '苏垦': ['农业'], '登海': ['农业'],
  '荃银': ['农业'], '丰乐': ['农业'], '农发': ['农业'],
  '仙坛': ['农业'], '立华': ['农业'], '天康': ['农业'],

  // === 零售 ===
  '永辉': ['消费'], '红旗': ['消费'], '家家悦': ['消费'],
  '老百姓': ['消费'], '益丰': ['消费'], '一心堂': ['消费'],
  '苏宁': ['消费'], '供销': ['消费'], '小商品城': ['消费'],
  '百胜': ['消费'], '安踏': ['消费'], '李宁': ['消费'],
  '华润万象': ['消费'], '百丽': ['消费'],
};

function deriveSectorTags(stockNames: string[]): string[] {
  const tagScores = new Map<string, number>();

  for (const name of stockNames) {
    if (!name) continue;
    for (const [keyword, tags] of Object.entries(KEYWORD_SECTORS)) {
      if (name.includes(keyword)) {
        for (const tag of tags) {
          tagScores.set(tag, (tagScores.get(tag) || 0) + 1);
        }
      }
    }
  }

  if (tagScores.size === 0) {
    return stockNames.length > 0 ? ['混合持仓'] : [];
  }

  // 按出现次数降序，取前 3
  const sorted = [...tagScores.entries()].sort((a, b) => b[1] - a[1]);
  return sorted.slice(0, 3).map(([tag]) => tag);
}

function determineStyleFromSectors(sectorTags: string[]): string {
  const growthSectors = new Set(['科技-TMT', '新能源', '医药', '制造']);
  const valueSectors = new Set(['消费', '金融地产', '能源材料', '公用事业']);

  let growthScore = 0;
  let valueScore = 0;

  for (const tag of sectorTags) {
    if (growthSectors.has(tag)) growthScore++;
    if (valueSectors.has(tag)) valueScore++;
  }

  if (growthScore > valueScore) return '成长风格';
  if (valueScore > growthScore) return '价值风格';
  if (growthScore > 0) return '均衡配置';
  return '';
}

function buildSectorBreakdown(
  holdings: Array<{ stockName: string; weight: number }>,
  stockNames: string[],
): Array<{ sector: string; weight: number; tag: string }> {
  const sectorWeights = new Map<string, number>();

  for (let i = 0; i < holdings.length; i++) {
    const name = holdings[i].stockName || stockNames[i] || '';
    let matched = false;
    for (const [keyword, tags] of Object.entries(KEYWORD_SECTORS)) {
      if (name.includes(keyword) && tags.length > 0) {
        const primaryTag = tags[0];
        sectorWeights.set(primaryTag, (sectorWeights.get(primaryTag) || 0) + holdings[i].weight);
        matched = true;
        break;
      }
    }
    if (!matched) {
      sectorWeights.set('其他', (sectorWeights.get('其他') || 0) + holdings[i].weight);
    }
  }

  return [...sectorWeights.entries()]
    .sort((a, b) => b[1] - a[1])
    .map(([tag, weight]) => ({ sector: tag, tag, weight: Math.round(weight * 100) / 100 }));
}

export default router;
