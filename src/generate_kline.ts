import fs from "fs/promises";
import path from "path";
import { createCanvas } from "canvas";
import { fileURLToPath } from "url";
import { SingleBar, Presets } from "cli-progress";

// 兼容 __dirname 用法（ES模块下）
const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

type StockDaily = {
    date: string;      // "YYYY-MM-DD"
    open: number;
    high: number;
    low: number;
    close: number;
    volume: number;
    turnover?: number;
};

interface KLineParams {
    exchange: string; // "sh" | "sz" | "bj";
    code: string;
    start: string; // "YYYY-MM-DD"
    end: string;   // "YYYY-MM-DD"
    outDir?: string; // 输出目录（可选）
    buyDate?: string;  // 买入日期（可选）
    sellDate?: string; // 卖出日期（可选）
}

async function readStockHistory(params: KLineParams): Promise<StockDaily[]> {
    const file = path.join(
        __dirname,
        "../data/json_data",
        // 只用股票代码，不加交易所前缀
        `${params.code}.json`
    );
    const content = await fs.readFile(file, "utf-8");
    const data = JSON.parse(content) as StockDaily[];
    return data.filter(d => d.date >= params.start && d.date <= params.end);
}

function drawKLine(
    stockData: StockDaily[],
    outPath: string,
    width = 1200,
    height = 600,
    buyDate?: string,
    sellDate?: string
) {
    const canvas = createCanvas(width, height);
    const ctx = canvas.getContext("2d");

    // 背景
    ctx.fillStyle = "#fff";
    ctx.fillRect(0, 0, width, height);

    if (stockData.length === 0) return;

    // 计算Y轴范围
    const allHighs = stockData.map(d => d.high);
    const allLows = stockData.map(d => d.low);
    const minPrice = Math.min(...allLows);
    const maxPrice = Math.max(...allHighs);

    // 坐标参数
    const left = 80, right = 40, top = 40, bottom = 80;
    const plotW = width - left - right;
    const plotH = height - top - bottom;
    const candleW = plotW / stockData.length * 0.6;

    // Y轴映射
    const price2y = (p: number) =>
        top + ((maxPrice - p) / (maxPrice - minPrice)) * plotH;

    // 画坐标轴
    ctx.strokeStyle = "#bbb";
    ctx.beginPath();
    ctx.moveTo(left, top);
    ctx.lineTo(left, top + plotH);
    ctx.lineTo(left + plotW, top + plotH);
    ctx.stroke();

    // 画Y轴刻度
    ctx.fillStyle = "#888";
    ctx.font = "14px sans-serif";
    for (let i = 0; i <= 4; ++i) {
        const price = minPrice + (maxPrice - minPrice) * (1 - i / 4);
        const y = price2y(price);
        ctx.fillText(price.toFixed(2), 5, y + 4);
        ctx.strokeStyle = "#eee";
        ctx.beginPath();
        ctx.moveTo(left, y);
        ctx.lineTo(left + plotW, y);
        ctx.stroke();
    }

    // 画K线
    stockData.forEach((d, i) => {
        const x = left + (i + 0.5) * (plotW / stockData.length);

        // 上影线/下影线
        ctx.strokeStyle = "#333";
        ctx.beginPath();
        ctx.moveTo(x, price2y(d.high));
        ctx.lineTo(x, price2y(d.low));
        ctx.stroke();

        // 实体（涨红跌绿，A股习惯）
        const up = d.close >= d.open;
        ctx.fillStyle = up ? "#e53935" : "#2abf6a";
        ctx.strokeStyle = ctx.fillStyle;

        const yOpen = price2y(d.open);
        const yClose = price2y(d.close);
        const rectY = Math.min(yOpen, yClose);
        const rectH = Math.max(Math.abs(yClose - yOpen), 1);

        if (rectH < 1.5) {
            // 横线表示平盘
            ctx.beginPath();
            ctx.moveTo(x - candleW / 2, yOpen);
            ctx.lineTo(x + candleW / 2, yOpen);
            ctx.stroke();
        } else {
            ctx.fillRect(x - candleW / 2, rectY, candleW, rectH);
            ctx.strokeRect(x - candleW / 2, rectY, candleW, rectH);
        }
    });

    // ===== 画均线 =====
    function drawMA(days: number, color: string) {
        ctx.save();
        ctx.strokeStyle = color;
        ctx.lineWidth = 2;
        ctx.beginPath();
        let started = false;
        for (let i = 0; i < stockData.length; ++i) {
            if (i < days - 1) continue;
            const ma = (
                stockData.slice(i - days + 1, i + 1)
                    .reduce((sum, d) => sum + d.close, 0) / days
            );
            const x = left + (i + 0.5) * (plotW / stockData.length);
            const y = price2y(ma);
            if (!started) {
                ctx.moveTo(x, y);
                started = true;
            } else {
                ctx.lineTo(x, y);
            }
        }
        ctx.stroke();
        ctx.restore();
    }
    // 5日、10日、30日、120日、250日
    drawMA(5, "#fbc02d");    // 金色
    drawMA(10, "#1976d2");   // 蓝色
    drawMA(30, "#8d6e63");   // 棕色
    drawMA(120, "#43a047");  // 绿色
    drawMA(250, "#d32f2f");  // 红色

    // ===== 均线图例 =====
    ctx.save();
    ctx.font = "bold 14px sans-serif";
    const legends = [
        { name: "MA5", color: "#fbc02d" },
        { name: "MA10", color: "#1976d2" },
        { name: "MA30", color: "#8d6e63" },
        { name: "MA120", color: "#43a047" },
        { name: "MA250", color: "#d32f2f" }
    ];
    let lx = left + 10, ly = top - 15;
    legends.forEach(legend => {
        ctx.fillStyle = legend.color;
        ctx.fillRect(lx, ly - 10, 20, 6);
        ctx.fillStyle = "#333";
        ctx.fillText(legend.name, lx + 25, ly - 2);
        lx += 70;
    });
    ctx.restore();

    // 标记买入/卖出点
    if (buyDate) {
        const idx = stockData.findIndex(d => d.date === buyDate);
        if (idx !== -1) {
            const d = stockData[idx];
            const x = left + (idx + 0.5) * (plotW / stockData.length);
            const y = price2y(d.low) + 10;
            ctx.save();
            ctx.strokeStyle = "#1976d2";
            ctx.fillStyle = "#1976d2";
            ctx.beginPath();
            ctx.moveTo(x, y);
            ctx.lineTo(x - 8, y + 18);
            ctx.lineTo(x + 8, y + 18);
            ctx.closePath();
            ctx.fill();
            ctx.font = "bold 14px sans-serif";
            ctx.fillText("买", x - 10, y + 35);
            ctx.restore();
        }
    }
    if (sellDate) {
        const idx = stockData.findIndex(d => d.date === sellDate);
        if (idx !== -1) {
            const d = stockData[idx];
            const x = left + (idx + 0.5) * (plotW / stockData.length);
            const y = price2y(d.high) - 10;
            ctx.save();
            ctx.strokeStyle = "#ff9800";
            ctx.fillStyle = "#ff9800";
            ctx.beginPath();
            ctx.moveTo(x, y);
            ctx.lineTo(x - 8, y - 18);
            ctx.lineTo(x + 8, y - 18);
            ctx.closePath();
            ctx.fill();
            ctx.font = "bold 14px sans-serif";
            ctx.fillText("卖", x - 10, y - 25);
            ctx.restore();
        }
    }

    // 画日期
    ctx.fillStyle = "#888";
    ctx.font = "12px sans-serif";
    for (let i = 0; i < stockData.length; i += Math.ceil(stockData.length / 8)) {
        const d = stockData[i];
        const x = left + (i + 0.5) * (plotW / stockData.length);
        ctx.fillText(d.date, x - 22, height - 50);
    }

    // 保存图片
    return fs.mkdir(path.dirname(outPath), { recursive: true }).then(() => {
        const buffer = canvas.toBuffer("image/png");
        return fs.writeFile(outPath, buffer);
    });
}

