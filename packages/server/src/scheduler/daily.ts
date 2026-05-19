import cron from 'node-cron';
import { getDailyRecommendations } from '../services/recommend.js';

let job: cron.ScheduledTask | null = null;

export function startScheduler(): void {
  // Run on startup (initial recommendation generation)
  console.log('[scheduler] running initial recommendation...');
  getDailyRecommendations(true)
    .then(r => console.log(`[scheduler] initial recommendations ready, ${r.recommendations.length} funds`))
    .catch(err => console.error('[scheduler] initial run failed:', err.message));

  // Schedule: every weekday at 15:30 (market close + 30min for data availability)
  job = cron.schedule('30 15 * * 1-5', () => {
    console.log('[scheduler] refreshing daily recommendations...');
    getDailyRecommendations(true)
      .then(r => console.log(`[scheduler] recommendations refreshed, ${r.recommendations.length} funds`))
      .catch(err => console.error('[scheduler] refresh failed:', err.message));
  });

  console.log('[scheduler] daily refresh scheduled at 15:30 on weekdays');
}

export function stopScheduler(): void {
  if (job) {
    job.stop();
    console.log('[scheduler] stopped');
  }
}
