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
  const [loading, setLoading] = useState(true);
  
  // استعادة الإعدادات المحفوظة
  const [minVolume, setMinVolume] = useState(() => {
    const saved = localStorage.getItem('ks_minVol');
    return saved !== null ? Number(saved) : 10000;
  });
  const [timeframe, setTimeframe] = useState(() => localStorage.getItem('ks_tf') || '4h');
  const [selectedSignal, setSelectedSignal] = useState<Signal | null>(null);

  // حفظ الإعدادات تلقائياً عند تغييرها
  useEffect(() => {
    localStorage.setItem('ks_minVol', minVolume.toString());
  }, [minVolume]);

  useEffect(() => {
    localStorage.setItem('ks_tf', timeframe);
    axios.post('/api/settings', { timeframe });
  }, [timeframe]);

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

  useEffect(() => {
    fetchSignals();
    const interval = setInterval(fetchSignals, 60000);
    return () => clearInterval(interval);
  }, []);

  const filteredSignals = useMemo(() => {
    return signals.filter(sig => sig.volume >= minVolume);
  }, [signals, minVolume]);

  const formatVol = (vol: number) => {
    if (vol >= 1000000) return `${(vol / 1000000).toFixed(2)} M`;
    if (vol >= 1000) return `${(vol / 1000).toFixed(1)} K`;
    return vol.toFixed(0);
  };

  return (
    <div className="container">
      <header className="header">
        <h1>🎯 KuCoin Sniper</h1>
        <div className="controls-wrapper">
          <div className="status-pills">
            <div className={`pill ${status.scanning ? 'active' : ''} `}>
              {status.scanning ? 'Scanning...' : 'Idle'}
            </div>
            <div className="pill">{status.progress} / {status.total}</div>
          </div>

          <div className="filter-group">
            <label>Timeframe:</label>
            <select value={timeframe} onChange={(e) => setTimeframe(e.target.value)} className="tf-select">
              <option value="15m">15m</option>
              <option value="30m">30m</option>
              <option value="1h">1h</option>
              <option value="4h">4h</option>
              <option value="1d">1d</option>
            </select>
          </div>

          <div className="filter-group">
            <label>Min Vol: ${formatVol(minVolume)}</label>
            <input type="range" min="0" max="1000000" step="5000" value={minVolume} onChange={(e) => setMinVolume(parseInt(e.target.value))} />
          </div>
        </div>
      </header>

      {loading ? (
        <div className="loading-container">
          <div className="spinner"></div>
          <p>Analyzing Markets...</p>
        </div>
      ) : filteredSignals.length === 0 ? (
        <div className="empty-state">
          <h2>No Signals Found 📉</h2>
          <p>Try switching to 15m or lowering Vol.</p>
        </div>
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
              <h2 style={{ fontSize: '2rem', margin: '0 0 1rem 0' }}>{selectedSignal.symbol} Detail</h2>
              <div style={{ display: 'flex', gap: '2rem', marginBottom: '2rem' }}>
                <div>
                  <div style={{ color: 'var(--text-secondary)', fontSize: '0.9rem' }}>Price</div>
                  <div style={{ fontSize: '1.5rem', fontWeight: 700 }}>${selectedSignal.price}</div>
                </div>
                <div>
                  <div style={{ color: 'var(--text-secondary)', fontSize: '0.9rem' }}>RSI (14)</div>
                  <div style={{ fontSize: '1.5rem', fontWeight: 700, color: 'var(--warning)' }}>{selectedSignal.rsi.toFixed(2)}</div>
                </div>
                <div>
                  <div style={{ color: 'var(--text-secondary)', fontSize: '0.9rem' }}>24h Vol</div>
                  <div style={{ fontSize: '1.5rem', fontWeight: 700 }}>${formatVol(selectedSignal.volume)}</div>
                </div>
              </div>
            </div>
            <div style={{ height: '500px', background: '#000', borderRadius: '16px', overflow: 'hidden' }}>
              <SignalChart data={selectedSignal.chartData} colors={{ backgroundColor: '#000', textColor: '#d1d4dc' }} />
            </div>
          </div>
        </div>
      )}
    </div>
  )
}
export default App
