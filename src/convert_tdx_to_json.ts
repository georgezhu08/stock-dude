/**
 * 通达信 .day 文件格式：
 * 每条记录32字节，按顺序依次为：
 *   int32 日期（YYYYMMDD）
 *   int32 开盘价（单位：分）
 *   int32 最高价（单位：分）
 *   int32 最低价（单位：分）
 *   int32 收盘价（单位：分）
 *   int32 成交额（单位：分）
 *   int32 成交量（单位：股）
 *   int32 保留字段（未用）
 */
import fs from 'fs/promises';
import path from 'path';
import { SingleBar, Presets } from 'cli-progress';
import { StockDaily } from './types.js';


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
 * 读取.day文件并将其二进制内容转换为StockDaily记录数组。
 * @param filePath - .day文件的路径。
 * @returns 从文件解析出的StockDaily记录数组。
 */
async function readDayFile(filePath: string): Promise<StockDaily[]> {
    const buf = await fs.readFile(filePath);
    const recordSize = 32;
    const records: StockDaily[] = [];

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

    return records;
}

/**
 * 将所有证券交易所目录（bj, sh, sz）的lday子文件夹中的.day文件转换为JSON格式，并与现有JSON数据合并。
 * @param inputRootDir - 包含bj/sh/sz子目录的根目录。
 * @param outputDir - 保存转换后JSON文件的目录。
 * @param indexFile - 股票列表索引文件的路径。
 */
async function convertAllDayFiles(inputRootDir: string, outputDir: string, indexFile: string) {
    await fs.mkdir(outputDir, { recursive: true });

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
        const outputPath = path.join(outputDir, file.replace('.day', '.json'));

        try {
            const newData = await readDayFile(inputPath);
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
            console.error(`❌ 转换失败 ${file}:`, err);
        }
    }

    bar.stop();
    console.log('\n所有文件已转换完成');
}

(async () => {
    const inputRootDir = './data/tdx_data';    // 根目录，包含bj/sh/sz子目录
    const outputDir = './data/json_data';      // 转换后JSON文件的保存目录
    const indexFile = path.join('data', 'stock_list.json');

    await convertAllDayFiles(inputRootDir, outputDir, indexFile);
})();
