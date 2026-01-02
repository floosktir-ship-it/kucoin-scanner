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
const rootDir = path.resolve(__dirname, '..');

const EXCHANGE = new ccxt.kucoin();

// --- State (البيانات الحالية) ---
let activeSignals = []; 
let allTickers = {}; 
let analyzedPairsCount = 0;
let totalPairsCount = 0;
let userEmail = ''; 
let isScanning = false;

// --- الإعدادات ---
const TIMEFRAME = '4h';
const RSI_PERIOD = 14;
const SMA_PERIOD = 9;
const RSI_OVER_SOLD = 20; // الاستراتيجية: تقاطع للأعلى من مستوى 20
const MAX_PAIRS_TO_SCAN = 1000;

// جلب أفضل العملات بناءً على حجم التداول
async function fetchTopPairs() {
    try {
        const markets = await EXCHANGE.loadMarkets();
        const usdtPairs = Object.keys(markets).filter(symbol =>
            symbol.endsWith('/USDT') && markets[symbol].active
        );
        const tickers = await EXCHANGE.fetchTickers(usdtPairs);
        allTickers = tickers;
        const sorted = Object.values(tickers)
            .sort((a, b) => (b.quoteVolume || 0) - (a.quoteVolume || 0))
            .slice(0, MAX_PAIRS_TO_SCAN)
            .map(t => t.symbol);
        return sorted;
    } catch (e) {
        console.error("Error fetching markets:", e.message);
        return [];
    }
}

// تحليل العملة الواحدة
async function analyzePair(symbol) {
    try {
        const candles = await EXCHANGE.fetchOHLCV(symbol, TIMEFRAME, undefined, 50);
        if (!candles || candles.length < 20) return null;
        
        const closes = candles.map(c => c[4]);
        
        // حساب المؤشرات
        const rsiValues = RSI.calculate({ values: closes, period: RSI_PERIOD });
        const smaValues = SMA.calculate({ values: closes, period: SMA_PERIOD });
        
        if (rsiValues.length < 2 || smaValues.length < 1) return null;

        const currentRSI = rsiValues[rsiValues.length - 1];
        const prevRSI = rsiValues[rsiValues.length - 2];
        const currentSMA = smaValues[smaValues.length - 1];
        const currentPrice = closes[closes.length - 1];

        // منطق الاستراتيجية
        if (prevRSI < RSI_OVER_SOLD && currentRSI >= RSI_OVER_SOLD && currentPrice >= currentSMA) {
            return {
                symbol, 
                price: currentPrice, 
                rsi: currentRSI, 
                sma: currentSMA,
                volume: allTickers[symbol]?.quoteVolume || 0,
                chartData: candles.map((c, i) => {
                    const rsiIdx = i - (closes.length - rsiValues.length);
                    const smaIdx = i - (closes.length - smaValues.length);
                    return {
                        time: c[0] / 1000, 
                        open: c[1], 
                        high: c[2], 
                        low: c[3], 
                        close: c[4],
                        rsi: rsiIdx >= 0 ? rsiValues[rsiIdx] : null,
                        sma: smaIdx >= 0 ? smaValues[smaIdx] : null
                    };
                })
            };
        }
    } catch (e) {}
    return null;
}

// تشغيل الفحص
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
            await new Promise(r => setTimeout(r, 100)); // تأخير بسيط لتجنب الحظر
        }
        activeSignals = newSignals;
        console.log(`Scan Complete. Found ${activeSignals.length} signals.`);
    } catch (e) {
        console.error("Scan failed:", e.message);
    } finally { isScanning = false; }
}

runScan();
setInterval(runScan, 60 * 1000); // فحص كل دقيقة

// --- روابط الـ API ---
app.get('/api/signals', (req, res) => {
    res.json({ 
        signals: activeSignals, 
        status: { 
            scanning: isScanning, 
            progress: analyzedPairsCount, 
            total: totalPairsCount 
        } 
    });
});

app.post('/api/settings', (req, res) => {
    if (req.body.email) userEmail = req.body.email;
    res.json({ success: true, email: userEmail });
});

// خدمة ملفات الفرونت إند
app.use(express.static(path.join(rootDir, 'dist')));

// --- حل مشكلة Express 5 النهائية ---
app.get('/:path*', (req, res) => {
    if (req.path.startsWith('/api')) {
        return res.status(404).json({ error: 'Endpoint Not Found' });
    }
    const indexPath = path.join(rootDir, 'dist', 'index.html');
    res.sendFile(indexPath);
});

app.listen(PORT, () => {
    console.log(`Scanner Backend running on PORT ${PORT}`);
});
