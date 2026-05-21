import { Router, Request, Response } from 'express';
import type { ApiResponse } from '@allin/shared';
import { getDb } from '../db/index.js';
import { getMockStocks, fetchAllStocks, fetchSingleStockQuote } from '../adapters/stock.js';

const router = Router();

router.get('/stocks/watchlist', async (_req: Request, res: Response) => {
  try {
    const db = getDb();
    const rows = db.prepare('SELECT * FROM watchlist ORDER BY added_at DESC').all() as Array<{ id: number; code: string; name: string; added_at: string }>;

    // 并行获取实时行情
    const codes = rows.map(r => r.code);
    const quotes = new Map<string, { price: number; changePct: number }>();
    for (let i = 0; i < codes.length; i += 5) {
      const batch = codes.slice(i, i + 5);
      const results = await Promise.allSettled(batch.map(c => fetchSingleStockQuote(c)));
      for (let j = 0; j < results.length; j++) {
        const it = results[j];
        if (it.status === 'fulfilled' && it.value) {
          quotes.set(batch[j], { price: it.value.price, changePct: it.value.changePct });
        }
      }
    }

    const items = rows.map(r => {
      const q = quotes.get(r.code);
      return { code: r.code, name: r.name, price: q?.price ?? 0, changePct: q?.changePct ?? 0 };
    });

    res.json({ success: true, data: items, timestamp: new Date().toISOString() } as ApiResponse<typeof items>);
  } catch (err) {
    res.status(500).json({ success: false, error: String(err), timestamp: new Date().toISOString() } as ApiResponse<never>);
  }
});

router.post('/stocks/watchlist', (req: Request, res: Response) => {
  try {
    const { code, name } = req.body;
    if (!code || !name) { res.status(400).json({ success: false, error: '缺少code/name' }); return; }

    const db = getDb();
    db.prepare('INSERT OR IGNORE INTO watchlist (code, name) VALUES (?, ?)').run(code, name);
    res.json({ success: true, data: { added: code }, timestamp: new Date().toISOString() });
  } catch (err) {
    res.status(500).json({ success: false, error: String(err), timestamp: new Date().toISOString() } as ApiResponse<never>);
  }
});

router.delete('/stocks/watchlist/:code', (req: Request, res: Response) => {
  try {
    const db = getDb();
    db.prepare('DELETE FROM watchlist WHERE code = ?').run(req.params.code);
    res.json({ success: true, data: { removed: req.params.code }, timestamp: new Date().toISOString() });
  } catch (err) {
    res.status(500).json({ success: false, error: String(err), timestamp: new Date().toISOString() } as ApiResponse<never>);
  }
});

export default router;
