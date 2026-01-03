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
let isScanning = false;

// Configuration
let currentTimeframe = '4h'; // الفريم الافتراضي
const RSI_PERIOD = 14;
const RSI_OVER_SOLD = 20; 
const MAX_PAIRS_TO_SCAN = 1000; 

async function fetchTopPairs() {
    try {
        const markets = await EXCHANGE.loadMarkets();
        const usdtPairs = Object.keys(markets).filter(symbol =>
            symbol.endsWith('/USDT') && markets[symbol].active
        );
        const tickers = await EXCHANGE.fetchTickers(usdtPairs);
        allTickers = tickers;
        return Object.values(tickers)
            .sort((a, b) => (b.quoteVolume || 0) - (a.quoteVolume || 0))
            .slice(0, MAX_PAIRS_TO_SCAN)
            .map(t => t.symbol);
    } catch (e) {
        console.error("Error fetching markets:", e);
        return [];
    }
}

async function analyzePair(symbol) {
    try {
        const candles = await EXCHANGE.fetchOHLCV(symbol, currentTimeframe, undefined, 50);
        if (!candles || candles.length < 20) return null;
        const closes = candles.map(c => c[4]);
        const rsiValues = RSI.calculate({ values: closes, period: RSI_PERIOD });
        if (rsiValues.length < 2) return null;

        const currentRSI = rsiValues[rsiValues.length - 1];
        const prevRSI = rsiValues[rsiValues.length - 2];
        const currentPrice = closes[closes.length - 1];

        // شرط الاستراتيجية: اختراق مستوى 20 للأعلى
        if (prevRSI < RSI_OVER_SOLD && currentRSI >= RSI_OVER_SOLD) {
            return {
                symbol,
                price: currentPrice,
                rsi: currentRSI,
                volume: allTickers[symbol]?.quoteVolume || 0,
                chartData: candles.map((c, i) => {
                    const rsiIdx = i - (closes.length - rsiValues.length);
                    return {
                        time: c[0] / 1000,
                        open: c[1], high: c[2], low: c[3], close: c[4],
                        rsi: rsiIdx >= 0 ? rsiValues[rsiIdx] : null
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
        for (const symbol of pairs) {
            const signal = await analyzePair(symbol);
            if (signal) newSignals.push(signal);
            analyzedPairsCount++;
            await new Promise(r => setTimeout(r, 100)); // تأخير بسيط لتجنب الحظر
        }
        activeSignals = newSignals;
    } catch (e) {
        console.error("Scan failed:", e);
    } finally {
        isScanning = false;
    }
}

runScan();
setInterval(runScan, 60 * 1000);

app.get('/api/signals', (req, res) => {
    res.json({
        signals: activeSignals,
        status: { scanning: isScanning, progress: analyzedPairsCount, total: totalPairsCount }
    });
});

app.post('/api/settings', (req, res) => {
    const { timeframe } = req.body;
    let changed = false;
    if (timeframe && timeframe !== currentTimeframe) {
        currentTimeframe = timeframe;
        activeSignals = []; // مسح النتائج القديمة
        changed = true;
    }
    res.json({ success: true, timeframe: currentTimeframe });
    if (changed && !isScanning) runScan();
});

app.use(express.static(path.join(rootDir, 'dist')));
app.get('/:path*', (req, res) => {
    if (req.path.startsWith('/api')) return res.status(404).json({ error: 'Not Found' });
    res.sendFile(path.join(rootDir, 'dist', 'index.html'));
});

app.listen(PORT, () => console.log(`Backend running on PORT ${PORT}`));
