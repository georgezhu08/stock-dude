import fs from 'fs/promises';
import path from 'path';
import { SingleBar, Presets } from 'cli-progress';
import { StockDaily } from './types/stock.js';


/**
 * 选股主算法
 * @param stockData 某只股票的历史日线数据
 * @param stockName 股票名称
 * @returns 是否满足选股条件
 *
 * 主要逻辑：
 * 1. 价格趋势确认：当前收盘价高于5日、10日、250日均线，且5日/10日均线向上
 * 2. 放量突破：当日成交量大于最近5日均量1.5倍，且为阳线，且收盘价为近20日新高
 * 3. 排除异动股：最近5日无连续3个涨停，且非ST股
 */
async function checkStockWithPrint(stockData: StockDaily[], stockName: string, debug = false): Promise<boolean> {
    await logDebugMessage(`\n正在检查股票: ${stockName}`);
    if (stockData.length < 250) {
        await logDebugMessage(`[${stockName}] 数据不足: ${stockData.length} < 250`);
        return false;
    }

    const last = stockData[stockData.length - 1];
    const ma = (days: number) =>
        stockData.slice(-days).reduce((sum, d) => sum + d.close, 0) / days;

    const ma5 = ma(5);
    const ma10 = ma(10);
    const ma250 = ma(250);

    await logDebugMessage(`[${stockName}] last.close=${last.close}, ma5=${ma5}, ma10=${ma10}, ma250=${ma250}`);
    if (!(last.close > ma5 && last.close > ma10)) {
        await logDebugMessage(`[${stockName}] 不满足: 收盘价未站上5日/10日均线`);
        return false;
    }
    if (!(ma5 > stockData[stockData.length - 6].close && ma10 > stockData[stockData.length - 11].close)) {
        await logDebugMessage(`[${stockName}] 不满足: 5日/10日均线未向上`);
        return false;
    }
    if (last.close < ma250) {
        await logDebugMessage(`[${stockName}] 不满足: 收盘价未站上250日均线`);
        return false;
    }

    // 2. 放量确认突破
    const avgVol5 = stockData.slice(-6, -1).reduce((sum, d) => sum + d.volume, 0) / 5;
    await logDebugMessage(`[${stockName}] last.volume=${last.volume}, avgVol5=${avgVol5}`);
    if (!(last.volume > avgVol5 * 1.5)) {
        await logDebugMessage(`[${stockName}] 不满足: 未放量突破`);
        return false;
    }
    if (!(last.close > last.open)) {
        await logDebugMessage(`[${stockName}] 不满足: 非阳线`);
        return false;
    }
    const high20 = Math.max(...stockData.slice(-20).map(d => d.close));
    await logDebugMessage(`[${stockName}] last.close=${last.close}, high20=${high20}`);
    // 修正：必须是近20日新高（即等于high20才算新高）
    if (last.close < high20) {
        await logDebugMessage(`[${stockName}] 不满足: 非近20日新高`);
        return false;
    }

    // 3. 排除异动股
    let limitUpCount = 0, maxConsecutive = 0;
    for (let i = stockData.length - 5; i < stockData.length; i++) {
        const d = stockData[i];
        if (i > 0 && (d.close - stockData[i - 1].close) / stockData[i - 1].close >= 0.099) {
            limitUpCount++;
            maxConsecutive = Math.max(maxConsecutive, limitUpCount);
        } else {
            limitUpCount = 0;
        }
    }
    await logDebugMessage(`[${stockName}] maxConsecutiveLimitUp=${maxConsecutive}`);
    if (maxConsecutive >= 3) {
        await logDebugMessage(`[${stockName}] 不满足: 最近5日有连续3个涨停`);
        return false;
    }
    if (stockName.includes('ST')) {
        await logDebugMessage(`[${stockName}] 不满足: ST股`);
        return false;
    }

    await logDebugMessage(`[${stockName}] 满足所有条件`);
    return true;
}

/**
 * 扫描所有JSON文件并应用选股算法
 * @param jsonDir JSON文件目录
 * @param indexPath 股票代码和名称索引文件
 *
 * 主要流程：
 * 1. 读取stock_list.json，获取所有股票代码和名称
 * 2. 依次读取每只股票的JSON数据，应用选股算法
 * 3. 进度条显示当前进度
 * 4. 输出所有满足条件的个股
 */
async function scanAndSelectStocks(jsonDir: string, indexPath: string) {
    const indexArr: { code: string, name: string, exchange: string }[] = JSON.parse(await fs.readFile(indexPath, 'utf-8'));
    const selected: { code: string, name: string, exchange: string }[] = [];
    const selectedSet = new Set<string>();

    // Initialize progress bar
    const progressBar = new SingleBar({
        format: 'Scanning stocks | {bar} | {percentage}% | {value}/{total} stocks',
        hideCursor: true
    }, Presets.shades_classic);
    progressBar.start(indexArr.length, 0);

    for (let i = 0; i < indexArr.length; i++) {
        const { code, name, exchange } = indexArr[i];
        const jsonFile = path.join(jsonDir, `${code}.json`);
        try {
            const content = await fs.readFile(jsonFile, 'utf-8');
            const data: StockDaily[] = JSON.parse(content);
            if (await checkStockWithPrint(data, name, true)) {
                const key = code; // 只用code作为唯一标识
                if (!selectedSet.has(key)) {
                    selected.push({ code, name, exchange });
                    selectedSet.add(key);
                }
            }
        } catch (e) {
            await logDebugMessage(`[${code}] 文件不存在或解析失败, ${jsonFile}`);
        }
        progressBar.update(i + 1);
    }

    progressBar.stop();

    console.log('\n满足选股条件的个股:');
    selected.forEach(s => {
        console.log(`${s.code} ${s.name} ${s.exchange}`);
    });

    const selectedPath = path.join(jsonDir, 'selected.json');
    await fs.writeFile(selectedPath, JSON.stringify(selected, null, 2), 'utf-8');
    console.log(`\n已保存选股结果到: ${selectedPath}`);
}

/**
 * 确保日志文件夹存在
 */
async function ensureLogsFolderExists() {
    const logsFolderPath = path.join('logs');
    try {
        await fs.mkdir(logsFolderPath, { recursive: true });
    } catch (error) {
        if (error instanceof Error) {
            console.error(`Failed to create logs folder: ${error.message}`);
        } else {
            console.error('Failed to create logs folder due to an unknown error.');
        }
    }
}

/**
 * 记录调试信息到日志文件
 * @param message 调试信息
 */
async function logDebugMessage(message: string) {
    await ensureLogsFolderExists();
    const logFilePath = path.join('logs', 'selected.log');
    await fs.appendFile(logFilePath, message + '\n', 'utf-8');
}

// 程序入口，指定目录并执行扫描
(async () => {
    const jsonDir = './data/json_data';
    const indexPath = path.join('data', 'stock_list.json');
    await scanAndSelectStocks(jsonDir, indexPath);
})();