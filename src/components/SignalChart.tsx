import { useEffect, useRef } from 'react';
import { createChart, ColorType } from 'lightweight-charts';

interface Props { data: any[]; colors: any; signalIdx?: number; rsiLevel?: number; }

export const SignalChart = ({ data, colors, signalIdx, rsiLevel = 20 }: Props) => {
    const chartRef = useRef<HTMLDivElement>(null);

    useEffect(() => {
        if (!chartRef.current || !data || data.length === 0) return;

        const chart = createChart(chartRef.current, {
            layout: { background: { type: ColorType.Solid, color: colors.backgroundColor || '#0a0b10' }, textColor: '#d1d4dc' },
            width: chartRef.current.clientWidth,
            height: chartRef.current.clientHeight || 400,
            grid: { vertLines: { visible: false }, horzLines: { color: 'rgba(42, 46, 57, 0.1)' } }
        });

        // 1. Price Series (75% height)
        const candleSeries = chart.addCandlestickSeries({ upColor: '#26a69a', downColor: '#ef5350' });
        chart.priceScale('right').applyOptions({ scaleMargins: { top: 0.1, bottom: 0.3 } });
        
        // 2. RSI Series (Bottom 25% height)
        const rsiSeries = chart.addLineSeries({ color: '#FF9800', lineWidth: 2, priceScaleId: 'rsi' });
        chart.priceScale('rsi').applyOptions({ scaleMargins: { top: 0.75, bottom: 0.05 }, autoScale: false });

        const valid = data.filter(d => d.time);
        candleSeries.setData(valid);
        rsiSeries.setData(valid.filter(d => d.rsi !== null).map(d => ({ time: d.time, value: d.rsi })));

        // Horizontal Line for RSI Level
        rsiSeries.createPriceLine({ price: rsiLevel, color: '#ef5350', lineWidth: 2, title: `ZONE ${rsiLevel}` });

        // BUY Indicator (Blue Arrow)
        if (signalIdx !== undefined) {
            candleSeries.setMarkers([{
                time: data[signalIdx]?.time || data[data.length-1].time,
                position: 'belowBar', color: '#2196f3', shape: 'arrowUp', text: 'BUY'
            }]);
        }

        chart.timeScale().fitContent();
        
        const resize = () => chartRef.current && chart.applyOptions({ width: chartRef.current.clientWidth });
        window.addEventListener('resize', resize);
        return () => { window.removeEventListener('resize', resize); chart.remove(); };
    }, [data, signalIdx]);

    return <div ref={chartRef} style={{ width: '100%', height: '100%' }} />;
};
