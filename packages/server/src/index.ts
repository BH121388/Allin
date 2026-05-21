import express from 'express';
import cors from 'cors';
import healthRouter from './routes/health.js';
import fundsRouter from './routes/funds.js';
import portfolioRouter from './routes/portfolio.js';
import searchRouter from './routes/search.js';
import holdingsRouter from './routes/holdings.js';
import marketRouter from './routes/market.js';
import screenerRouter from './routes/screener.js';
import stockSearchRouter from './routes/stock-search.js';
import stockRecommendRouter from './routes/stock-recommend.js';
import stockPortfolioRouter from './routes/stock-portfolio.js';
import stockScreenerRouter from './routes/stock-screener.js';
import stockMarketRouter from './routes/stock-market.js';
import marketPredictRouter from './routes/market-predict.js';
import stockCompareRouter from './routes/stock-compare.js';
import backtestRouter from './routes/backtest.js';
import watchlistRouter from './routes/watchlist.js';
import stockSectorRouter from './routes/stock-sector.js';
import { startScheduler } from './scheduler/daily.js';

const app = express();
const PORT = process.env.PORT || 3001;

app.use(cors());
app.use(express.json());

// Routes
app.use('/api', healthRouter);
app.use('/api', fundsRouter);
app.use('/api', portfolioRouter);
app.use('/api', searchRouter);
app.use('/api', holdingsRouter);
app.use('/api', marketRouter);
app.use('/api', screenerRouter);
app.use('/api', stockSearchRouter);
app.use('/api', stockRecommendRouter);
app.use('/api', stockPortfolioRouter);
app.use('/api', stockScreenerRouter);
app.use('/api', stockMarketRouter);
app.use('/api', marketPredictRouter);
app.use('/api', stockCompareRouter);
app.use('/api', backtestRouter);
app.use('/api', watchlistRouter);
app.use('/api', stockSectorRouter);

// Start daily recommendation scheduler
startScheduler();

const server = app.listen(PORT, () => {
  console.log(`[server] running at http://localhost:${PORT}`);
});

server.on('error', (err: NodeJS.ErrnoException) => {
  if (err.code === 'EADDRINUSE') {
    console.error(`[server] port ${PORT} is already in use`);
    process.exit(1);
  }
  throw err;
});
