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

let activeSignals = []; 
let allTickers = {}; 
let isScanning = false;
let scanProgress = { progress: 0, total: 0, scanning: false };

let settings = {
    email: '',
    timeframe: '4h',
    rsiLevel: 20,
    rsiPeriod: 14,
    senderEmail: process.env.SENDER_EMAIL || '', 
    senderPass: process.env.SENDER_PASS || ''
};

const transporter = nodemailer.createTransport({
    service: 'gmail',
    auth: { user: settings.senderEmail, pass: settings.senderPass }
});

async function analyzePair(symbol) {
    try {
        const candles = await EXCHANGE.fetchOHLCV(symbol, settings.timeframe, undefined, settings.rsiPeriod + 10);
        if (!candles || candles.length < settings.rsiPeriod + 5) return null;
        
        const closes = candles.map(c => c[4]);
        const rsiValues = RSI.calculate({ values: closes, period: settings.rsiPeriod });
        if (rsiValues.length < 3) return null;

        const lastRSI = rsiValues[rsiValues.length - 2];
        const prevRSI = rsiValues[rsiValues.length - 3];

        if (prevRSI < settings.rsiLevel && lastRSI >= settings.rsiLevel) {
            return {
                symbol, price: closes[closes.length - 1], rsi: lastRSI,
                volume: allTickers[symbol]?.quoteVolume || 0,
                signalIdx: candles.length - 2,
                chartData: candles.map((c, i) => {
                    const rIdx = i - (closes.length - rsiValues.length);
                    return { 
                        time: c[0] / 1000, 
                        open: c[1], high: c[2], low: c[3], close: c[4], 
                        volume: c[5], // الفوليوم
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
    scanProgress.scanning = true;
    try {
        const tickers = await EXCHANGE.fetchTickers();
        const pairs = Object.keys(tickers)
            .filter(s => s.endsWith('/USDT'))
            .sort((a,b) => (tickers[b].quoteVolume || 0) - (tickers[a].quoteVolume || 0))
            .slice(0, 1000);
        
        allTickers = tickers;
        scanProgress.total = pairs.length;
        scanProgress.progress = 0;
        const newSignals = [];

        const chunkSize = 10;
        for (let i = 0; i < pairs.length; i += chunkSize) {
            const chunk = pairs.slice(i, i + chunkSize);
            const results = await Promise.all(chunk.map(s => analyzePair(s)));
            results.forEach(res => { if(res) newSignals.push(res); });
            scanProgress.progress += chunk.length;
            await new Promise(r => setTimeout(r, 150)); 
        }
        activeSignals = newSignals;
    } catch (e) { console.error("Scan Error"); } finally { isScanning = false; scanProgress.scanning = false; }
}

runScan();
setInterval(runScan, 60 * 1000);

app.get('/api/signals', (req, res) => res.json({ signals: activeSignals, status: scanProgress }));

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
app.get('*', (req, res) => {
    if (req.path.startsWith('/api')) return res.status(404).json({error:'API Not Found'});
    res.sendFile(path.join(rootDir, 'dist', 'index.html'));
});

app.listen(PORT, () => console.log(`Backend Running on ${PORT}`));
