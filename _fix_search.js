const fs = require('fs');
let c = fs.readFileSync('packages/server/src/routes/search.ts', 'utf8');

const idx = c.indexOf('// 2.5');
if (idx < 0) { console.log('Not found'); process.exit(1); }
const endIdx = c.indexOf('// 3. 统一评分', idx);

const newBlock = '      // 2.5 盘中估算净值（叠加今日涨跌到昨收净值）\n' +
'      let todayChange = 0;\n' +
'      try {\n' +
'        const est = await estimateIntradayNAV(code);\n' +
'        if (est) {\n' +
'          todayChange = est.weightedChange;\n' +
'          if (currentNav != null && todayChange !== 0) {\n' +
'            currentNav = Math.round(currentNav * (1 + todayChange / 100) * 10000) / 10000;\n' +
'          } else if (currentNav == null) {\n' +
'            currentNav = est.estimatedNav;\n' +
'            navDate = est.navDate;\n' +
'          }\n' +
'        }\n' +
'      } catch { /* skip */ }\n' +
'\n' +
'      ';

c = c.substring(0, idx) + newBlock + c.substring(endIdx);
fs.writeFileSync('packages/server/src/routes/search.ts', c);
console.log('Fixed search route intraday logic');
