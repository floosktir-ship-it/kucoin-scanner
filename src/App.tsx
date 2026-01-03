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
  const [email, setEmail] = useState(() => localStorage.getItem('ks_email') || '');
  const [loading, setLoading] = useState(true);
  
  // المنطق الجديد: يبدأ بـ 10 آلاف فقط ويحفظ أي تغيير تقوم به
  const [minVolume, setMinVolume] = useState(() => {
    const saved = localStorage.getItem('ks_minVol');
    return saved !== null ? Number(saved) : 10000; 
  });
  
  const [selectedSignal, setSelectedSignal] = useState<Signal | null>(null);

  useEffect(() => {
    localStorage.setItem('ks_minVol', minVolume.toString());
  }, [minVolume]);

  useEffect(() => {
    localStorage.setItem('ks_email', email);
  }, [email]);

  const fetchSignals = async () => {
    try {
      const res = await axios.get('/api/signals');
      setSignals(res.data.signals);
      setStatus(res.data.status);
    } catch (e) { console.error(e); } finally { setLoading(false); }
  };

  useEffect(() => {
    fetchSignals();
    const interval = setInterval(fetchSignals, 60000);
    return () => clearInterval(interval);
  }, []);

  const filteredSignals = useMemo(() => {
    return signals.filter(sig => sig.volume >= minVolume);
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
            <label>Min Vol: ${formatVol(minVolume)}</label>
            <input type="range" min="0" max="1000000" step="5000" value={minVolume} onChange={(e) => setMinVolume(parseInt(e.target.value))} />
          </div>
        </div>
      </header>

      {loading ? (
        <div className="loading-container"><div className="spinner"></div><p>Scanning Markets...</p></div>
      ) : filteredSignals.length === 0 ? (
        <div className="empty-state"><h2>No Signals Found 📉</h2><p>Try lowering the Volume Filter.</p></div>
      ) : (
        <div className="grid">
          {filteredSignals.map((sig) => (
            <div key={sig.symbol} className="card" onClick={() => setSelectedSignal(sig)}>
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

      {selectedSignal && (
        <div className="modal-overlay" onClick={() => setSelectedSignal(null)}>
          <div className="modal-content" onClick={(e) => e.stopPropagation()}>
            <button className="close-btn" onClick={() => setSelectedSignal(null)}>&times;</button>
            <div className="modal-header">
              <h2>{selectedSignal.symbol} Detail</h2>
              <div className="modal-stats" style={{display:'flex', gap:'2rem', margin:'1rem 0'}}>
                <div><label>Price</label><div style={{fontSize:'1.5rem', fontWeight:700}}>${selectedSignal.price}</div></div>
                <div><label>RSI</label><div style={{fontSize:'1.5rem', fontWeight:700, color:'orange'}}>{selectedSignal.rsi.toFixed(2)}</div></div>
                <div><label>Volume</label><div style={{fontSize:'1.5rem', fontWeight:700}}>${formatVol(selectedSignal.volume)}</div></div>
              </div>
            </div>
            <div style={{ height: '450px', background: '#000', borderRadius: '16px', overflow: 'hidden' }}>
              <SignalChart data={selectedSignal.chartData} colors={{ backgroundColor: '#000', textColor: '#d1d4dc' }} />
            </div>
          </div>
        </div>
      )}
    </div>
  )
}
export default App
