import express from 'express';
import cors from 'cors';
import ccxt from 'ccxt';
import { RSI } from 'technicalindicators';
import dotenv from 'dotenv';
import { fileURLToPath } from 'url';
import { dirname } from 'path';
import path from 'path';
import nodemailer from 'nodemailer';

dotenv.config();
const app = express();
app.use(cors());
app.use(express.json());

const PORT = process.env.PORT || 3001;
const __filename = fileURLToPath(import.meta.url);
const __dirname = dirname(__filename);
const rootDir = dirname(__dirname);

const EXCHANGE = new ccxt.kucoin();

// --- CONFIGURATION & STATE ---
let currentTimeframe = '4h';
const RSI_PERIOD = 14;
const RSI_OVER_SOLD = 20;
const MAX_PAIRS_TO_SCAN = 1000;
const SIGNAL_EXPIRY_MS = 2 * 60 * 60 * 1000; // 2 Hours

let activeSignals = new Map();
let allTickers = {};
let analyzedPairsCount = 0;
let totalPairsCount = 0;
let subscribers = new Set();
let isScanning = false;

// --- EMAIL ENGINE ---
const transporter = nodemailer.createTransport({
    service: 'gmail',
    auth: {
        user: process.env.EMAIL_USER,
        pass: process.env.EMAIL_PASS
    }
});

/**
 * Broadcasts alerts to all subscribers efficiently using BCC
 */
async function broadcastSignal(signal) {
    if (subscribers.size === 0 || !process.env.EMAIL_USER) return;

    const emailList = Array.from(subscribers);
    const dashboardUrl = `https://${process.env.RENDER_EXTERNAL_HOSTNAME || 'localhost:3000'}`;

    const mailOptions = {
        from: `"KuCoin Sniper Pro" <${process.env.EMAIL_USER}>`,
        bcc: emailList, // Use BCC for privacy and efficiency
        subject: `🚀 [NEW SIGNAL] ${signal.symbol} @ $${signal.price}`,
        html: `
            <div style="font-family: sans-serif; padding: 20px; border: 1px solid #eee; border-radius: 10px;">
                <h2 style="color: #2ecc71;">🎯 New Breakout Detected</h2>
                <p>A new RSI oversold breakout has been confirmed on <b>KuCoin</b>.</p>
                <table style="width: 100%; border-collapse: collapse;">
                    <tr><td style="padding: 8px; border-bottom: 1px solid #eee;"><b>Pair:</b></td><td style="padding: 8px; border-bottom: 1px solid #eee;">${signal.symbol}</td></tr>
                    <tr><td style="padding: 8px; border-bottom: 1px solid #eee;"><b>Price:</b></td><td style="padding: 8px; border-bottom: 1px solid #eee;">$${signal.price}</td></tr>
                    <tr><td style="padding: 8px; border-bottom: 1px solid #eee;"><b>RSI:</b></td><td style="padding: 8px; border-bottom: 1px solid #eee;">${signal.rsi.toFixed(2)}</td></tr>
                    <tr><td style="padding: 8px; border-bottom: 1px solid #eee;"><b>Volume (24h):</b></td><td style="padding: 8px; border-bottom: 1px solid #eee;">$${(signal.volume / 1e6).toFixed(2)}M</td></tr>
                </table>
                <br>
                <a href="${dashboardUrl}" style="background: #2ecc71; color: white; padding: 10px 20px; text-decoration: none; border-radius: 5px; display: inline-block;">View Live Chart</a>
                <p style="font-size: 12px; color: #777; margin-top: 20px;">This is an automated alert from your KuCoin Scanner. To unsubscribe, please clear your site data.</p>
            </div>
        `
    };

    try {
        await transporter.sendMail(mailOptions);
        console.log(`[BROADCAST SUCCESS] Sent to ${emailList.length} users for ${signal.symbol}`);
    } catch (error) {
        console.error(`[BROADCAST FAILED] ${error.message}`);
    }
}

// --- CORE SCANNER LOGIC ---

