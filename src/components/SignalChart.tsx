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
                background: { type: ColorType.Solid, color: colors.backgroundColor || '#1e1e1e' },
                textColor: colors.textColor || '#ffffff',
            },
            width: chartContainerRef.current.clientWidth,
            height: 300,
            grid: {
                vertLines: { visible: false },
                horzLines: { visible: false },
            },
        });

        const candlestickSeries = (chart as any).addCandlestickSeries({
            upColor: '#26a69a',
            downColor: '#ef5350',
            borderVisible: false,
            wickUpColor: '#26a69a',
            wickDownColor: '#ef5350',
        });

        candlestickSeries.setData(data);

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
