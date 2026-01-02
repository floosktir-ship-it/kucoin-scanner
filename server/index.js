import express from 'express';
import cors from 'cors';
import ccxt from 'ccxt';
import { RSI, SMA } from 'technicalindicators';
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
const rootDir = path.resolve(__dirname, '..'); // ضمان الوصول للمجلد الرئيسي

const EXCHANGE = new ccxt.kucoin();

// State
let activeSignals = [];
let allTickers = {};
let analyzedPairsCount = 0;
let totalPairsCount = 0;
let isScanning = false;

const TIMEFRAME = '4h';
const RSI_PERIOD = 14;
const SMA_PERIOD = 9;
const RSI_OVER_SOLD = 20;

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
            .slice(0, 1000)
            .map(t => t.symbol);
    } catch (e) {
        console.error("Error fetching markets:", e.message);
        return [];
    }
}

async function analyzePair(symbol) {
    try {
        const candles = await EXCHANGE.fetchOHLCV(symbol, TIMEFRAME, undefined, 50);
        if (!candles || candles.length < 20) return null;
        const closes = candles.map(c => c[4]);
        const rsiValues = RSI.calculate({ values: closes, period: RSI_PERIOD });
        const smaValues = SMA.calculate({ values: closes, period: SMA_PERIOD });
        if (rsiValues.length < 2 || smaValues.length < 1) return null;

        const currentRSI = rsiValues[rsiValues.length - 1];
        const prevRSI = rsiValues[rsiValues.length - 2];
        const currentSMA = smaValues[smaValues.length - 1];
        const currentPrice = closes[closes.length - 1];

        if (prevRSI < RSI_OVER_SOLD && currentRSI >= RSI_OVER_SOLD && currentPrice >= currentSMA) {
            return {
                symbol, price: currentPrice, rsi: currentRSI, sma: currentSMA,
                volume: allTickers[symbol]?.quoteVolume || 0,
                chartData: candles.map((c, i) => {
                    const rsiIdx = i - (closes.length - rsiValues.length);
                    const smaIdx = i - (closes.length - smaValues.length);
                    return {
                        time: c[0] / 1000, open: c[1], high: c[2], low: c[3], close: c[4],
                        rsi: rsiIdx >= 0 ? rsiValues[rsiIdx] : null,
                        sma: smaIdx >= 0 ? smaValues[smaIdx] : null
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
    console.log("Starting Scan...");
    try {
        const pairs = await fetchTopPairs();
        totalPairsCount = pairs.length;
        analyzedPairsCount = 0;
        const newSignals = [];
        for (const symbol of pairs) {
            const signal = await analyzePair(symbol);
            if (signal) newSignals.push(signal);
            analyzedPairsCount++;
            await new Promise(r => setTimeout(r, 100));
        }
        activeSignals = newSignals;
        console.log("Scan Complete.");
    } catch (e) {
        console.error("Scan error:", e.message);
    } finally { isScanning = false; }
}

runScan();
setInterval(runScan, 5 * 60 * 1000);

app.get('/api/signals', (req, res) => {
    res.json({ signals: activeSignals, status: { scanning: isScanning, progress: analyzedPairsCount, total: totalPairsCount } });
});

app.use(express.static(path.join(rootDir, 'dist')));

app.get('*', (req, res) => {
    const indexPath = path.join(rootDir, 'dist', 'index.html');
    res.sendFile(indexPath, (err) => {
        if (err) {
            res.status(500).send("Build internal folder 'dist' not found. Please wait for Render build to finish.");
        }
    });
});

app.listen(PORT, () => {
    console.log(`Server is running on port ${PORT}`);
});
