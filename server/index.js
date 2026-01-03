import express from 'express';
import cors from 'cors';
import ccxt from 'ccxt';
import { RSI } from 'technicalindicators';
import nodemailer from 'nodemailer';
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

// State & Config
let activeSignals = []; 
let allTickers = {}; 
let isScanning = false;
let status = { progress: 0, total: 0 };

// إعدادات افتراضية قابلة للتعديل من الواجهة
let settings = {
    email: '',
    timeframe: '4h',
    rsiLevel: 20,
    rsiPeriod: 14,
    senderEmail: process.env.SENDER_EMAIL || '', // إيميلك الذي سيرسل
    senderPass: process.env.SENDER_PASS || ''    // كلمة مرور التطبيقات
};

// إعداد نظام الإرسال
const transporter = nodemailer.createTransport({
    service: 'gmail',
    auth: { user: settings.senderEmail, pass: settings.senderPass }
});

async function sendEmailAlert(signal) {
    if (!settings.email || !settings.senderEmail) return;
    const mailOptions = {
        from: settings.senderEmail,
        to: settings.email,
        subject: `🎯 KuCoin Signal: ${signal.symbol}`,
        text: `New Buy Signal found for ${signal.symbol} at price $${signal.price}. RSI(${settings.rsiPeriod}) just crossed above ${settings.rsiLevel} on ${settings.timeframe} timeframe.`
    };
    try { await transporter.sendMail(mailOptions); console.log("Email Sent!"); } catch (e) { console.error("Email Fail:", e.message); }
}

async function analyzePair(symbol) {
    try {
        const candles = await EXCHANGE.fetchOHLCV(symbol, settings.timeframe, undefined, settings.rsiPeriod + 10);
        if (!candles || candles.length < settings.rsiPeriod + 2) return null;
        const closes = candles.map(c => c[4]);
        const rsiValues = RSI.calculate({ values: closes, period: settings.rsiPeriod });
        if (rsiValues.length < 3) return null;

        const lastRSI = rsiValues[rsiValues.length - 2];
        const prevRSI = rsiValues[rsiValues.length - 3];

        if (prevRSI < settings.rsiLevel && lastRSI >= settings.rsiLevel) {
            const signal = {
                symbol, price: closes[closes.length - 1], rsi: lastRSI,
                volume: allTickers[symbol]?.quoteVolume || 0,
                signalIdx: candles.length - 2,
                chartData: candles.map((c, i) => {
                    const rIdx = i - (closes.length - rsiValues.length);
                    return { time: c[0] / 1000, open: c[1], high: c[2], low: c[3], close: c[4], rsi: rIdx >= 0 ? rsiValues[rIdx] : null };
                })
            };
            sendEmailAlert(signal); // إرسال تنبيه فور الاكتشاف
            return signal;
        }
    } catch (e) {}
    return null;
}

async function runScan() {
    if (isScanning) return;
    isScanning = true;
    try {
        const markets = await EXCHANGE.loadMarkets();
        const usdtPairs = Object.keys(markets).filter(s => s.endsWith('/USDT') && markets[s].active);
        const tickers = await EXCHANGE.fetchTickers(usdtPairs);
        allTickers = tickers;
        const pairs = Object.values(tickers).sort((a,b) => b.quoteVolume - a.quoteVolume).slice(0,1000).map(t => t.symbol);
        
        status.total = pairs.length;
        status.progress = 0;
        const newSignals = [];

        // تسريع الفحص: فحص مجموعات (10 عملات في وقت واحد)
        const chunkSize = 10;
        for (let i = 0; i < pairs.length; i += chunkSize) {
            const chunk = pairs.slice(i, i + chunkSize);
            const results = await Promise.all(chunk.map(symbol => analyzePair(symbol)));
            results.forEach(res => { if(res) newSignals.push(res); });
            status.progress += chunk.length;
            await new Promise(r => setTimeout(r, 200)); 
        }
        activeSignals = newSignals;
    } catch (e) { console.error("Scan Error:", e); } finally { isScanning = false; }
}

runScan();
setInterval(runScan, 60 * 1000);

app.get('/api/signals', (req, res) => res.json({ signals: activeSignals, status: { ...status, scanning: isScanning } }));

app.post('/api/settings', (req, res) => {
    const { email, timeframe, rsiLevel, rsiPeriod } = req.body;
    let needsRescan = false;
    if (email !== undefined) settings.email = email;
    if (timeframe && timeframe !== settings.timeframe) { settings.timeframe = timeframe; needsRescan = true; }
    if (rsiLevel !== undefined) { settings.rsiLevel = Number(rsiLevel); needsRescan = true; }
    if (rsiPeriod !== undefined) { settings.rsiPeriod = Number(rsiPeriod); needsRescan = true; }
    
    res.json({ success: true, settings });
    if (needsRescan && !isScanning) { activeSignals = []; runScan(); }
});

app.use(express.static(path.join(rootDir, 'dist')));
app.get('/:path*', (req, res) => res.sendFile(path.join(rootDir, 'dist', 'index.html')));

app.listen(PORT, () => console.log(`Pro Scanner Running on ${PORT}`));