async function fetchTopPairs() {
    try {
        const markets = await EXCHANGE.loadMarkets();
        const tickers = await EXCHANGE.fetchTickers();
        allTickers = tickers;

        return Object.values(tickers)
            .filter(t => t.symbol && t.symbol.endsWith('/USDT') && markets[t.symbol]?.active)
            .sort((a, b) => (b.quoteVolume || 0) - (a.quoteVolume || 0))
            .slice(0, MAX_PAIRS_TO_SCAN)
            .map(t => t.symbol);
    } catch (e) {
        console.error("!!! Market Fetch Error:", e.message);
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

        // Strategy: RSI crossing UP from below 20
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
    } catch (e) { /* Silent fail for individual pair fetch */ }
    return null;
}

async function runScan() {
    if (isScanning) return;
    isScanning = true;
    console.log(`\n[${new Date().toLocaleTimeString()}] --- SCAN STARTING ---`);

    try {
        const pairs = await fetchTopPairs();
        totalPairsCount = pairs.length;
        analyzedPairsCount = 0;

        if (totalPairsCount === 0) {
            console.log("No symbols to scan. Market API might be throttled.");
            return;
        }

        // Processing in batches of 10 to respect API rate limits
        for (let i = 0; i < pairs.length; i += 10) {
            const chunk = pairs.slice(i, i + 10);
            const batchResults = await Promise.all(chunk.map(s => analyzePair(s)));

            batchResults.forEach(sig => {
                if (sig) {
                    const exists = activeSignals.has(sig.symbol);
                    activeSignals.set(sig.symbol, sig);

                    if (!exists) {
                        console.log(`🔥 NEW SIGNAL FOUND: ${sig.symbol}`);
                        broadcastSignal(sig);
                    }
                }
            });

            analyzedPairsCount += chunk.length;
            if (analyzedPairsCount % 100 === 0) {
                process.stdout.write(`.`); // Progress indicator
            }
            await new Promise(r => setTimeout(r, 200)); // Rate limit breather
        }

        // Cleanup expired signals
        const now = Date.now();
        for (const [symbol, sig] of activeSignals.entries()) {
            if (now - sig.timestamp > SIGNAL_EXPIRY_MS) {
                activeSignals.delete(symbol);
            }
        }

        console.log(`\n[${new Date().toLocaleTimeString()}] --- SCAN COMPLETE (Active: ${activeSignals.size}) ---`);
    } catch (e) {
        console.error("!!! Critical Scan Error:", e.message);
    } finally {
        isScanning = false;
    }
}

// --- API ROUTES ---

app.get('/api/signals', (req, res) => {
    const signalsArray = Array.from(activeSignals.values())
        .sort((a, b) => b.timestamp - a.timestamp);
    res.json({
        signals: signalsArray,
        status: {
            scanning: isScanning,
            progress: analyzedPairsCount,
            total: totalPairsCount,
            subscribers: subscribers.size
        }
    });
});

app.post('/api/settings', (req, res) => {
    const { timeframe, email } = req.body;

    // Robust email validation
    if (email && /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email)) {
        const cleanEmail = email.trim().toLowerCase();
        if (!subscribers.has(cleanEmail)) {
            subscribers.add(cleanEmail);
            console.log(`[USER ADDED] ${cleanEmail} (Total: ${subscribers.size})`);
        }
    }

    if (timeframe && timeframe !== currentTimeframe) {
        const allowed = ['15m', '1h', '4h', '1d'];
        if (allowed.includes(timeframe)) {
            console.log(`Timeframe switching: ${currentTimeframe} -> ${timeframe}`);
            currentTimeframe = timeframe;
            activeSignals.clear();
            if (!isScanning) runScan();
        }
    }
    res.json({ success: true });
});

// Serve frontend
app.use(express.static(path.join(rootDir, 'dist')));
app.get('*', (req, res) => {
    if (req.path.startsWith('/api')) return res.status(404).end();
    res.sendFile(path.join(rootDir, 'dist', 'index.html'));
});

// Initialize
setInterval(runScan, 60 * 1000); // Pulse every minute
runScan();

const server = app.listen(PORT, () => {
    console.log(`\n🚀 SCANNER SERVER ONLINE - PORT ${PORT}`);
    console.log(`--------------------------------------------`);
});

// Graceful Shutdown
process.on('SIGTERM', () => {
    console.log('SIGTERM received. Shutting down gracefully...');
    server.close(() => process.exit(0));
});
