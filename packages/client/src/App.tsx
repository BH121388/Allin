import { Routes, Route, NavLink } from 'react-router-dom';
import RecommendPage from '@/pages/RecommendPage';
import SearchPage from '@/pages/SearchPage';
import PortfolioPage from '@/pages/PortfolioPage';
import MarketPage from '@/pages/MarketPage';
import { TrendingUp, Search, Briefcase, BarChart3 } from 'lucide-react';
import { cn } from '@/lib/utils';

function App() {
  return (
    <div className="min-h-screen bg-slate-50">
      {/* Top navigation bar */}
      <nav className="sticky top-0 z-50 bg-white border-b border-slate-200">
        <div className="max-w-3xl mx-auto px-4">
          <div className="flex items-center h-14 gap-1">
            {/* App title */}
            <span className="text-lg font-bold mr-6 text-slate-800">Allin</span>

            {/* Nav links */}
            <NavLink to="/" end className={({ isActive }) =>
              cn(
                "flex items-center gap-2 px-4 py-2 rounded-lg text-sm font-medium transition-colors",
                isActive ? "bg-slate-100 text-slate-900" : "text-slate-500 hover:text-slate-700 hover:bg-slate-50"
              )
            }>
              <TrendingUp className="w-4 h-4" />
              <span>推荐</span>
            </NavLink>

            <NavLink to="/search" className={({ isActive }) =>
              cn(
                "flex items-center gap-2 px-4 py-2 rounded-lg text-sm font-medium transition-colors",
                isActive ? "bg-slate-100 text-slate-900" : "text-slate-500 hover:text-slate-700 hover:bg-slate-50"
              )
            }>
              <Search className="w-4 h-4" />
              <span>查询</span>
            </NavLink>

            <NavLink to="/portfolio" className={({ isActive }) =>
              cn(
                "flex items-center gap-2 px-4 py-2 rounded-lg text-sm font-medium transition-colors",
                isActive ? "bg-slate-100 text-slate-900" : "text-slate-500 hover:text-slate-700 hover:bg-slate-50"
              )
            }>
              <Briefcase className="w-4 h-4" />
              <span>持仓</span>
            </NavLink>

            <NavLink to="/market" className={({ isActive }) =>
              cn(
                "flex items-center gap-2 px-4 py-2 rounded-lg text-sm font-medium transition-colors",
                isActive ? "bg-slate-100 text-slate-900" : "text-slate-500 hover:text-slate-700 hover:bg-slate-50"
              )
            }>
              <BarChart3 className="w-4 h-4" />
              <span>市场</span>
            </NavLink>
          </div>
        </div>
      </nav>

      {/* Page content */}
      <main>
        <Routes>
          <Route path="/" element={<RecommendPage />} />
          <Route path="/search" element={<SearchPage />} />
          <Route path="/portfolio" element={<PortfolioPage />} />
          <Route path="/market" element={<MarketPage />} />
        </Routes>
      </main>
    </div>
  );
}

export default App;