// 主接口函数
export async function generateKLineChart(params: KLineParams): Promise<string> {
    const stockData = await readStockHistory(params);
    if (stockData.length === 0) throw new Error("无数据！");
    // 使用 outDir（如果有），否则默认 "../result/images"
    const outDir = params.outDir
        ? path.isAbsolute(params.outDir)
            ? params.outDir
            : path.join(__dirname, "..", params.outDir)
        : path.join(__dirname, "../result/images");
    // 文件名只用股票代码
    const outPath = path.join(
        outDir,
        `${params.code}_${params.buyDate}_${params.sellDate}.png`
    );
    await drawKLine(stockData, outPath, 1200, 600, params.buyDate, params.sellDate);
    return outPath;
}

type Trade = {
    buyDate: string;
    sellDate: string;
    // 其它字段可选
};

type StockSummary = {
    code: string;
    name: string;
    exchange: string;
};

async function readAllDaily(exchange: string, code: string): Promise<any[]> {
    // 只用股票代码，不加交易所前缀
    const file = path.join(__dirname, "../data/json_data", `${code}.json`);
    const content = await fs.readFile(file, "utf-8");
    return JSON.parse(content);
}

async function clearDir(dir: string) {
    try {
        await fs.rm(dir, { recursive: true, force: true });
        await fs.mkdir(dir, { recursive: true });
    } catch (e) {
        // 忽略
    }
}

