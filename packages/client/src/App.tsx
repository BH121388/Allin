import { useState, useEffect } from 'react';
import { Card, CardHeader, CardTitle, CardDescription, CardContent } from '@/components/ui/card';
import { Button } from '@/components/ui/button';

function App() {
  const [health, setHealth] = useState<{ status: string; uptime: number } | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [loading, setLoading] = useState(true);

  const checkHealth = () => {
    setLoading(true);
    setHealth(null);
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
      <Card className="w-full max-w-md mx-4">
        <CardHeader>
          <CardTitle>Allin</CardTitle>
          <CardDescription>基金智能投资决策工具 v1.0</CardDescription>
        </CardHeader>
        <CardContent className="space-y-4">
          <div className="space-y-2 text-sm">
            <div className="flex justify-between py-2 border-b">
              <span className="text-muted-foreground">后端状态</span>
              <span className={
                loading ? 'text-muted-foreground' :
                health ? 'text-green-600 font-medium' :
                'text-red-600'
              }>
                {loading ? '⏳ 连接中...' :
                 health ? '✅ 连接正常' :
                 '❌ 连接失败'}
              </span>
            </div>
            {health && (
              <div className="flex justify-between py-2 border-b">
                <span className="text-muted-foreground">运行时间</span>
                <span className="font-medium">{Math.floor(health.uptime)}s</span>
              </div>
            )}
            {error && (
              <p className="text-red-500 text-xs py-1">{error}</p>
            )}
          </div>
          <Button onClick={checkHealth} variant="outline" className="w-full" disabled={loading}>
            {loading ? '检测中...' : '重新检测'}
          </Button>
        </CardContent>
      </Card>
    </div>
  );
}

export default App;
