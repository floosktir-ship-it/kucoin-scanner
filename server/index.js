import express from 'express';
import cors from 'cors';
import ccxt from 'ccxt';
import { RSI } from 'technicalindicators';
import dotenv from 'dotenv';
import { fileURLToPath } from 'url';
import { dirname } from 'path';
import path from 'path';

dotenv.config();
const app = express();
app.use(cors());
app.use(express.json());

const PORT = process.env.PORT || 3001;
const __filename = fileURLToPath(import.meta.url);
const __dirname = dirname(__filename);
const rootDir = dirname(__dirname);

const EXCHANGE = new ccxt.kucoin();
let activeSignals = []; 
let allTickers = {}; 
let analyzedPairsCount = 0;
let totalPairsCount = 0;
let isScanning = false;
let userEmail = '';
let currentTimeframe = '4h'; 

async function fetchTopPairs() {
    try {
        const markets = await EXCHANGE.loadMarkets();
        const usdtPairs = Object.keys(markets).filter(s => s.endsWith('/USDT') && markets[s].active);
        const tickers = await EXCHANGE.fetchTickers(usdtPairs);
        allTickers = tickers;
        return Object.values(tickers)
            .sort((a, b) => (b.quoteVolume || 0) - (a.quoteVolume || 0))
            .slice(0, 1000)
            .map(t => t.symbol);
    } catch (e) { return []; }
}

async function analyzePair(symbol) {
    try {
        const candles = await EXCHANGE.fetchOHLCV(symbol, currentTimeframe, undefined, 50);
        if (!candles || candles.length < 25) return null;
        
        const closes = candles.map(c => c[4]);
        const rsiValues = RSI.calculate({ values: closes, period: 14 });
        
        if (rsiValues.length < 3) return null;

        // منطق الإغلاق: فحص الشمعة التي أغلقت لتوها (len-2) والشمعة التي سبقتها (len-3)
        const lastClosedRSI = rsiValues[rsiValues.length - 2];
        const prevClosedRSI = rsiValues[rsiValues.length - 3];
        const currentPrice = closes[closes.length - 1];

        // تقاطع الـ 20 صعوداً بعد إغلاق الشمعة
        if (prevClosedRSI < 20 && lastClosedRSI >= 20) {
            return {
                symbol, price: currentPrice, rsi: lastClosedRSI,
                volume: allTickers[symbol]?.quoteVolume || 0,
                // نرسل الـ Index الخاص بالشمعة التي حدث فيها التقاطع للرسم
                signalIdx: candles.length - 2, 
                chartData: candles.map((c, i) => {
                    const rIdx = i - (closes.length - rsiValues.length);
                    return {
                        time: c[0] / 1000, open: c[1], high: c[2], low: c[3], close: c[4],
                        rsi: rIdx >= 0 ? rsiValues[rIdx] : null
                    };
                })
            };
        }
    } catch (e) {}
    return null;
}

async function runScan() {
    if (isScanning) return;
    isScanning = true;
    try {
        const pairs = await fetchTopPairs();
        totalPairsCount = pairs.length;
        analyzedPairsCount = 0;
        const newSignals = [];
        for (const s of pairs) {
            const sig = await analyzePair(s);
            if (sig) newSignals.push(sig);
            analyzedPairsCount++;
            await new Promise(r => setTimeout(r, 100));
        }
        activeSignals = newSignals;
    } catch (e) {} finally { isScanning = false; }
}

runScan();
setInterval(runScan, 60 * 1000);

app.get('/api/signals', (req, res) => {
    res.json({ signals: activeSignals, status: { scanning: isScanning, progress: analyzedPairsCount, total: totalPairsCount } });
});

app.post('/api/settings', (req, res) => {
    const { email, timeframe } = req.body;
    let changed = false;
    if (email) userEmail = email;
    if (timeframe && timeframe !== currentTimeframe) {
        currentTimeframe = timeframe;
        activeSignals = []; 
        changed = true;
    }
    res.json({ success: true, email: userEmail, timeframe: currentTimeframe });
    if (changed && !isScanning) runScan();
});

app.use(express.static(path.join(rootDir, 'dist')));
app.get('/:path*', (req, res) => {
    if (req.path.startsWith('/api')) return res.status(404).json({ error: 'Not Found' });
    res.sendFile(path.join(rootDir, 'dist', 'index.html'));
});

app.listen(PORT, () => console.log(`Backend running on ${PORT}`));
