import { useEffect, useState, useMemo } from 'react'
import './App.css'
import axios from 'axios';
import { SignalChart } from './components/SignalChart';

interface Signal { symbol: string; price: number; rsi: number; volume: number; chartData: any[]; signalIdx: number; }

function App() {
  const [signals, setSignals] = useState<Signal[]>([]);
  const [status, setStatus] = useState({ scanning: false, progress: 0, total: 0 });
  const [loading, setLoading] = useState(true);
  const [email, setEmail] = useState(() => localStorage.getItem('ks_email') || '');
  const [timeframe, setTimeframe] = useState(() => localStorage.getItem('ks_tf') || '4h');
  const [rsiLevel, setRsiLevel] = useState(() => Number(localStorage.getItem('ks_rsiL')) || 20);
  const [minVolume, setMinVolume] = useState(() => Number(localStorage.getItem('ks_minV')) || 10000);
  const [selected, setSelected] = useState<Signal | null>(null);

  useEffect(() => {
    localStorage.setItem('ks_email', email);
    localStorage.setItem('ks_tf', timeframe);
    localStorage.setItem('ks_rsiL', rsiLevel.toString());
    localStorage.setItem('ks_minV', minVolume.toString());
    axios.post('/api/settings', { timeframe, rsiLevel }).catch(() => {});
  }, [timeframe, rsiLevel, minVolume]);

  const fetchSignals = async () => {
    try {
      const res = await axios.get('/api/signals');
      if (res.data) {
        setSignals(res.data.signals || []);
        setStatus(res.data.status || { scanning: false, progress: 0, total: 0 });
      }
    } catch (e) { console.error(e); } finally { setLoading(false); }
  };

  useEffect(() => {
    fetchSignals();
    const inv = setInterval(fetchSignals, 5000);
    return () => clearInterval(inv);
  }, []);

  const handleJoin = async () => {
    if(!email.includes('@')) return alert("Enter valid email");
    await axios.post('/api/settings', { email });
    alert("✅ Subscribed to alerts!");
  };

  const filtered = useMemo(() => signals.filter(s => s.volume >= minVolume), [signals, minVolume]);
  const formatVol = (v: number) => v >= 1000000 ? `${(v/1000000).toFixed(1)}M` : v >= 1000 ? `${(v/1000).toFixed(0)}K` : v.toFixed(0);

  return (
    <div className="container">
      <header className="header">
        <div className="title-area">
          <h1>🎯 KuCoin Sniper <span className="pro-badge">PRO</span></h1>
          <p>{status.scanning ? `Scanning: ${status.progress}/${status.total}` : 'Market Ready 🟢'}</p>
        </div>
        <div className="pro-panel">
          <div className="panel-row">
            <div className="input-box"><label>Timeframe</label>
              <select value={timeframe} onChange={e => setTimeframe(e.target.value)}>
                <option value="15m">15m</option><option value="1h">1h</option><option value="4h">4h</option><option value="1d">1d</option>
              </select>
            </div>
            <div className="input-box"><label>RSI Level</label>
              <input type="number" value={rsiLevel} onChange={e => setRsiLevel(Number(e.target.value))} />
            </div>
            <div className="input-box"><label>Min Vol: ${formatVol(minVolume)}</label>
              <input type="range" min="0" max="1000000" step="10000" value={minVolume} onChange={e => setMinVolume(Number(e.target.value))} />
            </div>
          </div>
          <div className="panel-row">
            <div className="input-box wide">
              <label>Join Mobile Alerts List</label>
              <div style={{display:'flex', gap:'5px'}}>
                <input type="email" value={email} onChange={e => setEmail(e.target.value)} placeholder="Email address" />
                <button onClick={handleJoin} className="save-btn">JOIN</button>
              </div>
            </div>
          </div>
        </div>
      </header>

      {loading ? (
        <div className="loading-container"><div className="spinner"></div><p>Syncing Markets...</p></div>
      ) : (
        <div className="grid">
          {filtered.map(sig => (
            <div key={sig.symbol} className="card" onClick={() => setSelected(sig)}>
              <div className="card-header">
                <span className="sym">{sig.symbol.split('/')[0]}</span>
                <div className="info"><span className="price">${sig.price}</span><span className="rsi-val">RSI: {sig.rsi.toFixed(1)}</span></div>
              </div>
              <div className="chart-preview">
                <SignalChart data={sig.chartData} signalIdx={sig.signalIdx} rsiLevel={rsiLevel} colors={{backgroundColor:'#000'}} />
              </div>
            </div>
          ))}
        </div>
      )}

      {selected && (
        <div className="modal-overlay" onClick={() => setSelected(null)}>
          <div className="modal-content" onClick={e => e.stopPropagation()}>
            <button className="close" onClick={() => setSelected(null)}>&times;</button>
            <div className="modal-head">
               <h2>{selected.symbol} Details</h2>
               <div className="modal-stats">
                  <div>Price: <span>${selected.price}</span></div>
                  <div>RSI: <span>{selected.rsi.toFixed(2)}</span></div>
                  <div>Vol: <span>${formatVol(selected.volume)}</span></div>
               </div>
            </div>
            <div className="modal-chart-box">
              <SignalChart data={selected.chartData} signalIdx={selected.signalIdx} rsiLevel={rsiLevel} colors={{backgroundColor:'#000'}} />
            </div>
          </div>
        </div>
      )}
    </div>
  )
}
export default App
