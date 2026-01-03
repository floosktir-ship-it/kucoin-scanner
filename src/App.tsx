import { useEffect, useState, useMemo } from 'react'
import './App.css'
import axios from 'axios';
import { SignalChart } from './components/SignalChart';

interface Signal {
  symbol: string; price: number; rsi: number; volume: number; signalIdx: number; chartData: any[];
}

function App() {
  const [signals, setSignals] = useState<Signal[]>([]);
  const [status, setStatus] = useState<any>({});
  const [loading, setLoading] = useState(true);
  const [email, setEmail] = useState(() => localStorage.getItem('ks_email') || '');
  const [minVolume, setMinVolume] = useState(() => Number(localStorage.getItem('ks_minVol')) || 10000);
  const [timeframe, setTimeframe] = useState(() => localStorage.getItem('ks_tf') || '4h');
  const [selectedSignal, setSelectedSignal] = useState<Signal | null>(null);

  useEffect(() => {
    localStorage.setItem('ks_minVol', minVolume.toString());
    localStorage.setItem('ks_email', email);
    localStorage.setItem('ks_tf', timeframe);
    axios.post('/api/settings', { timeframe, email });
  }, [minVolume, timeframe, email]);

  const fetchSignals = async () => {
    try {
      const res = await axios.get('/api/signals');
      setSignals(res.data.signals);
      setStatus(res.data.status);
    } finally { setLoading(false); }
  };

  useEffect(() => {
    fetchSignals();
    const interval = setInterval(fetchSignals, 30000);
    return () => clearInterval(interval);
  }, []);

  const filteredSignals = useMemo(() => signals.filter(s => s.volume >= minVolume), [signals, minVolume]);
  const formatVol = (v: number) => v >= 1e6 ? (v/1e6).toFixed(2)+'M' : v >= 1e3 ? (v/1e3).toFixed(1)+'K' : v.toFixed(0);

  return (
    <div className="container">
      <header className="header">
        <h1>🎯 KuCoin Sniper Pro</h1>
        <div className="controls-wrapper">
          <div className="status-pills">
            <div className={`pill ${status.scanning ? 'active' : ''}`}>{status.scanning ? 'Scanning...' : 'Idle'}</div>
            <div className="pill">{status.progress} / {status.total}</div>
          </div>
          <div className="filter-group">
            <select value={timeframe} onChange={e => setTimeframe(e.target.value)} className="tf-select">
              <option value="15m">15m</option><option value="1h">1h</option><option value="4h">4h</option><option value="1d">1d</option>
            </select>
          </div>
          <div className="filter-group">
            <input type="email" placeholder="Set Alert Email" value={email} onChange={e => setEmail(e.target.value)} className="email-input" />
          </div>
          <div className="filter-group volumes">
            <label>Min Vol: ${formatVol(minVolume)}</label>
            <input type="range" min="0" max="1000000" step="10000" value={minVolume} onChange={e => setMinVolume(Number(e.target.value))} />
          </div>
        </div>
      </header>

      {loading ? <div className="loading-container"><div className="spinner"></div></div> : 
       filteredSignals.length === 0 ? <div className="empty-state"><h2>No Signals Found 📉</h2></div> : (
        <div className="grid">
          {filteredSignals.map(sig => (
            <div key={sig.symbol} className="card" onClick={() => setSelectedSignal(sig)}>
              <div className="card-header">
                <span className="symbol-name">{sig.symbol.split('/')[0]}</span>
                <div className="badges">
                  <span className="badge price-val">${sig.price}</span>
                  <span className="badge rsi-val">RSI: {sig.rsi.toFixed(2)}</span>
                </div>
              </div>
              <div className="chart-container-wrapper">
                <SignalChart data={sig.chartData} signalIdx={sig.signalIdx} rsiLevel={20} colors={{ backgroundColor: '#000' }} />
              </div>
            </div>
          ))}
        </div>
      )}

      {selectedSignal && (
        <div className="modal-overlay" onClick={() => setSelectedSignal(null)}>
          <div className="modal-content" onClick={e => e.stopPropagation()}>
            <button className="close-btn" onClick={() => setSelectedSignal(null)}>&times;</button>
            <div className="modal-header">
              <h2>{selectedSignal.symbol} Full Analysis</h2>
            </div>
            <div className="modal-chart-box">
              <SignalChart data={selectedSignal.chartData} signalIdx={selectedSignal.signalIdx} colors={{ backgroundColor: '#000' }} />
            </div>
          </div>
        </div>
      )}
    </div>
  )
}
export default App;
