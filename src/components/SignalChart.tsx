import { useEffect, useRef } from 'react';
import { createChart, ColorType } from 'lightweight-charts';

interface SignalChartProps { data: any[]; signalIdx?: number; rsiLevel?: number; colors: any; }

export const SignalChart = ({ data, signalIdx, rsiLevel = 20, colors }: SignalChartProps) => {
    const chartRef = useRef<HTMLDivElement>(null);

    useEffect(() => {
        if (!chartRef.current) return;
        const width = chartRef.current.clientWidth;
        const chart = createChart(chartRef.current, {
            layout: { 
                background: { type: ColorType.Solid, color: colors.backgroundColor || '#0a0b10' }, 
                textColor: '#d1d4dc',
            },
            width: width, 
            height: 450, 
            grid: { 
                vertLines: { visible: false }, 
                horzLines: { color: 'rgba(42, 46, 57, 0.2)' } 
            },
            timeScale: {
                borderColor: 'rgba(197, 203, 206, 0.4)',
                timeVisible: true,
            },
        });

        // 1. Candlestick Series (الأعلى - 60%)
        const candles = chart.addCandlestickSeries({ 
            upColor: '#26a69a', downColor: '#ef5350',
            priceScaleId: 'right' 
        });
        chart.priceScale('right').applyOptions({
            scaleMargins: { top: 0.05, bottom: 0.4 },
        });
        candles.setData(data);

        // 2. Volume Series (أعمدة الفوليوم)
        const volumeSeries = chart.addHistogramSeries({
            color: '#26a69a',
            priceFormat: { type: 'volume' },
            priceScaleId: 'volume',
        });
        chart.priceScale('volume').applyOptions({
            scaleMargins: { top: 0.7, bottom: 0.31 },
        });
        volumeSeries.setData(data.map(d => ({
            time: d.time,
            value: d.volume,
            color: d.close >= d.open ? 'rgba(38, 166, 154, 0.3)' : 'rgba(239, 83, 80, 0.3)'
        })));

        // 3. RSI Series (الأسفل - 25%)
        const rsiSeries = chart.addLineSeries({ 
            color: '#FF9800', 
            lineWidth: 2, 
            priceScaleId: 'rsi', 
            title: `RSI` 
        });
        chart.priceScale('rsi').applyOptions({ 
            autoScale: false, 
            scaleMargins: { top: 0.75, bottom: 0.05 },
        });
        rsiSeries.setData(data.map(d => ({ time: d.time, value: d.rsi })));

        if (signalIdx !== undefined && data[signalIdx]) {
            candles.setMarkers([{ 
                time: data[signalIdx].time, 
                position: 'belowBar', 
                color: '#26a69a', 
                shape: 'arrowUp', 
                text: 'BUY SIGNAL',
                size: 2
            }]);
        }

        rsiSeries.createPriceLine({ 
            price: rsiLevel, 
            color: '#ef5350', 
            lineWidth: 2, 
            lineStyle: 0,
            axisLabelVisible: true, 
            title: `BUY ZONE (${rsiLevel})` 
        });
        rsiSeries.createPriceLine({ price: 70, color: 'rgba(38, 166, 154, 0.5)', lineWidth: 1, axisLabelVisible: true, title: '70' });

        chart.timeScale().fitContent();
        
        const resizer = () => { if(chartRef.current) chart.applyOptions({ width: chartRef.current.clientWidth }); };
        window.addEventListener('resize', resizer);
        return () => { window.removeEventListener('resize', resizer); chart.remove(); };
    }, [data, signalIdx, rsiLevel, colors]);

    return <div ref={chartRef} style={{ width: '100%', height: '100%' }} />;
};
