import fs from 'fs/promises';
import path from 'path';
import { generateSummaryHtml } from './generate_html.js';

import type { StockDaily, TradeRecord } from './types.js';

function sma(arr: number[], period: number): number[] {
    const result: number[] = [];
    for (let i = 0; i < arr.length; i++) {
        if (i < period - 1) {
            result.push(NaN);
        } else {
            const sum = arr.slice(i - period + 1, i + 1).reduce((a, b) => a + b, 0);
            result.push(sum / period);
        }
    }
    return result;
}


/**
 * 读取特定股票的历史数据
 * @param jsonDir JSON文件目录
 * @param code 股票代码
 * @param exchange 股票交易所
 * @returns 股票的历史数据
 */
async function readStockHistory(jsonDir: string, code: string, exchange: string): Promise<StockDaily[]> {
    const file = path.join(jsonDir, `${exchange}${code}.json`);
    const content = await fs.readFile(file, 'utf-8');
    return JSON.parse(content) as StockDaily[];
}

/**
 * 单次回测选股逻辑
 * @param code 股票代码
 * @param name 股票名称
 * @param data 股票的历史数据
 * @returns 回测交易记录或null
 */
function backtest(code: string, name: string, data: StockDaily[]): TradeRecord | null {
    if (data.length < 30) return null;

    const closes = data.map(d => d.close);
    const volumes = data.map(d => d.volume);

    const ma10 = sma(closes, 10);
    const vol5 = sma(volumes, 5);

    for (let i = 20; i < data.length - 1; i++) {
        const prevHighs = closes.slice(i - 20, i);
        const max20 = Math.max(...prevHighs);
        const curr = data[i];
        const volRatio = vol5[i] > 0 ? curr.volume / vol5[i] : 0;

        const isBreakout = curr.close > max20;
        const isVolSpike = volRatio > 1.5;

        if (isBreakout && isVolSpike) {
            const buyDate = curr.date;
            const buyPrice = curr.close;

            for (let j = i + 1; j < data.length; j++) {
                if (data[j].close < ma10[j]) {
                    const sellDate = data[j].date;
                    const sellPrice = data[j].close;
                    const holdDays = j - i;
                    const returnPct = ((sellPrice - buyPrice) / buyPrice) * 100;

                    return { code, name, buyDate, sellDate, buyPrice, sellPrice, holdDays, returnPct };
                }
            }

            // 如果未触发卖出条件
            const last = data[data.length - 1];
            const sellDate = last.date;
            const sellPrice = last.close;
            const holdDays = data.length - 1 - i;
            const returnPct = ((sellPrice - buyPrice) / buyPrice) * 100;

            return { code, name, buyDate, sellDate, buyPrice, sellPrice, holdDays, returnPct };
        }
    }

    return null;
}

/**
 * 多次回测选股逻辑
 * @param code 股票代码
 * @param name 股票名称
 * @param data 股票的历史数据
 * @returns 回测交易记录数组
 *
 * 基于历史数据模拟多次交易，通过突破和成交量激增条件识别买入和卖出点，并计算每笔交易的收益率。
 * 
 * 买入：
 *      价格趋势确认：当前收盘价高于5日、10日、250日均线，且5日/10日均线向上
 *      放量突破：当日成交量大于最近5日均量1.5倍，且为阳线，且收盘价为近20日新高
 *      排除异动股：最近5日无连续3个涨停，且非ST股
 * 卖出：
 *      收盘价低于10日均线
 *      如果在最后仍持有股票，则卖出最后一天的收盘价
 */
