import fs from 'fs/promises';
import path from 'path';
import puppeteer from 'puppeteer';
import { StockDaily } from './types.js';

/**
 * 生成指定日期区间的K线图数据（二维数组，适合ECharts等前端库）。
 * @param stockData 股票历史数据数组
 * @param startDate 起始日期（YYYY-MM-DD）
 * @param endDate 结束日期（YYYY-MM-DD）
 * @returns K线图数据数组，格式为 [[date, open, close, low, high, volume], ...]
 */
export function generateKLineData(
    stockData: StockDaily[],
    startDate: string,
    endDate: string
): Array<[string, number, number, number, number, number]> {
    // 过滤指定区间
    const filtered = stockData.filter(d => d.date >= startDate && d.date <= endDate);
    // 按日期升序
    filtered.sort((a, b) => a.date.localeCompare(b.date));
    // 组装K线数据
    return filtered.map(d => [
        d.date,
        d.open,
        d.close,
        d.low,
        d.high,
        d.volume
    ]);
}

/**
 * 利用ECharts和Puppeteer生成K线图图片文件
 * @param stockCode 股票代码
 * @param startDate 起始日期
 * @param endDate 结束日期
 * @param outFile 输出图片文件路径
 * @param dataDir 股票数据目录（默认为 data/json_data）
 */
export async function saveKLineChartByCode(
    stockCode: string,
    startDate: string,
    endDate: string,
    outFile: string,
    dataDir = 'data/json_data'
) {
    // 读取股票数据
    const filePath = path.join(dataDir, `${stockCode}.json`);
    let stockData: StockDaily[];
    try {
        const content = await fs.readFile(filePath, 'utf-8');
        stockData = JSON.parse(content);
    } catch (e) {
        throw new Error(`无法读取股票数据文件: ${filePath}`);
    }
    await saveKLineChart(stockData, startDate, endDate, outFile);
}

/**
 * 利用ECharts和Puppeteer生成K线图图片文件（直接传入数据）
 */
export async function saveKLineChart(
    stockData: StockDaily[],
    startDate: string,
    endDate: string,
    outFile: string
) {
    const klineData = generateKLineData(stockData, startDate, endDate);
    const dates = klineData.map(item => item[0]);
    const values = klineData.map(item => item.slice(1, 6)); // [open, close, low, high, volume]

    const html = `
<!DOCTYPE html>
<html>
<head>
    <meta charset="UTF-8">
    <title>K线图</title>
    <script src="https://cdn.jsdelivr.net/npm/echarts@5/dist/echarts.min.js"></script>
    <style>
        html, body, #main { width: 100%; height: 100%; margin: 0; padding: 0; background: #fff; }
        #main { width: 1200px; height: 600px; }
    </style>
</head>
<body>
    <div id="main"></div>
</body>
</html>
`;

    await fs.mkdir(path.dirname(outFile), { recursive: true });

    const browser = await puppeteer.launch({
        defaultViewport: { width: 1200, height: 600 },
        args: ['--no-sandbox', '--disable-setuid-sandbox']
    });
    const page = await browser.newPage();

    await page.setContent(html, { waitUntil: 'load' });

    // 使用 addScriptTag 注入本地 echarts
    const echartsJs = await fs.readFile(
        path.resolve('node_modules/echarts/dist/echarts.min.js'),
        'utf-8'
    );
    await page.addScriptTag({
        content: echartsJs
    });
    //await page.addScriptTag({ path: path.resolve('node_modules/echarts/dist/echarts.min.js') });

    // 在页面上下文中渲染 K 线图
    await page.evaluate(
        (dates, values) => {
            const chart = (window as any).echarts.init(document.getElementById('main'));
            const option = {
                title: { text: 'K线图', left: 'center' },
                tooltip: { trigger: 'axis' },
                xAxis: { type: 'category', data: dates },
                yAxis: { scale: true },
                series: [{
                    type: 'candlestick',
                    data: values.map(([open, close, low, high]) => [open, close, low, high])
                }]
            };
            chart.setOption(option);
            (window as any).done = true;
        },
        dates,
        values
    );

    await page.waitForFunction(() => (window as any).done === true, { timeout: 5000 });

    const chartDiv = await page.$('#main');
    if (!chartDiv) throw new Error('找不到#main容器');
    let outputPath = outFile;
    if (!/\.(png|jpeg|webp)$/i.test(outputPath)) {
        outputPath += '.png';
    }
    await chartDiv.screenshot({ path: outputPath as `${string}.png` | `${string}.jpeg` | `${string}.webp` });

    await browser.close();
}

// 示例用法
(async () => {
    await saveKLineChartByCode('sh600600', '2024-01-01', '2024-06-01', 'result/images/sh600600.png');
})().catch(console.error);