import { useState, useEffect } from 'react';

function App() {
  const [health, setHealth] = useState<{ status: string; uptime: number } | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [loading, setLoading] = useState(true);

  const checkHealth = () => {
    setLoading(true);
    setError(null);
    fetch('/api/health')
      .then(res => res.json())
      .then((data) => {
        if (data.success) {
          setHealth(data.data);
        } else {
          setError(data.error || 'Unknown error');
        }
      })
      .catch(err => setError(err.message))
      .finally(() => setLoading(false));
  };

  useEffect(() => { checkHealth(); }, []);

  return (
    <div className="min-h-screen flex items-center justify-center bg-slate-50">
      <div className="max-w-md w-full mx-4">
        <div className="bg-white rounded-xl shadow-sm border border-slate-200 p-8">
          <h1 className="text-2xl font-bold mb-2">Allin</h1>
          <p className="text-slate-500 mb-6">基金智能投资决策工具</p>

          <div className="space-y-2 text-sm">
            <div className="flex justify-between py-2 border-b border-slate-100">
              <span className="text-slate-500">后端状态</span>
              <span className={health ? 'text-green-600 font-medium' : error ? 'text-red-600' : 'text-slate-400'}>
                {health ? '连接正常' : error ? '连接失败' : '连接中...'}
              </span>
            </div>
            {health && (
              <div className="flex justify-between py-2 border-b border-slate-100">
                <span className="text-slate-500">运行时间</span>
                <span className="font-medium">{Math.floor(health.uptime)}s</span>
              </div>
            )}
            {error && (
              <div className="py-2 text-red-500 text-xs">
                {error}
              </div>
            )}
          </div>

          <button
            onClick={checkHealth}
            disabled={loading}
            className="mt-4 w-full py-2 px-4 border border-slate-300 rounded-md text-sm font-medium text-slate-700 hover:bg-slate-50 disabled:opacity-50"
          >
            {loading ? '检测中...' : '重新检测'}
          </button>
        </div>
      </div>
    </div>
  );
}

export default App;
