import fs from 'fs/promises';
import path from 'path';
import { SingleBar, Presets } from 'cli-progress';
import { StockDaily } from './types/stock.js';
import { DividendRecord } from './read_dividend.js';


// 新增：读取分红数据
async function readDividendData(dividendFile: string): Promise<DividendRecord[]> {
    try {
        const content = await fs.readFile(dividendFile, 'utf-8');
        const arr = JSON.parse(content) as DividendRecord[];
        // 修正date字段为Date类型
        for (const d of arr) {
            // 若d.date已为字符串，转为Date对象
            if (typeof d.date === 'string') {
                d.date = new Date(d.date);
            }
        }
        return arr;
    } catch (e) {
        console.warn(`未找到分红数据文件: ${dividendFile}`);
        return [];
    }
}

/**
 * 将原始日期整数转换为格式化字符串。
 * @param raw - 原始日期整数，格式为YYYYMMDD。
 * @returns 格式化后的日期字符串，格式为YYYY-MM-DD。
 */
function formatDate(raw: number): string {
    const s = raw.toString();
    return `${s.slice(0, 4)}-${s.slice(4, 6)}-${s.slice(6, 8)}`;
}

/**
 * 读取.day文件并将其二进制内容转换为StockDaily记录数组，并可根据分红数据进行除权处理。
 * @param filePath - .day文件的路径。
 * @param dividendArr - 分红数据数组
 * @param code - 股票代码
 * @param adjustType - 除权方式: 'none' | 'qfq' | 'hfq'
 * @returns 从文件解析出的StockDaily记录数组。
 */
