import fs from 'fs';
import iconv from 'iconv-lite';
import path from 'path';

// 定义分红记录的数据结构
export interface DividendRecord {
    code: string;       // 股票代码
    date: Date;         // 分红日期
    cash: number;       // 现金分红
    bonus: number;      // 送股/转增股
    dispatch: number;   // 配股
    splite: number;     // 拆分
    price: number;      // 配股价格
}

// 读取大智慧分红文件并解析为 DividendRecord 数组
function readDzhDividend(filePath: string): DividendRecord[] {
    const data = fs.readFileSync(filePath); // 读取二进制文件
    const result: DividendRecord[] = [];

    let pos = 8; // 跳过文件头部8字节
    let currentCode = '';

    // 每条记录120字节，循环读取
    while (pos + 120 <= data.length) {
        const block = data.slice(pos, pos + 120);
        pos += 120;

        const tag = block.readInt32LE(0); // 前4字节为tag
        if (tag === -1) {
            // tag为-1时，表示后面跟着股票代码
            currentCode = iconv.decode(block.slice(6, 12), 'gbk').trim();
        } else {
            // 只处理A股（代码以0、3、6开头）
            if (!/^[036]/.test(currentCode)) continue;

            // 构造初始分红记录
            const record: DividendRecord = {
                code: currentCode,
                date: new Date(block.readInt32LE(0) * 1000), // 时间戳（秒）转Date
                cash: 0,
                bonus: 0,
                dispatch: 0,
                splite: 0,
                price: 0,
            };

            // 解析分红说明文本（中文，GBK编码）
            const desc = iconv.decode(block.slice(20, 52), 'gbk').trim();

            // 辅助函数：从说明文本中提取数字
            const extractValue = (keyword: string): number => {
                const idx = desc.indexOf(keyword);
                if (idx !== -1) {
                    const val = parseFloat(desc.substring(idx + 1, idx + 6));
                    return isNaN(val) ? 0 : val / 10; // 通常以“每10股”为单位
                }
                return 0;
            };

            // 根据关键字提取各项分红数据
            record.cash += extractValue('派');    // 派息
            record.bonus += extractValue('送');   // 送股
            record.bonus += extractValue('增');   // 转增
            record.dispatch += extractValue('股'); // 配股
            record.bonus += extractValue('价');   // 配股价
            record.cash += extractValue('红');    // 红利

            // 如果说明文本未能提取到数据，则尝试直接读取二进制字段
            if (
                record.cash === 0 &&
                record.bonus === 0 &&
                record.dispatch === 0 &&
                record.price === 0 &&
                record.splite === 0
            ) {
                record.bonus = block.readFloatLE(4);
                if (record.bonus === 0) {
                    const raw = block.readFloatLE(16);
                    record.bonus = Math.round(raw * 10000) / 10000;
                }
                if (record.bonus === 0) continue; // 仍然为0则跳过
            }
            // 大智慧的无拆股是0，而一般是用1表示无拆股，这里统一标准
            if (record.splite === 0) {
                record.splite = 1;
            }

            result.push(record);
        }
    }

    return result;
}

// 读取 data/SPLIT.PWR 文件并输出结果
const file = path.resolve('data/dzh_data/SPLIT.PWR');
const records = readDzhDividend(file);

// 写入JSON文件
const outPath = path.resolve('data/json_data/divident.json');
fs.mkdirSync(path.dirname(outPath), { recursive: true });
fs.writeFileSync(outPath, JSON.stringify(records, null, 2), 'utf-8');

console.log(`分红数据已写入: ${outPath}`);

