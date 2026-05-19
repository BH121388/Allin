import express from 'express';
import cors from 'cors';
import healthRouter from './routes/health.js';
import fundsRouter from './routes/funds.js';
import portfolioRouter from './routes/portfolio.js';
import { startScheduler } from './scheduler/daily.js';

const app = express();
const PORT = process.env.PORT || 3001;

app.use(cors());
app.use(express.json());

// Routes
app.use('/api', healthRouter);
app.use('/api', fundsRouter);
app.use('/api', portfolioRouter);

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
