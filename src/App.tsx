import { useEffect, useState, useMemo } from 'react'
import './App.css'
import axios from 'axios';
import { SignalChart } from './components/SignalChart';

interface Signal { symbol: string; price: number; rsi: number; volume: number; chartData: any[]; signalIdx: number; }

function App() {
  const [signals, setSignals] = useState<Signal[]>([]);
  const [status, setStatus] = useState<any>({ scanning: false, progress: 0, total: 0 });
  const [loading, setLoading] = useState(true);
  const [email, setEmail] = useState(() => localStorage.getItem('ks_email') || '');
  const [timeframe, setTimeframe] = useState(() => localStorage.getItem('ks_tf') || '4h');
  const [rsiLevel, setRsiLevel] = useState(() => Number(localStorage.getItem('ks_rsiL')) || 20);
  const [rsiPeriod, setRsiPeriod] = useState(() => Number(localStorage.getItem('ks_rsiP')) || 14);
  const [minVolume, setMinVolume] = useState(() => Number(localStorage.getItem('ks_minV')) || 10000);
  const [selectedSignal, setSelected] = useState<Signal | null>(null);

  useEffect(() => {
    localStorage.setItem('ks_email', email);
    localStorage.setItem('ks_tf', timeframe);
    localStorage.setItem('ks_rsiL', rsiLevel.toString());
    localStorage.setItem('ks_rsiP', rsiPeriod.toString());
    localStorage.setItem('ks_minV', minVolume.toString());
    axios.post('/api/settings', { email, timeframe, rsiLevel, rsiPeriod });
  }, [email, timeframe, rsiLevel, rsiPeriod, minVolume]);

  const fetchSignals = async () => {
    try {
      const res = await axios.get('/api/signals');
      setSignals(res.data.signals);
      setStatus(res.data.status);
    } catch (e) {} finally { setLoading(false); }
  };

  useEffect(() => {
    fetchSignals();
    const inv = setInterval(fetchSignals, 5000);
    return () => clearInterval(inv);
  }, []);

  const filtered = useMemo(() => signals.filter(s => s.volume >= minVolume), [signals, minVolume]);
  const formatVol = (v: number) => v >= 1000000 ? `${(v/1000000).toFixed(1)}M` : v >= 1000 ? `${(v/1000).toFixed(0)}K` : v.toFixed(0);

  return (
    <div className="container">
      <header className="header">
        <div className="title-area">
          <h1>🎯 KuCoin Sniper <span className="pro-badge">PRO</span></h1>
          <p className="scan-status">{status.scanning ? `Scanning: ${status.progress} / ${status.total}` : 'Idle'}</p>
        </div>
        
        <div className="pro-panel">
          <div className="panel-row">
            <div className="input-box"><label>Timeframe</label>
              <select value={timeframe} onChange={e => setTimeframe(e.target.value)}>
                <option value="15m">15m</option><option value="1h">1h</option><option value="4h">4h</option><option value="1d">1d</option>
              </select>
            </div>
            <div className="input-box"><label>RSI Cross Above</label>
              <input type="number" value={rsiLevel} onChange={e => setRsiLevel(Number(e.target.value))} />
            </div>
          </div>
          <div className="panel-row">
            <div className="input-box wide"><label>Email Alerts</label>
              <input type="email" value={email} onChange={e => setEmail(e.target.value)} placeholder="your@email.com" />
            </div>
            <div className="input-box"><label>Min Volume: ${formatVol(minVolume)}</label>
              <input type="range" min="0" max="1000000" step="10000" value={minVolume} onChange={e => setMinVolume(Number(e.target.value))} />
            </div>
          </div>
        </div>
      </header>

      {loading ? (
        <div className="loading-container"><div className="spinner"></div><p>Performing High Speed Market Analysis...</p></div>
      ) : filtered.length === 0 ? (
        <div className="empty-state"><h2>No Signals</h2><p>Wait for candle close or try 15m timeframe.</p></div>
      ) : (
        <div className="grid">
          {filtered.map(sig => (
            <div key={sig.symbol} className="card" onClick={() => setSelected(sig)}>
              <div className="card-header">
                <span className="sym">{sig.symbol.split('/')[0]}</span>
                <div className="info">
                  <span className="price">${sig.price}</span>
                  <span className="rsi-val">RSI: {sig.rsi.toFixed(1)}</span>
                </div>
              </div>
              <div className="chart-preview">
                <SignalChart data={sig.chartData} signalIdx={sig.signalIdx} rsiLevel={rsiLevel} colors={{backgroundColor:'#000'}} />
              </div>
            </div>
          ))}
        </div>
      )}

      {selectedSignal && (
        <div className="modal-overlay" onClick={() => setSelected(null)}>
          <div className="modal-content" onClick={e => e.stopPropagation()}>
            <button className="close" onClick={() => setSelected(null)}>&times;</button>
            <div className="modal-head">
               <h2>{selectedSignal.symbol} Detail</h2>
               <div className="modal-stats">
                  <div>Price: <span>${selectedSignal.price}</span></div>
                  <div>RSI: <span>{selectedSignal.rsi.toFixed(2)}</span></div>
                  <div>Volume: <span>${formatVol(selectedSignal.volume)}</span></div>
               </div>
            </div>
            <div className="modal-chart-box">
              <SignalChart data={selectedSignal.chartData} signalIdx={selectedSignal.signalIdx} rsiLevel={rsiLevel} colors={{backgroundColor:'#000'}} />
            </div>
          </div>
        </div>
      )}
    </div>
  )
}
export default App
