import { useEffect, useRef } from 'react';
import { createChart, ColorType } from 'lightweight-charts';

interface SignalChartProps { data: any[]; signalIdx?: number; rsiLevel?: number; colors: any; }

export const SignalChart = ({ data, signalIdx, rsiLevel = 20, colors }: SignalChartProps) => {
    const chartRef = useRef<HTMLDivElement>(null);

    useEffect(() => {
        if (!chartRef.current) return;
        const width = chartRef.current.clientWidth;
        const chart = createChart(chartRef.current, {
            layout: { background: { type: ColorType.Solid, color: colors.backgroundColor || '#0a0b10' }, textColor: '#d1d4dc' },
            width: width, height: 400,
            grid: { vertLines: { visible: false }, horzLines: { color: 'rgba(42, 46, 57, 0.3)' } },
        });

        const candles = chart.addCandlestickSeries({ upColor: '#26a69a', downColor: '#ef5350' });
        candles.setData(data);

        if (signalIdx !== undefined && data[signalIdx]) {
            candles.setMarkers([{ time: data[signalIdx].time, position: 'belowBar', color: '#26a69a', shape: 'arrowUp', text: 'BUY' }]);
        }

        const rsiSeries = chart.addLineSeries({ color: '#FF9800', lineWidth: 2, priceScaleId: 'rsi', title: `RSI` });
        chart.priceScale('rsi').applyOptions({ autoScale: false, scaleMargins: { top: 0.75, bottom: 0.05 } });
        rsiSeries.setData(data.map(d => ({ time: d.time, value: d.rsi })));

        rsiSeries.createPriceLine({ price: rsiLevel, color: '#ef5350', lineWidth: 2, axisLabelVisible: true, title: `L:${rsiLevel}` });
        rsiSeries.createPriceLine({ price: 70, color: 'rgba(38, 166, 154, 0.5)', lineWidth: 1, axisLabelVisible: true, title: '70' });

        chart.timeScale().fitContent();
        
        const resizer = () => { if(chartRef.current) chart.applyOptions({ width: chartRef.current.clientWidth }); };
        window.addEventListener('resize', resizer);
        return () => { window.removeEventListener('resize', resizer); chart.remove(); };
    }, [data, signalIdx, rsiLevel, colors]);

    return <div ref={chartRef} style={{ width: '100%', height: '100%' }} />;
};
