import { Routes, Route, NavLink } from 'react-router-dom';
import RecommendPage from '@/pages/RecommendPage';
import SearchPage from '@/pages/SearchPage';
import PortfolioPage from '@/pages/PortfolioPage';
import MarketPage from '@/pages/MarketPage';
import ScreenerPage from '@/pages/ScreenerPage';
import StockRecommendPage from '@/pages/StockRecommendPage';
import StockSearchPage from '@/pages/StockSearchPage';
import StockPortfolioPage from '@/pages/StockPortfolioPage';
import StockScreenerPage from '@/pages/StockScreenerPage';
import StockMarketPage from '@/pages/StockMarketPage';
import StockComparePage from '@/pages/StockComparePage';
import StockBacktestPage from '@/pages/StockBacktestPage';
import DashboardPage from '@/pages/DashboardPage';
import { useState } from 'react';
import { TrendingUp, Search, Briefcase, BarChart3, Filter, CandlestickChart, LineChart, Wallet, SlidersHorizontal, PieChart, GitCompare, FlaskConical, Menu, X } from 'lucide-react';
import { cn } from '@/lib/utils';

function NavItem({ to, icon, label }: { to: string; icon: React.ReactNode; label: string }) {
  return (
    <NavLink to={to} end={to === '/' ? true : undefined} className={({ isActive }) =>
      cn(
        "flex items-center gap-1.5 px-2.5 py-2 rounded-lg text-sm font-medium transition-colors shrink-0",
        "sm:gap-2 sm:px-4",
        isActive ? "bg-slate-100 text-slate-900" : "text-slate-500 hover:text-slate-700 hover:bg-slate-50"
      )
    }>
      {icon}
      <span className="hidden sm:inline">{label}</span>
    </NavLink>
  );
}

function MobileNavItem({ to, icon, label, onClick }: { to: string; icon: React.ReactNode; label: string; onClick: () => void }) {
  return (
    <NavLink to={to} onClick={onClick} className={({ isActive }) =>
      cn(
        "flex flex-col items-center gap-0.5 px-1 py-2 rounded-lg text-xs font-medium transition-colors",
        isActive ? "bg-slate-100 text-slate-900" : "text-slate-500 hover:bg-slate-50"
      )
    }>
      {icon}
      <span>{label}</span>
    </NavLink>
  );
}

