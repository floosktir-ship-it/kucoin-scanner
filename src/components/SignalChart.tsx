import { useEffect, useRef } from 'react';
import { createChart, ColorType } from 'lightweight-charts';

interface SignalChartProps {
    data: any[];
    colors: {
        backgroundColor?: string;
        textColor?: string;
    };
}

export const SignalChart = ({ data, colors }: SignalChartProps) => {
    const chartContainerRef = useRef<HTMLDivElement>(null);

    useEffect(() => {
        if (!chartContainerRef.current) return;

        const chart = createChart(chartContainerRef.current, {
            layout: {
                background: { type: ColorType.Solid, color: colors.backgroundColor || '#111111' },
                textColor: colors.textColor || '#d1d4dc',
            },
            width: chartContainerRef.current.clientWidth,
            height: 400, // Increased height for RSI pane
            grid: {
                vertLines: { color: 'rgba(42, 46, 57, 0.5)' },
                horzLines: { color: 'rgba(42, 46, 57, 0.5)' },
            },
            timeScale: {
                borderColor: 'rgba(197, 203, 206, 0.8)',
            },
        });

        // 1. Candlestick Series
        const candlestickSeries = chart.addCandlestickSeries({
            upColor: '#26a69a',
            downColor: '#ef5350',
            borderVisible: false,
            wickUpColor: '#26a69a',
            wickDownColor: '#ef5350',
        });
        candlestickSeries.setData(data);

        // 3. RSI Series (Separate Pane)
        const rsiSeries = chart.addLineSeries({
            color: '#FF9800',
            lineWidth: 2,
            priceScaleId: 'rsi', // Create new scale for RSI
            title: 'RSI 14',
        });

        // Configure RSI Scale
        chart.priceScale('rsi').applyOptions({
            autoScale: false,
            scaleMargins: {
                top: 0.75, // Bottom 25% of the chart
                bottom: 0.05,
            },
        });

        rsiSeries.setData(data.map(d => ({ time: d.time, value: d.rsi })));

        // إضافة خطوط أفقية واضحة للـ RSI
        rsiSeries.createPriceLine({
            price: 20,
            color: '#ef5350',
            lineWidth: 2,
            lineStyle: 0, // Solid
            axisLabelVisible: true,
            title: 'OVERSOLD (20)',
        });

        rsiSeries.createPriceLine({
            price: 70,
            color: '#26a69a',
            lineWidth: 2,
            lineStyle: 0, // Solid
            axisLabelVisible: true,
            title: 'OVERBOUGHT (70)',
        });

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
    }, [data, colors]);

    return <div ref={chartContainerRef} style={{ width: '100%', position: 'relative' }} />;
};
