// Charts admin: SVG/CSS puros, zero dependência de lib de gráfico.
// Cores sempre via CSS vars do tema (`rgb(var(--color-*))`); props sempre
// primitivas (number/string) — nunca Decimal/Date (converter na lib).
export { Sparkline, type SparklineProps } from './sparkline'
export { MiniBarChart, type MiniBarChartItem, type MiniBarChartProps } from './mini-bar-chart'
export { DonutChart, type DonutChartItem, type DonutChartProps } from './donut-chart'
export { TrendDelta, type TrendDeltaProps } from './trend-delta'