type AdjustType = 'none' | 'qfq' | 'hfq';
export async function readDayFile(
    filePath: string,
    dividendArr: DividendRecord[] = [],
    code: string = '',
    adjustType: AdjustType = 'none'
): Promise<StockDaily[]> {
    const buf = await fs.readFile(filePath);
    const recordSize = 32;
    const records: StockDaily[] = [];

    /* 
     * 通达信 .day 文件，每条记录32字节，按顺序依次为：
     *   int32 日期（YYYYMMDD）
     *   int32 开盘价（单位：分）
     *   int32 最高价（单位：分）
     *   int32 最低价（单位：分）
     *   int32 收盘价（单位：分）
     *   int32 成交额（单位：分）
     *   int32 成交量（单位：股）
     *   int32 保留字段（未用）
     */
    for (let offset = 0; offset < buf.length; offset += recordSize) {
        const dateRaw = buf.readInt32LE(offset);
        const open = buf.readInt32LE(offset + 4);
        const high = buf.readInt32LE(offset + 8);
        const low = buf.readInt32LE(offset + 12);
        const close = buf.readInt32LE(offset + 16);
        const turnover = buf.readInt32LE(offset + 20);
        const volume = buf.readInt32LE(offset + 24);

        records.push({
            date: formatDate(dateRaw),
            open: open / 100,
            high: high / 100,
            low: low / 100,
            close: close / 100,
            turnover: turnover / 100,
            volume
        });
    }

    if (adjustType !== 'none' && dividendArr.length > 0 && code) {
        // 筛选出当前股票的分红数据
        const dividends = dividendArr.filter(d => d.code === code);

        // 将分红数据转换为 Map，以日期为键，方便快速查找
        const dividendMap = new Map(
            dividends.map(d => [d.date.toISOString().slice(0, 10), d])
        );

        // 用于存储每个日期的复权因子
        const factorMap = new Map<string, number>();
        let factor = 1; // 初始化复权因子为 1

        if (adjustType === 'qfq') {
            // 前复权：从后往前遍历记录
            for (let i = records.length - 1; i >= 0; i--) {
                factorMap.set(records[i].date, factor);

                const div = dividendMap.get(records[i].date);
                // **注意：分红因子应用在前一天**
                if (div && i > 0) {
                    const prev = records[i - 1];
                    const bonusRatio = div.bonus / 10;
                    const dispatchRatio = div.dispatch / 10;
                    const splitRatio = div.splite || 1;
                    const cash = div.cash / 10;
                    const price = div.price;

                    const adjustedClose = records[i].close / splitRatio;
                    const equityBefore = 1;
                    const equityAfter = 1 + bonusRatio + dispatchRatio;
                    const totalValue = adjustedClose * equityBefore + price * dispatchRatio;
                    const newPrice = (totalValue - cash) / equityAfter;
                    const ratio = adjustedClose / newPrice;

                    factor *= ratio;
                    // factorMap.set(records[i - 1].date, factor);  // 可以不必set，已在循环最开始set
                }
            }

            const baseFactor = factorMap.get(records[records.length - 1].date) || 1; // 前复权基于最后一条记录

            // 应用复权因子到所有记录
            const roundToPenny = (num: number) => Math.round(num * 100) / 100; // 保留两位小数
            for (let i = 0; i < records.length; i++) {
                const rec = records[i];
                const f = factorMap.get(rec.date) || 1;
                const appliedFactor = baseFactor / f;

                rec.open = roundToPenny(rec.open * appliedFactor);
                rec.high = roundToPenny(rec.high * appliedFactor);
                rec.low = roundToPenny(rec.low * appliedFactor);
                rec.close = roundToPenny(rec.close * appliedFactor);
                rec.turnover = roundToPenny(rec.turnover * appliedFactor);
            }

        } else if (adjustType === 'hfq') {

            // 后复权：从前往后遍历记录
            let factor = 1; // 初始化复权因子
            for (let i = 0; i < records.length; i++) {
                const rec = records[i];
                const div = dividendMap.get(rec.date);

                if (div) {
                    const cash = div.cash / 10; // 每股现金分红

                    // 计算复权因子：除息后价格加上分红
                    const ratio = (rec.close + cash) / rec.close;
                    factor *= ratio;
                }

                // 保存当前因子
                factorMap.set(rec.date, factor);
            }

            // 应用复权因子到所有记录
            const roundToPenny = (num: number) => Math.round(num * 100) / 100;
            for (let i = 0; i < records.length; i++) {
                const rec = records[i];
                const f = factorMap.get(rec.date) || 1;

                // 直接乘以复权因子
                rec.open = roundToPenny(rec.open * f);
                rec.high = roundToPenny(rec.high * f);
                rec.low = roundToPenny(rec.low * f);
                rec.close = roundToPenny(rec.close * f);
                rec.turnover = roundToPenny(rec.turnover * f);
            }

        }
    }

    // 复权处理后再进行所有字段的计算

    // 计算60日平均成本
    for (let i = 0; i < records.length; i++) {
        let sumTurnover = 0;
        let sumVolume = 0;
        for (let j = Math.max(0, i - 59); j <= i; j++) {
            sumTurnover += records[j].turnover;
            sumVolume += records[j].volume;
        }
        records[i].avgCost60 = sumVolume > 0 ? sumTurnover / sumVolume : null;
    }

    // 计算平均持仓成本（全区间均价）
    let totalTurnover = 0;
    let totalVolume = 0;
    for (let i = 0; i < records.length; i++) {
        totalTurnover += records[i].turnover;
        totalVolume += records[i].volume;
        records[i].avgPositionCost = totalVolume > 0 ? totalTurnover / totalVolume : null;
    }

    // 计算获利盘比例（以close大于全区间均价为获利盘）
    for (let i = 0; i < records.length; i++) {
        const avgCost = records[i].avgPositionCost;
        if (avgCost == null) {
            records[i].profitRatio = null;
        } else {
            // 统计历史收盘价高于当前均价的天数比例
            const winDays = records.slice(0, i + 1).filter(r => r.close > avgCost).length;
            records[i].profitRatio = (i + 1) > 0 ? winDays / (i + 1) : null;
        }
    }

    // 计算90%筹码集中度和价格分布范围
    for (let i = 0; i < records.length; i++) {
        // 取前90天（含当天），不足90天则取已有
        const window = records.slice(Math.max(0, i - 89), i + 1);
        // 按价格分布统计成交量
        const priceVolume: { price: number, volume: number }[] = window.map(r => ({ price: r.close, volume: r.volume }));
        priceVolume.sort((a, b) => a.price - b.price);

        const totalVol = priceVolume.reduce((sum, pv) => sum + pv.volume, 0);
        let cumVol = 0;
        let lower = null, upper = null;
        // 找到90%区间
        for (let j = 0; j < priceVolume.length; j++) {
            cumVol += priceVolume[j].volume;
            if (lower === null && cumVol >= totalVol * 0.05) {
                lower = priceVolume[j].price;
            }
            if (upper === null && cumVol >= totalVol * 0.95) {
                upper = priceVolume[j].price;
                break;
            }
        }
        if (lower !== null && upper !== null) {
            records[i].chipRange90 = [lower, upper];
            records[i].chipConcentration90 = (upper - lower) / (window[window.length - 1].close || 1);
        } else {
            records[i].chipRange90 = null;
            records[i].chipConcentration90 = null;
        }
    }

    return records;
}


