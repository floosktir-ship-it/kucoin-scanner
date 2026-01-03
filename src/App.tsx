import { useEffect, useState, useMemo } from 'react'
import './App.css'
import axios from 'axios';
import { SignalChart } from './components/SignalChart';

interface Signal {
  symbol: string; price: number; rsi: number; volume: number; chartData: any[]; signalIdx: number;
}

function App() {
  const [signals, setSignals] = useState<Signal[]>([]);
  const [status, setStatus] = useState<any>({});
  const [loading, setLoading] = useState(true);
  
  const [email, setEmail] = useState(() => localStorage.getItem('ks_email') || '');
  const [timeframe, setTimeframe] = useState(() => localStorage.getItem('ks_tf') || '4h');
  const [minVolume, setMinVolume] = useState(() => {
    const v = localStorage.getItem('ks_minVol');
    return v !== null ? Number(v) : 10000;
  });
  
  const [selected, setSelected] = useState<Signal | null>(null);

  useEffect(() => {
    localStorage.setItem('ks_minVol', minVolume.toString());
  }, [minVolume]);

  useEffect(() => {
    localStorage.setItem('ks_email', email);
  }, [email]);

  useEffect(() => {
    localStorage.setItem('ks_tf', timeframe);
    axios.post('/api/settings', { timeframe });
  }, [timeframe]);

  const fetchSignals = async () => {
    try {
      const res = await axios.get('/api/signals');
      setSignals(res.data.signals);
      setStatus(res.data.status);
    } catch (e) { console.error(e); } finally { setLoading(false); }
  };

  const saveEmail = async () => {
    await axios.post('/api/settings', { email });
    alert('Email Saved!');
  };

  useEffect(() => {
    fetchSignals();
    const interval = setInterval(fetchSignals, 60000);
    return () => clearInterval(interval);
  }, []);

  const filtered = useMemo(() => {
    return signals.filter(s => s.volume >= minVolume);
  }, [signals, minVolume]);

  const formatVol = (v: number) => {
    if (v >= 1000000) return `${(v / 1000000).toFixed(2)}M`;
    if (v >= 1000) return `${(v / 1000).toFixed(1)}K`;
    return v.toFixed(0);
  };

  return (
    <div className="container">
      <header className="header">
        <h1>🎯 KuCoin Sniper</h1>
        <div className="controls-wrapper">
          <div className="status-pills">
            <div className={`pill ${status.scanning ? 'active' : ''}`}>{status.scanning ? 'Scanning...' : 'Idle'}</div>
            <div className="pill">{status.progress} / {status.total}</div>
          </div>
          
          <div className="filter-group">
            <label>TF:</label>
            <select value={timeframe} onChange={(e) => setTimeframe(e.target.value)} className="tf-select">
              <option value="15m">15m</option>
              <option value="30m">30m</option>
              <option value="1h">1h</option>
              <option value="4h">4h</option>
              <option value="1d">1d</option>
            </select>
          </div>

          <div className="filter-group">
            <label>Vol: ${formatVol(minVolume)}</label>
            <input type="range" min="0" max="1000000" step="5000" value={minVolume} onChange={(e) => setMinVolume(Number(e.target.value))} />
          </div>

          <div className="filter-group">
            <input type="email" placeholder="Email Alerts" value={email} onChange={(e) => setEmail(e.target.value)} className="email-input" />
            <button className="save-btn" onClick={saveEmail}>Save</button>
          </div>
        </div>
      </header>

      {loading ? (
        <div className="loading-container"><div className="spinner"></div><p>Searching for confirmed breakouts...</p></div>
      ) : filtered.length === 0 ? (
        <div className="empty-state"><h2>No Signals 📉</h2><p>Wait for candle close or try 15m.</p></div>
      ) : (
        <div className="grid">
          {filtered.map((sig) => (
            <div key={sig.symbol} className="card" onClick={() => setSelected(sig)}>
              <div className="card-header">
                <div className="symbol-name">{sig.symbol.split('/')[0]}</div>
                <div className="badges">
                  <span className="badge price-val">${sig.price}</span>
                  <span className="badge rsi-val">RSI: {sig.rsi.toFixed(2)}</span>
                  <span className="badge vol-val">V: {formatVol(sig.volume)}</span>
                </div>
              </div>
              <div className="chart-container-wrapper">
                <SignalChart data={sig.chartData} signalIdx={sig.signalIdx} colors={{ backgroundColor: '#000' }} />
              </div>
            </div>
          ))}
        </div>
      )}

      {selected && (
        <div className="modal-overlay" onClick={() => setSelected(null)}>
          <div className="modal-content" onClick={(e) => e.stopPropagation()}>
            <button className="close-btn" onClick={() => setSelected(null)}>&times;</button>
            <div className="modal-header">
              <h2>{selected.symbol} Details</h2>
              <div className="modal-stats" style={{display:'flex', gap:'2rem', margin:'1rem 0'}}>
                <div><label>Price</label><div style={{fontSize:'1.5rem', fontWeight:700}}>${selected.price}</div></div>
                <div><label>RSI (Closed)</label><div style={{fontSize:'1.5rem', fontWeight:700, color:'orange'}}>{selected.rsi.toFixed(2)}</div></div>
                <div><label>TF</label><div style={{fontSize:'1.5rem', fontWeight:700, color:'cyan'}}>{timeframe}</div></div>
              </div>
            </div>
            <div style={{ height: '450px', background: '#000', borderRadius: '16px', overflow: 'hidden' }}>
              <SignalChart data={selected.chartData} signalIdx={selected.signalIdx} colors={{ backgroundColor: '#000' }} />
            </div>
          </div>
        </div>
      )}
    </div>
  )
}
export default App
