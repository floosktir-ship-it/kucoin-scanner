import { useEffect, useRef } from 'react';
import { createChart, ColorType } from 'lightweight-charts';

interface SignalChartProps {
    data: any[];
    signalIdx?: number;
    colors: { backgroundColor?: string; textColor?: string; };
}

export const SignalChart = ({ data, signalIdx, colors }: SignalChartProps) => {
    const chartContainerRef = useRef<HTMLDivElement>(null);

    useEffect(() => {
        if (!chartContainerRef.current) return;

        const chart = createChart(chartContainerRef.current, {
            layout: {
                background: { type: ColorType.Solid, color: colors.backgroundColor || '#111111' },
                textColor: colors.textColor || '#d1d4dc',
            },
            width: chartContainerRef.current.clientWidth,
            height: 400,
            grid: {
                vertLines: { color: 'rgba(42, 46, 57, 0.3)' },
                horzLines: { color: 'rgba(42, 46, 57, 0.3)' },
            },
        });

        const candlestickSeries = chart.addCandlestickSeries({
            upColor: '#26a69a', downColor: '#ef5350',
            wickUpColor: '#26a69a', wickDownColor: '#ef5350',
        });
        candlestickSeries.setData(data);

        // إضافة سهم الشراء إذا وجد index الإشارة
        if (signalIdx !== undefined && data[signalIdx]) {
            candlestickSeries.setMarkers([
                {
                    time: data[signalIdx].time,
                    position: 'belowBar',
                    color: '#26a69a',
                    shape: 'arrowUp',
                    text: 'BUY',
                },
            ]);
        }

        const rsiSeries = chart.addLineSeries({
            color: '#FF9800',
            lineWidth: 2,
            priceScaleId: 'rsi',
            title: 'RSI 14',
        });

        chart.priceScale('rsi').applyOptions({
            autoScale: false,
            scaleMargins: { top: 0.75, bottom: 0.05 },
        });

        rsiSeries.setData(data.map(d => ({ time: d.time, value: d.rsi })));

        // خطوط RSI الأفقية
        rsiSeries.createPriceLine({ price: 20, color: '#ef5350', lineWidth: 2, axisLabelVisible: true, title: '20' });
        rsiSeries.createPriceLine({ price: 70, color: '#26a69a', lineWidth: 1, axisLabelVisible: true, title: '70' });

        chart.timeScale().fitContent();

        const handleResize = () => {
            if (chartContainerRef.current) {
                chart.applyOptions({ width: chartContainerRef.current.clientWidth });
            }
        };
        window.addEventListener('resize', handleResize);
        return () => {
            window.removeEventListener('resize', handleResize);
            chart.remove();
        };
    }, [data, signalIdx, colors]);

    return <div ref={chartContainerRef} style={{ width: '100%', position: 'relative' }} />;
};