/**
 * 将所有证券交易所目录（bj, sh, sz）的lday子文件夹中的.day文件转换为JSON格式，并与现有JSON数据合并。
 * @param inputRootDir - 包含bj/sh/sz子目录的根目录。
 * @param outputDir - 保存转换后JSON文件的目录。
 * @param indexFile - 股票列表索引文件的路径。
 * @param adjustType - 除权方式: 'none' | 'qfq' | 'hfq'
 * @param dividendFile - 分红数据文件路径
 */
async function convertAllDayFiles(
    inputRootDir: string,
    outputDir: string,
    indexFile: string,
    adjustType: 'none' | 'qfq' | 'hfq' = 'none',
    dividendFile: string = './data/json_data/divident.json'
) {
    await fs.mkdir(outputDir, { recursive: true });

    // 读取分红数据
    const dividendArr = await readDividendData(dividendFile);

    const subDirs = ['bj', 'sh', 'sz'];
    let files: { file: string, dir: string, exchange: string }[] = [];

    for (const sub of subDirs) {
        const ldayDir = path.join(inputRootDir, sub, 'lday');
        try {
            const dirFiles = (await fs.readdir(ldayDir)).filter(f => f.endsWith('.day'));
            files.push(...dirFiles.map(f => ({ file: f, dir: ldayDir, exchange: sub })));
        } catch (e) {
            // 目录不存在则跳过
        }
    }

    // 读取股票列表
    let stockList: { code: string, name: string, exchange: string }[] = [];
    try {
        const indexContent = await fs.readFile(indexFile, 'utf-8');
        stockList = JSON.parse(indexContent);
    } catch (e) {
        console.error(`无法读取股票列表 ${indexFile}:`, e);
        return;
    }

    const bar = new SingleBar({
        format: '进度 |{bar}| {percentage}% | {value}/{total} | {file}',
        barCompleteChar: '█',
        barIncompleteChar: '░',
        hideCursor: true
    }, Presets.shades_classic);

    bar.start(files.length, 0, { file: '' });

    for (let i = 0; i < files.length; i++) {
        const { file, dir, exchange } = files[i];
        const symbolRaw = file.replace('.day', '');
        const code = symbolRaw.slice(2);
        let stockInfo = stockList.find(s => s.code === code && s.exchange === exchange);
        const stockName = stockInfo ? stockInfo.name : `未知名称, code=${code}, exchange=${exchange}`;

        const inputPath = path.join(dir, file);
        const outputPath = path.join(outputDir, `${code}.json`);

        try {
            // 传入分红数据和除权方式
            const newData = await readDayFile(inputPath, dividendArr, code, adjustType);
            let mergedData = newData;
            try {
                const existingContent = await fs.readFile(outputPath, 'utf-8');
                const existingData: StockDaily[] = JSON.parse(existingContent);
                const existingDates = new Set(existingData.map(d => d.date));
                const onlyNew = newData.filter(d => !existingDates.has(d.date));
                mergedData = existingData.concat(onlyNew);
            } catch (e) {
                // 如果文件不存在，直接写入newData
            }
            mergedData.sort((a, b) => a.date.localeCompare(b.date));
            await fs.writeFile(outputPath, JSON.stringify(mergedData, null, 2), 'utf-8');
            bar.increment({ file: `${code}.${exchange.toUpperCase()} (${stockName})` });
        } catch (err) {
            console.error(`转换失败 ${file}:`, err);
        }
    }

    bar.stop();
    console.log('\n所有文件已转换完成');
}

// 优先使用环境变量，其次命令行参数，最后默认
let adjustType: 'none' | 'qfq' | 'hfq' = 'none';
const envAdjust = process.env.ADJUST_TYPE;
if (envAdjust === 'qfq' || envAdjust === 'hfq' || envAdjust === 'none') {
    adjustType = envAdjust;
} else {
    const args = process.argv.slice(2);
    if (args.includes('--qfq')) adjustType = 'qfq';
    if (args.includes('--hfq')) adjustType = 'hfq';
}

(async () => {
    if (!import.meta.vitest) {
        let adjustTypeText = '不复权';
        if (adjustType === 'qfq') adjustTypeText = '前复权';
        else if (adjustType === 'hfq') adjustTypeText = '后复权';
        console.log(`复权方式: ${adjustTypeText}`);
        const inputRootDir = './data/tdx_data';    // 根目录，包含bj/sh/sz子目录
        const outputDir = './data/json_data';      // 转换后JSON文件的保存目录
        const indexFile = path.join('data', 'stock_list.json');
        const dividendFile = './data/json_data/divident.json';
        await convertAllDayFiles(inputRootDir, outputDir, indexFile, adjustType, dividendFile);
    }
})();