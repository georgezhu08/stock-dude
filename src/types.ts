// 股票日线数据类型
export interface StockDaily {
    date: string;       // 日期
    open: number;       // 开盘价
    high: number;       // 最高价
    low: number;        // 最低价
    close: number;      // 收盘价
    turnover: number;   // 成交额
    volume: number;     // 成交量
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
