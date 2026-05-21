import cron from 'node-cron';
import { getDailyRecommendations } from '../services/recommend.js';

let job: cron.ScheduledTask | null = null;

export function startScheduler(): void {
  // Run on startup — fund + stock recommendations
  console.log('[scheduler] running initial recommendations...');
  Promise.allSettled([
    getDailyRecommendations(true).then(r => console.log(`[scheduler] fund recommendations: ${r.recommendations.length} funds`)),
    runStockTasks(),
  ]).catch(() => {});

  // Schedule: every weekday at 15:30 (market close + 30min)
  job = cron.schedule('30 15 * * 1-5', () => {
    console.log('[scheduler] refreshing daily recommendations...');
    Promise.allSettled([
      getDailyRecommendations(true).then(r => console.log(`[scheduler] funds: ${r.recommendations.length}`)),
      runStockTasks(),
    ]).catch(() => {});
  });

  // Also run prediction at 15:35 (after recommendations)
  cron.schedule('35 15 * * 1-5', () => {
    console.log('[scheduler] running market prediction...');
    import('../services/market-predict.js').then(m => m.predictMarket(true))
      .then(p => console.log(`[scheduler] prediction: ${p.buySignal ? 'BUY' : 'WAIT'} score=${p.totalScore}`))
      .catch(e => console.error('[scheduler] prediction failed:', e.message));
  });

  console.log('[scheduler] daily refresh scheduled at 15:30 (recommend) + 15:35 (predict) on weekdays');
}

async function runStockTasks(): Promise<void> {
  try {
    const { getDailyStockRecommendations } = await import('../services/stock-recommend.js');
    const r = await getDailyStockRecommendations(true);
    console.log(`[scheduler] stock recommendations: ${r.recommendations.length} stocks`);
  } catch (err) {
    console.error('[scheduler] stock recommend failed:', (err as Error).message);
  }
}

export function stopScheduler(): void {
  if (job) { job.stop(); console.log('[scheduler] stopped'); }
}
