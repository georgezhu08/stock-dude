import { describe, it, expect } from 'vitest';
import { readDayFile } from '../src/convert_tdx_to_json.js';
import fs from 'fs/promises';
import path from 'path';

interface DividendRecord {
    code: string;
    date: Date;
    cash: number;
    bonus: number;
    dispatch: number;
    splite: number;
    price: number;
}

// 生成模拟 .day 文件
async function createTestDayFile(filePath: string) {
    const buf = Buffer.alloc(32 * 3); // 3 条日线记录

    const writeDay = (
        index: number,
        yyyymmdd: number,
        open: number,
        high: number,
        low: number,
        close: number,
        amount: number,
        volume: number
    ) => {
        const offset = index * 32;
        buf.writeInt32LE(yyyymmdd, offset);
        buf.writeInt32LE(Math.round(open * 100), offset + 4);
        buf.writeInt32LE(Math.round(high * 100), offset + 8);
        buf.writeInt32LE(Math.round(low * 100), offset + 12);
        buf.writeInt32LE(Math.round(close * 100), offset + 16);
        buf.writeInt32LE(Math.round(amount * 100), offset + 20);
        buf.writeInt32LE(volume, offset + 24);
    };

    // 日线数据：前一天10元，除息后为9.9元，第三天为10.2
    writeDay(0, 20240103, 10, 10, 10, 10, 10000, 1000);
    writeDay(1, 20240104, 9.9, 9.9, 9.9, 9.9, 9900, 1000); // 除息日
    writeDay(2, 20240105, 10.2, 10.2, 10.2, 10.2, 10200, 1000);

    await fs.writeFile(filePath, buf);
}

describe('readDayFile() 读取日线数据并复权', async () => {
    const tmpFile = '/tmp/test_day_file.day';
    await createTestDayFile(tmpFile);

    const dividends: DividendRecord[] = [
        {
            code: '600000.SH',
            date: new Date('2024-01-04'),
            cash: 1.0,      // 每10股分1元，即每股0.1元
            bonus: 0.0,
            dispatch: 0.0,
            splite: 1.0,
            price: 0.0
        }
    ];

    it('未复权', async () => {
        const data = await readDayFile(tmpFile, dividends, '600000.SH', 'none');
        expect(data[0].close).toBe(10);
        expect(data[1].close).toBe(9.9);
        expect(data[2].close).toBe(10.2);
    });

    it('前复权', async () => {
        const data = await readDayFile(tmpFile, dividends, '600000.SH', 'qfq');
        expect(data[0].close).toBeCloseTo(9.9, 2);     // 10 调低到 9.9
        expect(data[1].close).toBeCloseTo(9.9, 2);     // 除息日不动
        expect(data[2].close).toBeCloseTo(10.2, 2);    // 不动
    });

    it('后复权', async () => {
        const data = await readDayFile(tmpFile, dividends, '600000.SH', 'hfq');
        expect(data[0].close).toBeCloseTo(10, 2);       // 除息日前不动
        expect(data[1].close).toBeCloseTo(10, 2);       // 除息日, 9.9 -> 10.0
        expect(data[2].close).toBeCloseTo(10.3, 2);     // 除息日后调高，10.2 -> 10.3
    });

});
