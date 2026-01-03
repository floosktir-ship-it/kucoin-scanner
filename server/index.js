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

// State
let activeSignals = [];
let allTickers = {};
let analyzedPairsCount = 0;
let totalPairsCount = 0;
let userEmail = '';
let isScanning = false;

// Config
let currentTimeframe = '4h';
const RSI_PERIOD = 14;
const RSI_OVER_SOLD = 20;
const MAX_PAIRS_TO_SCAN = 1000;

async function fetchTopPairs() {
    try {
        const markets = await EXCHANGE.loadMarkets();
        const usdtPairs = Object.keys(markets).filter(s => s.endsWith('/USDT') && markets[s].active);
        const tickers = await EXCHANGE.fetchTickers(usdtPairs);
        allTickers = tickers;
        return Object.values(tickers)
            .sort((a, b) => (b.quoteVolume || 0) - (a.quoteVolume || 0))
            .slice(0, MAX_PAIRS_TO_SCAN)
            .map(t => t.symbol);
    } catch (e) { return []; }
}

async function analyzePair(symbol) {
    try {
        const candles = await EXCHANGE.fetchOHLCV(symbol, currentTimeframe, undefined, 50);
        if (!candles || candles.length < 20) return null;
        const closes = candles.map(c => c[4]);
        const rsiValues = RSI.calculate({ values: closes, period: RSI_PERIOD });
        if (rsiValues.length < 3) return null;

        const confirmedRSI = rsiValues[rsiValues.length - 2]; 
        const prevConfirmedRSI = rsiValues[rsiValues.length - 3];
        const confirmedPrice = closes[closes.length - 2];

        // تنبيه الاختراق القوي: السابقة تحت 20 والمغلقة فوق 20
        if (prevConfirmedRSI < RSI_OVER_SOLD && confirmedRSI >= RSI_OVER_SOLD) {
            return {
                symbol, price: confirmedPrice, rsi: confirmedRSI,
                volume: allTickers[symbol]?.quoteVolume || 0,
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
        
        // فحص متوازي (10 عملات في الدفعة الواحدة) للسرعة القصوى
        for (let i = 0; i < pairs.length; i += 10) {
            const chunk = pairs.slice(i, i + 10);
            const batchResults = await Promise.all(chunk.map(s => analyzePair(s)));
            batchResults.forEach(res => { if (res) newSignals.push(res); });
            analyzedPairsCount += chunk.length;
            await new Promise(r => setTimeout(r, 100)); 
        }
        activeSignals = newSignals;
    } finally { isScanning = false; }
}

setInterval(runScan, 60 * 1000);
runScan();

app.get('/api/signals', (req, res) => {
    res.json({ signals: activeSignals, status: { scanning: isScanning, progress: analyzedPairsCount, total: totalPairsCount } });
});

app.post('/api/settings', (req, res) => {
    const { timeframe, email } = req.body;
    if (email) userEmail = email;
    if (timeframe && timeframe !== currentTimeframe) {
        currentTimeframe = timeframe;
        activeSignals = [];
        if (!isScanning) runScan();
    }
    res.json({ success: true });
});

app.use(express.static(path.join(rootDir, 'dist')));
app.get('/:path*', (req, res) => {
    if (req.path.startsWith('/api')) return res.status(404).end();
    res.sendFile(path.join(rootDir, 'dist', 'index.html'));
});

app.listen(PORT, () => console.log(`Backend Active: ${PORT}`));
