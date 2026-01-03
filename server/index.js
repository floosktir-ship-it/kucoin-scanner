import express from 'express';
import cors from 'cors';
import ccxt from 'ccxt';
import { RSI, SMA } from 'technicalindicators';
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

// State
let activeSignals = []; // List of coins matching criteria
let allTickers = {}; // Store tickers to get volume fast
let analyzedPairsCount = 0;
let totalPairsCount = 0;
let userEmail = ''; // Store in memory for now (or file/db in real prod)
let isScanning = false;

// Configuration
const TIMEFRAME = '4h'; // Strategy Timeframe
const RSI_PERIOD = 14;
const SMA_PERIOD = 9;
const RSI_OVER_SOLD = 20; // Strategy: Cross above 20
const MAX_PAIRS_TO_SCAN = 3000; // Scan top 3000 volume coins

// --- Email Service ---
const transporter = nodemailer.createTransport({
    service: 'gmail',
    auth: {
        user: 'your-email@gmail.com', // Placeholder, user will provide? 
        // Note: Realworld requires App Password. For now we log if not set.
        pass: 'your-app-password'
    }
});

// We'll update transporter on the fly if we want real sending, 
// for now let's just simulate or log if credentials aren't truly set.
async function sendAlert(coin, price, rsi, sma) {
    if (!userEmail) {
        console.log(`[ALERT] Signal found for ${coin} at ${price} (RSI: ${rsi}), but no email set.`);
        return;
    }

    console.log(`[EMAIL] Sending alert to ${userEmail} for ${coin}...`);
    // In a real app, we would configure the transporter with real user credentials or a server email.
    // For this prototype, we'll assume the user might not have an SMTP server ready.
    // We will Log it prominently.
}

// --- Analysis Engine ---

async function fetchTopPairs() {
    try {
        const markets = await EXCHANGE.loadMarkets();
        const usdtPairs = Object.keys(markets).filter(symbol =>
            symbol.endsWith('/USDT') && markets[symbol].active
        );

        // Sort by Quote Volume (24h)
        // CCXT tickers fetch might be heavy for all, let's get tickers for USDT pairs
        // Kucoin allows fetching all tickers.
        const tickers = await EXCHANGE.fetchTickers(usdtPairs);
        allTickers = tickers; // Save for volume access

        const sorted = Object.values(tickers)
            .sort((a, b) => (b.quoteVolume || 0) - (a.quoteVolume || 0))
            .slice(0, MAX_PAIRS_TO_SCAN)
            .map(t => t.symbol);

        return sorted;
    } catch (e) {
        console.error("Error fetching markets:", e);
        return [];
    }
}

async function analyzePair(symbol) {
    try {
        // Fetch OHLCV
        // We need enough data for RSI 14 + SMA 9. 
        // 50 candles should be safe.
        const candles = await EXCHANGE.fetchOHLCV(symbol, TIMEFRAME, undefined, 50);

        if (!candles || candles.length < 20) return null;

        const closes = candles.map(c => c[4]);

        // Calculate RSI
        const rsiInput = { values: closes, period: RSI_PERIOD };
        const rsiValues = RSI.calculate(rsiInput);

        // Calculate SMA
        const smaInput = { values: closes, period: SMA_PERIOD };
        const smaValues = SMA.calculate(smaInput);

        if (rsiValues.length < 2 || smaValues.length < 1) return null;

        const currentRSI = rsiValues[rsiValues.length - 1];
        const prevRSI = rsiValues[rsiValues.length - 2];
        const currentSMA = smaValues[smaValues.length - 1];
        const currentPrice = closes[closes.length - 1];

        // --- STRATEGY LOGIC ---
        // 1. RSI crosses ABOVE 20 (Previous < 20 AND Current >= 20)
        // 2. Price is ABOVE or EQUAL to SMA 9

        const rsiCrossedUp = prevRSI < RSI_OVER_SOLD && currentRSI >= RSI_OVER_SOLD;
        const priceAboveSMA = currentPrice >= currentSMA;

        if (rsiCrossedUp && priceAboveSMA) {
            return {
                symbol,
                price: currentPrice,
                rsi: currentRSI,
                sma: currentSMA,
                volume: allTickers[symbol]?.quoteVolume || 0,
                rsiValues: rsiValues,
                smaValues: smaValues,
                chartData: candles.map((c, i) => {
                    // Align RSI and SMA with candles. 
                    // RSI(14) starts at index 14, SMA(9) starts at index 9.
                    // We need to find the correct index in the rsi/sma arrays.
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
    } catch (e) {
        // console.warn(`Failed to analyze ${symbol}:`, e.message);
    }
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

        // Process in chunks to avoid Rate Limits
        for (const symbol of pairs) {
            const signal = await analyzePair(symbol);
            if (signal) {
                newSignals.push(signal);
                // Trigger Alert (Mock)
                sendAlert(signal.symbol, signal.price, signal.rsi, signal.sma);
            }
            analyzedPairsCount++;
            // Small delay
            await new Promise(r => setTimeout(r, 100));
        }

        activeSignals = newSignals;
        console.log(`Scan Complete. Found ${activeSignals.length} signals.`);
    } catch (e) {
        console.error("Scan failed:", e);
    } finally {
        isScanning = false;
    }
}

// Run scan immediately on start, then every 60 seconds
runScan();
setInterval(runScan, 60 * 1000);

// --- API ---

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
    const { email } = req.body;
    if (email) {
        userEmail = email;
        console.log("User Email updated to:", userEmail);
    }
    res.json({ success: true, email: userEmail });
});

// Serve static files from the React app build
app.use(express.static(path.join(rootDir, 'dist')));

// The "catchall" handler: for any request that doesn't
// match one above, send back React's index.html file.
// حل مشكلة Express 5 النهائياً: استخدام اسم للمتغير
app.get('/:path*', (req, res) => {
    // Skip if it's an API call that somehow reached here
    if (req.path.startsWith('/api')) {
        return res.status(404).json({ error: 'Not Found' });
    }
    const indexPath = path.join(rootDir, 'dist', 'index.html');
    res.sendFile(indexPath);
});

app.listen(PORT, () => {
    console.log(`Scanner Backend running on PORT ${PORT}`);
});