function App() {
  const [menuOpen, setMenuOpen] = useState(false);

  return (
    <div className="min-h-screen bg-slate-50">
      {/* Top navigation bar */}
      <nav className="sticky top-0 z-50 bg-white border-b border-slate-200">
        <div className="max-w-6xl mx-auto px-2 sm:px-4">
          {/* Desktop nav row */}
          <div className="hidden md:flex items-center h-12 sm:h-14 gap-0.5 sm:gap-1 overflow-x-auto scrollbar-none">
            <span className="text-base sm:text-lg font-bold mr-1 sm:mr-6 text-slate-800 shrink-0">Allin</span>

            <NavItem to="/" icon={<TrendingUp className="w-4 h-4" />} label="推荐" />
            <NavItem to="/search" icon={<Search className="w-4 h-4" />} label="查询" />
            <NavItem to="/portfolio" icon={<Briefcase className="w-4 h-4" />} label="持仓" />
            <NavItem to="/market" icon={<BarChart3 className="w-4 h-4" />} label="市场" />
            <NavItem to="/screener" icon={<Filter className="w-4 h-4" />} label="筛选" />
            {/* Separator */}
            <span className="w-px h-5 bg-slate-200 mx-0.5 shrink-0" />
            <NavItem to="/stocks" icon={<CandlestickChart className="w-4 h-4" />} label="仪表盘" />
            <NavItem to="/stocks/search" icon={<LineChart className="w-4 h-4" />} label="股查询" />
            <NavItem to="/stocks/portfolio" icon={<Wallet className="w-4 h-4" />} label="股持仓" />
            <NavItem to="/stocks/market" icon={<PieChart className="w-4 h-4" />} label="股市场" />
            <NavItem to="/stocks/screener" icon={<SlidersHorizontal className="w-4 h-4" />} label="股筛选" />
            <NavItem to="/stocks/compare" icon={<GitCompare className="w-4 h-4" />} label="对比" />
            <NavItem to="/stocks/backtest" icon={<FlaskConical className="w-4 h-4" />} label="回测" />
          </div>

          {/* Mobile nav row */}
          <div className="flex md:hidden items-center h-12 gap-1">
            <span className="text-base font-bold text-slate-800 shrink-0">Allin</span>
            <button onClick={() => setMenuOpen(!menuOpen)} className="ml-auto p-2 text-slate-600">
              {menuOpen ? <X className="w-5 h-5" /> : <Menu className="w-5 h-5" />}
            </button>
          </div>

          {/* Mobile dropdown */}
          {menuOpen && (
            <div className="md:hidden pb-3 border-t border-slate-100 pt-2 grid grid-cols-4 gap-1">
              <MobileNavItem to="/" icon={<TrendingUp className="w-3.5 h-3.5" />} label="推荐" onClick={() => setMenuOpen(false)} />
              <MobileNavItem to="/search" icon={<Search className="w-3.5 h-3.5" />} label="查询" onClick={() => setMenuOpen(false)} />
              <MobileNavItem to="/portfolio" icon={<Briefcase className="w-3.5 h-3.5" />} label="持仓" onClick={() => setMenuOpen(false)} />
              <MobileNavItem to="/market" icon={<BarChart3 className="w-3.5 h-3.5" />} label="市场" onClick={() => setMenuOpen(false)} />
              <MobileNavItem to="/stocks" icon={<CandlestickChart className="w-3.5 h-3.5" />} label="仪表盘" onClick={() => setMenuOpen(false)} />
              <MobileNavItem to="/stocks/search" icon={<LineChart className="w-3.5 h-3.5" />} label="股查询" onClick={() => setMenuOpen(false)} />
              <MobileNavItem to="/stocks/market" icon={<PieChart className="w-3.5 h-3.5" />} label="股市场" onClick={() => setMenuOpen(false)} />
              <MobileNavItem to="/stocks/portfolio" icon={<Wallet className="w-3.5 h-3.5" />} label="股持仓" onClick={() => setMenuOpen(false)} />
              <MobileNavItem to="/stocks/screener" icon={<SlidersHorizontal className="w-3.5 h-3.5" />} label="筛选" onClick={() => setMenuOpen(false)} />
              <MobileNavItem to="/stocks/compare" icon={<GitCompare className="w-3.5 h-3.5" />} label="对比" onClick={() => setMenuOpen(false)} />
              <MobileNavItem to="/stocks/backtest" icon={<FlaskConical className="w-3.5 h-3.5" />} label="回测" onClick={() => setMenuOpen(false)} />
            </div>
          )}
        </div>
      </nav>

      {/* Page content */}
      <main>
        <Routes>
          <Route path="/" element={<RecommendPage />} />
          <Route path="/search" element={<SearchPage />} />
          <Route path="/portfolio" element={<PortfolioPage />} />
          <Route path="/market" element={<MarketPage />} />
          <Route path="/screener" element={<ScreenerPage />} />
          <Route path="/stocks" element={<DashboardPage />} />
          <Route path="/stocks/recommend" element={<StockRecommendPage />} />
          <Route path="/stocks/search" element={<StockSearchPage />} />
          <Route path="/stocks/portfolio" element={<StockPortfolioPage />} />
          <Route path="/stocks/screener" element={<StockScreenerPage />} />
          <Route path="/stocks/market" element={<StockMarketPage />} />
          <Route path="/stocks/compare" element={<StockComparePage />} />
          <Route path="/stocks/backtest" element={<StockBacktestPage />} />
        </Routes>
      </main>
    </div>
  );
}

export default App;
