import axios from 'axios';
import fs from 'fs';
import path from 'path';
import { inspect } from 'util';

interface SinaStock {
  symbol: string;
  code: string;
  name: string;
}

interface StockItem {
  code: string;
  name: string;
  exchange: string;
}

/**
 * 生成500ms到1000ms之间的随机延迟。
 * @returns 随机延迟（毫秒）。
 */
function getDelay(): number {
    return Math.floor(Math.random() * 500) + 500;
}

/**
 * 根据指定类型从新浪API获取股票数据。
 * @param type - 要获取的股票类型：
 *   - 'kcb': 科创板股票。
 *   - 'hs_a': 上交所和深交所股票。
 *   - 'hs_bjs': 北交所股票。
 *   - 'cyb': 创业板股票（深圳证券交易所的一部分）。
 * @returns Promise，解析为股票项数组。
 */
async function fetchStocks(type: string): Promise<StockItem[]> {
    const stocks: StockItem[] = [];

    console.log(`开始获取类型为: ${type} 的股票...`);
    let page = 1;
    while (true) {
        console.log(`正在获取第 ${page} 页...`);
        const url = `https://vip.stock.finance.sina.com.cn/quotes_service/api/json_v2.php/Market_Center.getHQNodeData?page=${page}&num=100&sort=symbol&asc=1&node=${type}&symbol=&_s_r_a=page`;
        let resp: any;
        try {
            resp = await axios.get(url, {
                headers: {
                    'User-Agent': 'curl/8.6.0',
                    'Accept': '*/*'
                }
            });
        } catch (error: any) {
            // Axios特定：err.response包含来自服务器的响应
            if (error.response) {
                // console.error('状态:', error.response.status);
                // console.error('头部:', error.response.headers);
                // 这里打出错误响应的内容（通常是被识别出爬虫，IP被短期禁了）
                console.error(error.response.data);
            } else if (error.request) {
                // 请求已发送但未收到响应
                console.error('请求:', inspect(error.request));
            } else {
                // 设置请求时发生错误
                console.error('错误配置:', error.config);
            }
            break;
        }

        let data: SinaStock[] = [];
        try {
            /*
                resp.data 格式:
                    [{
                        symbol: 'sh688001',
                        code: '688001',
                        name: '华兴源创',
                        trade: '23.970',
                        pricechange: -0.48,
                        changepercent: -1.963,
                        buy: '23.970',
                        sell: '24.000',
                        settlement: '24.450',
                        open: '24.430',
                        high: '24.430',
                        low: '23.950',
                        volume: 1976805,
                        amount: 47574325,
                        ticktime: '15:00:01',
                        per: -21.212,
                        pb: 3.23,
                        mktcap: 1067570.689671,
                        nmc: 1067570.689671,
                        turnoverratio: 0.44385
                    }]
            */
            data = eval(resp.data);
        } catch (e) {
            try {
                data = JSON.parse(resp.data);
            } catch {
                data = [];
            }
        }
        if (!Array.isArray(data) || data.length === 0) break;
        for (const item of data) {
            const code = item.code;
            const name = item.name;
            let exchange = '';
            if (item.symbol.startsWith('sh')) exchange = 'sh';
            else if (item.symbol.startsWith('sz')) exchange = 'sz';
            else if (item.symbol.startsWith('bj')) exchange = 'bj';
            else exchange = 'unknown';
            stocks.push({ code, name, exchange });
        }
        page++;
        // 等待随机延迟以避免过快调用API
        await new Promise(resolve => setTimeout(resolve, getDelay()));
    }
    return stocks;
}

/**
 * 获取多种类型的股票列表并保存到JSON文件。
 * @param types - 股票类型数组
 * @param outputPath - 保存股票列表的JSON文件路径。
 */
async function fetchSinaStockList() {
    const allStocks: StockItem[] = [];
    const types = ['kcb', 'hs_a', 'hs_bjs', 'cyb'];

    for (const type of types) {
        const stocks = await fetchStocks(type);
        allStocks.push(...stocks);
    }

    fs.mkdirSync('data', { recursive: true });
    fs.writeFileSync(
        path.join('data', 'stock_list.json'),
        JSON.stringify(allStocks, null, 2),
        'utf-8'
    );
    console.log(`总共获取到的股票数量: ${allStocks.length}, 已保存至 data/stock_list.json`);
}

fetchSinaStockList();