async function main() {
    const summaryPath = path.join(__dirname, "../data/backtest/trade_records_summary.json");
    const tradeDir = path.join(__dirname, "../data/backtest");
    const resultDir = path.join(__dirname, "../result/images");

    // 运行开始先清空result/images
    await clearDir(resultDir);

    const summaryContent = await fs.readFile(summaryPath, "utf-8");
    const summaryList: StockSummary[] = JSON.parse(summaryContent);

    // 统计所有需要生成的K线图任务
    let allTasks: {
        stock: StockSummary,
        trade: Trade,
        daily: any[]
    }[] = [];

    for (const stock of summaryList) {
        // 文件名只用股票代码
        const tradeFile = path.join(tradeDir, `${stock.code}.json`);
        let trades: Trade[] = [];
        try {
            const tradeContent = await fs.readFile(tradeFile, "utf-8");
            trades = JSON.parse(tradeContent);
        } catch {
            continue;
        }
        if (!trades.length) continue;

        // 读取日线数据
        let daily: any[] = [];
        try {
            daily = await readAllDaily(stock.exchange, stock.code);
        } catch {
            console.error(`读取${stock.code}日线数据失败`);
            continue;
        }

        for (const trade of trades) {
            allTasks.push({ stock, trade, daily });
        }
    }

    // 进度条
    const bar = new SingleBar({
        format: `生成K线图 |{bar}| {percentage}% | {value}/{total}`,
        barCompleteChar: '█',
        barIncompleteChar: '░',
        hideCursor: true
    }, Presets.shades_classic);

    bar.start(allTasks.length, 0);

    for (const { stock, trade, daily } of allTasks) {
        // 找到买入和卖出在daily中的索引
        const buyIdx = daily.findIndex(d => d.date === trade.buyDate);
        const sellIdx = daily.findIndex(d => d.date === trade.sellDate);
        if (buyIdx === -1 || sellIdx === -1) {
            bar.increment();
            continue;
        }
        const startIdx = Math.max(0, buyIdx - 15);
        const endIdx = Math.min(daily.length - 1, sellIdx + 15);
        const start = daily[startIdx].date;
        const end = daily[endIdx].date;

        // 输出目录只用股票代码
        const outDir = path.join(resultDir, `${stock.code}`);
        await generateKLineChart({
            exchange: stock.exchange,
            code: stock.code,
            start,
            end,
            outDir,
            buyDate: trade.buyDate,
            sellDate: trade.sellDate
        });
        bar.increment();
    }

    bar.stop();
    console.log("所有K线图生成完毕");
}

// 仅当直接运行本文件时执行
if (import.meta.url === `file://${process.argv[1]}` || require.main === module) {
    main().catch(e => {
        console.error(e);
    });
}
