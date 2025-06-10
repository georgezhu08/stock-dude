// 股票日线数据类型
export interface StockDaily {
    date: string;         // 日期
    open: number;         // 开盘价
    high: number;         // 最高价
    low: number;          // 最低价
    close: number;        // 收盘价
    turnover: number;     // 成交额
    volume: number;       // 成交量
    avgCost60?: number | null; // 60日平均成本（可选）
    avgPositionCost?: number | null; // 平均持仓成本（可选）
    profitRatio?: number | null;     // 获利盘比例（可选，0-1之间）
    chipConcentration90?: number | null; // 90%筹码集中度（可选）
    chipRange90?: [number, number] | null; // 90%筹码价格分布范围（可选，区间：[最低价, 最高价]）
};

// 回测交易记录类型
export interface TradeRecord {
    code: string;       // 股票代码
    name: string;       // 股票名称
    buyDate: string;    // 买入日期  
    sellDate: string;   // 卖出日期
    buyPrice: number;   // 买入价格
    sellPrice: number;  // 卖出价格
    holdDays: number;   // 持有天数
    returnPct: number;  // 收益率百分比
}
