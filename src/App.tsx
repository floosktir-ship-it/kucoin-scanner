import { useEffect, useState, useMemo } from 'react'
import './App.css'
import axios from 'axios';
import { SignalChart } from './components/SignalChart';

interface Signal {
  symbol: string; price: number; rsi: number; volume: number; chartData: any[];
}

function App() {
  const [signals, setSignals] = useState<Signal[]>([]);
  const [status, setStatus] = useState<any>({});
  const [email, setEmail] = useState('');
  const [loading, setLoading] = useState(true);
  const [minVolume, setMinVolume] = useState(100000);
  const [selected, setSelected] = useState<Signal | null>(null);

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

  const filtered = useMemo(() => signals.filter(s => s.volume >= minVolume), [signals, minVolume]);

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
            <label>Min Vol: ${formatVol(minVolume)}</label>
            <input type="range" min="0" max="5000000" step="50000" value={minVolume} onChange={(e) => setMinVolume(parseInt(e.target.value))} />
          </div>
          <div className="email-settings">
            <input type="email" placeholder="Email Alerts" value={email} onChange={(e) => setEmail(e.target.value)} />
            <button className="save-btn" onClick={saveEmail}>Save</button>
          </div>
        </div>
      </header>

      {loading ? (
        <div className="loading-container"><div className="spinner"></div><p>Analyzing Markets...</p></div>
      ) : filtered.length === 0 ? (
        <div className="empty-state"><h2>No Signals Found 📉</h2><p>Try lowering the Volume Filter.</p></div>
      ) : (
        <div className="grid">
          {filtered.map((sig) => (
            <div key={sig.symbol} className="card" onClick={() => setSelected(sig)}>
              <div className="card-header">
                <div className="symbol-name">{sig.symbol.split('/')[0]}</div>
                <div className="badges">
                  <span className="badge price-val">${sig.price}</span>
                  <span className="badge rsi-val">RSI: {sig.rsi.toFixed(2)}</span>
                  <span className="badge vol-val">Vol: {formatVol(sig.volume)}</span>
                </div>
              </div>
              <div className="chart-container-wrapper">
                <SignalChart data={sig.chartData} colors={{ backgroundColor: '#000', textColor: '#d1d4dc' }} />
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
              <h2 style={{ fontSize: '2rem', margin: '0 0 1rem 0' }}>{selected.symbol} Detail</h2>
              <div style={{ display: 'flex', gap: '2rem', marginBottom: '2rem' }} className="modal-stats">
                <div><label>Price</label><div>${selected.price}</div></div>
                <div><label>RSI</label><div style={{color:'orange'}}>{selected.rsi.toFixed(2)}</div></div>
                <div><label>24h volume</label><div>${formatVol(selected.volume)}</div></div>
              </div>
            </div>
            <div style={{ height: '500px', background: '#000', borderRadius: '16px', overflow: 'hidden' }}>
              <SignalChart data={selected.chartData} colors={{ backgroundColor: '#000', textColor: '#d1d4dc' }} />
            </div>
            <p style={{marginTop:'1.5rem', color:'#888'}}>Strategy: RSI(14) Cross Above 20. 4H Timeframe.</p>
          </div>
        </div>
      )}
    </div>
  )
}
export default App
