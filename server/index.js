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
let activeSignals = new Map();
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
const SIGNAL_EXPIRY_MS = 2 * 60 * 60 * 1000; // بقاء التنبيه لمدة ساعتين

async function fetchTopPairs() {
    try {
        console.log("--- جاري جلب بيانات السوق من KuCoin ---");
        const markets = await EXCHANGE.loadMarkets();
        
        // جلب جميع الأزواج بطلقة واحدة لضمان السرعة (Fetch all tickers)
        const tickers = await EXCHANGE.fetchTickers(); 
        allTickers = tickers;
        
        const sorted = Object.values(tickers)
            .filter(t => t.symbol && t.symbol.endsWith('/USDT') && markets[t.symbol]?.active)
            .sort((a, b) => (b.quoteVolume || 0) - (a.quoteVolume || 0))
            .slice(0, MAX_PAIRS_TO_SCAN)
            .map(t => t.symbol);

        console.log(`>>> تم تحميل ${sorted.length} عملة بنجاح.`);
        return sorted;
    } catch (e) { 
        console.error("!!! خطأ في جلب البيانات:", e.message);
        return []; 
    }
}

async function analyzePair(symbol) {
    try {
        const candles = await EXCHANGE.fetchOHLCV(symbol, currentTimeframe, undefined, 60);
        if (!candles || candles.length < 30) return null;
        const closes = candles.map(c => c[4]);
        const rsiValues = RSI.calculate({ values: closes, period: RSI_PERIOD });
        if (rsiValues.length < 3) return null;

        const confirmedRSI = rsiValues[rsiValues.length - 2]; 
        const prevConfirmedRSI = rsiValues[rsiValues.length - 3];
        const confirmedPrice = closes[closes.length - 2];

        // استراتيجية الاختراق المؤكد
        if (prevConfirmedRSI < RSI_OVER_SOLD && confirmedRSI >= RSI_OVER_SOLD) {
            return {
                symbol, price: confirmedPrice, rsi: confirmedRSI,
                volume: allTickers[symbol]?.quoteVolume || 0,
                signalIdx: candles.length - 2,
                timestamp: Date.now(),
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
    console.log("--- بدء عملية الفحص الآن ---");
    try {
        const pairs = await fetchTopPairs();
        totalPairsCount = pairs.length;
        analyzedPairsCount = 0;
        
        if (totalPairsCount === 0) {
            console.log("جاري انتظار البيانات من المنصة... (0/0)");
            return;
        }

        // فحص متوازي لضمان السرعة المطلقة
        for (let i = 0; i < pairs.length; i += 10) {
            const chunk = pairs.slice(i, i + 10);
            const batchResults = await Promise.all(chunk.map(s => analyzePair(s)));
            
            batchResults.forEach(sig => {
                if (sig) {
                    activeSignals.set(sig.symbol, sig);
                    console.log(`[إشارة جديدة] ${sig.symbol}`);
                }
            });
            
            analyzedPairsCount += chunk.length;
            if (analyzedPairsCount % 100 === 0 || analyzedPairsCount === totalPairsCount) {
                console.log(`التقدم: ${analyzedPairsCount} / ${totalPairsCount}`);
            }
            await new Promise(r => setTimeout(r, 100)); 
        }

        // تنظيف العملات القديمة التي تجاوزت ساعتين
        const now = Date.now();
        for (const [symbol, sig] of activeSignals.entries()) {
            if (now - sig.timestamp > SIGNAL_EXPIRY_MS) {
                activeSignals.delete(symbol);
            }
        }
        console.log(`--- تم الانتهاء من الفحص (يوجد حالياً ${activeSignals.size} إشارة) ---`);
        
    } catch (e) {
        console.error("!!! خطأ أثناء الفحص:", e.message);
    } finally { isScanning = false; }
}

setInterval(runScan, 60 * 1000);
runScan();

app.get('/api/signals', (req, res) => {
    const signalsArray = Array.from(activeSignals.values()).sort((a,b) => b.timestamp - a.timestamp);
    res.json({ signals: signalsArray, status: { scanning: isScanning, progress: analyzedPairsCount, total: totalPairsCount } });
});

app.post('/api/settings', (req, res) => {
    const { timeframe, email } = req.body;
    if (email) userEmail = email;
    if (timeframe && timeframe !== currentTimeframe) {
        currentTimeframe = timeframe;
        activeSignals.clear();
        if (!isScanning) runScan();
    }
    res.json({ success: true });
});

app.use(express.static(path.join(rootDir, 'dist')));

// حل مشكلة المسار النهائي للتطبيق
app.get('*', (req, res) => {
    if (req.path.startsWith('/api')) return res.status(404).end();
    res.sendFile(path.join(rootDir, 'dist', 'index.html'));
});

app.listen(PORT, () => {
    console.log(`********************************************`);
    console.log(`*  الخادم يعمل بنجاح على المنفذ ${PORT}           *`);
    console.log(`********************************************`);
});