function backtestMultiTrades(code: string, name: string, data: StockDaily[]): TradeRecord[] {
    const trades: TradeRecord[] = [];
    // 确保有足够的数据进行分析
    if (data.length < 30) return trades;

    // 从历史数据中提取收盘价和成交量
    const closes = data.map(d => d.close);
    const volumes = data.map(d => d.volume);

    // 计算收盘价和成交量的移动平均
    const ma10 = sma(closes, 10); // 10天移动平均
    const vol5 = sma(volumes, 5); // 5天移动平均

    let holding = false; // 跟踪当前是否持有股票
    let buyIndex = -1; // 买入交易的索引
    let buyPrice = 0; // 股票买入价格
    let buyDate = ''; // 买入交易日期

    for (let i = 20; i < data.length; i++) {
        const curr = data[i];

        if (!holding) {
            // 确定突破和成交量激增条件
            const prevHighs = closes.slice(i - 20, i); // 最近20天的收盘价
            const max20 = Math.max(...prevHighs); // 最近20天的最高收盘价
            const volRatio = vol5[i] > 0 ? curr.volume / vol5[i] : 0; // 与5天平均成交量的比率

            const isBreakout = curr.close > max20; // 突破条件：当前收盘价超过20天最高价
            const isVolSpike = volRatio > 1.5; // 成交量激增条件：成交量超过平均值的1.5倍

            if (isBreakout && isVolSpike) {
                // 买入股票
                holding = true;
                buyIndex = i;
                buyPrice = curr.close;
                buyDate = curr.date;
            }
        } else {
            // 如果收盘价低于10天移动平均线，则卖出股票
            if (data[i].close < ma10[i]) {
                const sellPrice = data[i].close;
                const sellDate = data[i].date;
                const holdDays = i - buyIndex; // 持股天数
                const returnPct = ((sellPrice - buyPrice) / buyPrice) * 100; // 收益百分比

                // 记录交易
                trades.push({
                    code, name, buyDate, sellDate, buyPrice, sellPrice, holdDays, returnPct
                });

                // 重置持有状态
                holding = false;
                buyIndex = -1;
            }
        }
    }

    // 如果在最后仍持有股票，则卖出
    if (holding && buyIndex >= 0) {
        const last = data[data.length - 1];
        const sellPrice = last.close;
        const sellDate = last.date;
        const holdDays = data.length - 1 - buyIndex; // 持股天数
        const returnPct = ((sellPrice - buyPrice) / buyPrice) * 100; // 收益百分比

        trades.push({
            code, name, buyDate, sellDate, buyPrice, sellPrice, holdDays, returnPct
        });
    }

    return trades;
}

async function removeDirIfExists(dir: string, excludeDirs: string[] = []) {
    try {
        const entries = await fs.readdir(dir, { withFileTypes: true });
        for (const entry of entries) {
            const fullPath = path.join(dir, entry.name);
            if (excludeDirs.includes(entry.name) && entry.isDirectory()) {
                // 跳过指定的子目录
                continue;
            }
            await fs.rm(fullPath, { recursive: true, force: true });
        }
    } catch { }
}

async function main() {
    const jsonDir = './data/json_data';
    const backtestDir = './data/backtest';
    const resultDir = './result';
    const imagesDir = path.join(resultDir, 'images');
    const selectedPath = path.join(jsonDir, 'selected.json');

    // 只清空 ./result 目录下的文件和非 images 子目录，保留 images 目录及其内容
    await fs.mkdir(resultDir, { recursive: true });
    await removeDirIfExists(resultDir, ['images']);
    await fs.mkdir(imagesDir, { recursive: true });

    // 从data/json_data/selected.json读取
    let selected: { code: string, name: string, exchange: string }[] = [];
    try {
        const content = await fs.readFile(selectedPath, 'utf-8');
        selected = JSON.parse(content);
    } catch {}

    // 确保回测输出目录存在
    await fs.mkdir(backtestDir, { recursive: true });

    const summary: { code: string, name: string, exchange: string, totalReturnPct: number, tradeCount: number, avgReturnPct: number, totalHoldDays: number }[] = [];

    // 1. 回测并保存结果
    for (const stock of selected) {
        try {
            const data = await readStockHistory(jsonDir, stock.code, stock.exchange);
            const result = backtestMultiTrades(stock.code, stock.name, data);
            // 保存每只股票的回测结果
            const stockFile = path.join(backtestDir, `${stock.exchange}${stock.code}.json`);
            await fs.writeFile(stockFile, JSON.stringify(result, null, 2), 'utf-8');
            // 统计摘要
            const totalReturnPct = result.reduce((sum, r) => sum + r.returnPct, 0);
            const tradeCount = result.length;
            const avgReturnPct = tradeCount > 0 ? totalReturnPct / tradeCount : 0;
            const totalHoldDays = result.reduce((sum, r) => sum + r.holdDays, 0);
            summary.push({
                code: stock.code,
                name: stock.name,
                exchange: stock.exchange,
                totalReturnPct,
                tradeCount,
                avgReturnPct,
                totalHoldDays
            });
        } catch (e) {
            console.log(`[${stock.code}] 读取或解析失败:`, e);
        }
    }

    // 输出简明摘要
    /*
    console.log('\n回测摘要结果（部分）:');
    summary.slice(0, 10).forEach(s => {
        console.log(`${s.code} ${s.name} 总收益: ${s.totalReturnPct.toFixed(2)}% 交易次数: ${s.tradeCount}`);
    });
    */

    // 保存摘要文件
    const summaryFile = path.join(backtestDir, 'trade_records_summary.json');
    await fs.writeFile(summaryFile, JSON.stringify(summary, null, 2), 'utf-8');
    console.log(`\n回测摘要已保存至 ${summaryFile}, 共 ${summary.length} 只股票`);

    // 2. 生成静态网页，输出至 ./result/
    await generateSummaryHtml(
        './data/backtest/trade_records_summary.json',
        './result',
        './data/backtest' // 交易记录目录
    );

}


main().then(async () => {
    console.log('\n回测完成！');
}).catch(e => {
    console.error(e);
});
