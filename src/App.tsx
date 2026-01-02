
import { useEffect, useState } from 'react'
import './App.css'
import axios from 'axios';
import { SignalChart } from './components/SignalChart';

interface Signal {
  symbol: string;
  price: number;
  rsi: number;
  sma: number;
  chartData: any[];
}

function App() {
  const [signals, setSignals] = useState<Signal[]>([]);
  const [status, setStatus] = useState<any>({});
  const [email, setEmail] = useState('');
  const [loading, setLoading] = useState(true);

  const fetchSignals = async () => {
    try {
      const res = await axios.get('/api/signals');
      setSignals(res.data.signals);
      setStatus(res.data.status);
    } catch (error) {
      console.error("Failed to fetch signals", error);
    } finally {
      setLoading(false);
    }
  };

  const saveEmail = async () => {
    await axios.post('/api/settings', { email });
    alert('Email Saved! You will receive alerts.');
  };

  useEffect(() => {
    fetchSignals();
    const interval = setInterval(fetchSignals, 60000); // Poll every minute
    return () => clearInterval(interval);
  }, []);

  return (
    <div className="container">
      <header className="header">
        <h1>🎯 KuCoin Sniper</h1>
        <div className="status-bar">
          <span>Status: {status.scanning ? 'Scanning...' : 'Idle'}</span>
          <span>Scanned: {status.progress} / {status.total}</span>
        </div>
        <div className="email-settings">
          <input
            type="email"
            placeholder="Enter Gmail for Alerts"
            value={email}
            onChange={(e) => setEmail(e.target.value)}
          />
          <button onClick={saveEmail}>Save</button>
        </div>
      </header>

      {loading ? (
        <div className="loading">Initializing Strategy Scanner...</div>
      ) : signals.length === 0 ? (
        <div className="empty-state">
          <h2>No Signals Found 📉</h2>
          <p>Scanning Top USDT Pairs on 4H Timeframe...</p>
          <p>Waiting for RSI(14) to cross 20 Up &amp; Price &gt; SMA(9)</p>
        </div>
      ) : (
        <div className="grid">
          {signals.map((sig) => (
            <div key={sig.symbol} className="card">
              <div className="card-header">
                <h3>{sig.symbol}</h3>
                <div className="badges">
                  <span className="badge rsi">RSI: {sig.rsi.toFixed(2)}</span>
                  <span className="badge price">${sig.price}</span>
                </div>
              </div>
              <div className="chart-wrapper">
                <SignalChart
                  data={sig.chartData}
                  colors={{ backgroundColor: '#1e1e1e', textColor: 'white' }}
                />
              </div>
            </div>
          ))}
        </div>
      )}
    </div>
  )
}

export default App
