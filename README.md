# stock-dude

简单股票分析软件。本软件可以按照规则对所有A股股票进行筛选，并对选出的股票进行回测，最终生成回测汇总以及具体的操作细节，供详细分析。下面是最终回测后生成的汇总图：

![image](https://github.com/user-attachments/assets/7e121a9a-d7e6-4e3d-bf75-60aa01da5fee)


## 目录结构
其中 ```data/tdx_data``` 目录需要先建立，并且将通达信数据存放于此, 其他 ```data```, ```logs``` 以及 ```result``` 等目录会自动创建.

```
|
|--data 数据
|    |
|    +--backtest 回测结果 （npm run backtest 生成）
|    |    |-- bj*.json 北交所股票
|    |    |-- sh*.json 上交所股票
|    |    |-- sz*.json 深交所股票
|    |    +-- trade_records_summary.json 回测汇总
|    |
|    +--json_data 转换后的数据 （npm run convert 生成）
|    |    |-- bj*.json 北交所股票
|    |    |-- sh*.json 上交所股票
|    |    |-- sz*.json 深交所股票
|    |    +-- selected.json 选出的股票
|    |
|    +--tdx_data 通达信原始数据 （用通达信软件导出）
|    |    |--bj 北交所
|    |    |   +--lday 日线
|    |    |--sh 上交所
|    |    |   +--lday 日线
|    |    +--sz 深交所
|    |        +--lday 日线
|    |
|    +--dzh_data 大智慧除权数据
|         +--SPLIT.PWR
|
+--logs 日志 （npm run select 生成）
|    +--selected.log 选股过程日志
|
+--result 回测结果
|    |--images
|    |    +--*.png K线图 （npm run kline 生成）
|    +--index.html 回测结果汇总 （npm run backtest 生成）
|
+--src 源码
     |--get_stock_list_sina.ts 读取股票列表
     |--convert_tdx_to_json.ts 将通达信日线数据转换为JSON格式数据
     |--select_stock.ts 选取股票
     |--backtest.ts 回测选出的股票
     |--generate_html.ts 根据回测结果生成静态页面
     +--generate_kline.ts 根据回测结果生成交易K线图

```



## 使用说明

### 1. 安装依赖

```
npm install
```

### 2. 运行

运行次序：

```
npm run getlist   (获取最新的股票列表)
npm run divident  (将大智慧除权数据转换为JSON格式)
npm run convert   (将通达信日线数据转换为JSON格式)
npm run select    (按照策略选择股票)
npm run backtest  (回测选中的股票)
npm run kline     (生成回测的所有交易的K线图)
```
如果想一次执行完所有步骤（事先已经把通达信数据准备好）:
```
npm run all
```

下面是每个命令对应的细节。


#### 2.1 获取股票列表

执行命令：

```
npm run getlist
```
- 生成的股票列表保存在 ```data/stock_list.json``` 文件中。
- 如果已经存在股票列表文件，可以不做这一步，只是会缺少从上次获取列表到当前日期期间发行的新股。
- 股票列表是从新浪接口读取，为了避免过于频繁请求而被新浪网站屏蔽，每次读取后会稍作暂停，```getDelay()``` 返回每次读取一页后暂停的时间，单位是毫秒。

#### 2.2 将通达信数据转换为JSON格式
- 在转换前，需要使用通达信数据导出功能，将日线数据导出，导出数据存在```vipdoc```目录下，其中沪市存在 ```sh``` 子目录，深市存在 ```sz``` 子目录，北市存在 ```bj``` 子目录，每个目录中包含多种类型数据，需要将三个子目录复制到 ```data/tdx_data``` 目录中。

- 转换是增量式的，不会删除数据。原文件数据无论时间先后，都会依序合并成一个数据集；比如说可以先导入2021-2025数据，再导入1993-2010的数据，再导入2011-2020的数据，可以采取任意次序。

- 转换程序可以多次执行，允许原文件有重复数据；例如先导入2021-2025数据，再导入2020-2021数据，尽管2021数据重复，也不会影响结果。

执行命令：
```
npm run convert
```
- 转换后的文件存放在 ```data/json_data``` 目录中，格式如下：
```
[{
    data: 日期,
    open: 开盘价,
    high: 最高价,
    low: 最低价,
    close: 收盘价,
    turnover: 成交额,
    volumn: 成交量
}]
```


- 可能会看到一些“未知名称”，这些是债券之类的，如果有兴趣，可以自行修改```getStock_list_sina.ts```文件，增加缺失的内容。

- 导出后可以删除通达信原文件，之后每天收盘后，将生成的当日数据复制到```tdx_data```中，再次运行转换程序，就能导入新增的数据。

#### 2.3 按照规则选股

有了前面转换后的JSON股票数据后，就可以开始选股，执行命令：

```
npm run select
```
- 选出的个股存放在 ```data/json_data/selected.json``` 文件中。

**注意**：需要自己设计选股策略，根据需要修改脚本```select_stock.ts```，并同步修改回测脚本```backtest.ts```，代码中只是示范，按照下面规则选股：

##### 买入规则：

* 价格趋势确认：当前收盘价高于5日、10日、250日均线，且5日/10日均线向上
* 放量突破：当日成交量大于最近5日均量1.5倍，且为阳线，且收盘价为近20日新高
* 排除异动股：最近5日无连续3个涨停，且非ST股

##### 卖出规则

* 收盘价跌破10日均线

#### 2.4 回测

选出股票后，才能进行回测，因为回测需要读取```selected.json```文件，执行命令：

```
npm run backtest
```
- 回测结果存放在 ```data/backtest```，每个股票一个文件, 格式如下：
```
[{
    code: 股票代码,
    name: 股票名称,
    buyDate: 买入日期,
    sellDate: 卖出日期,
    buyPrice: 买入价,
    sellPrice: 卖出价,
    holdDays: 持有天数,
    returnPct: 收益率（百分比）
}]
```

- 同时会生成一个汇总的JSON文件 ```data/backtest/trade_records_symmary.json```，以及静态页面 ```result/index.html```，静态页面中包含了每个股票的交易细节。

#### 2.4 生成K线图
后期考虑接入在线实时K线，目前先临时用日线数据绘制交易时段的K线图，时段包括了交易时段前后各15交易日的额外数据，执行命令：
```
npm run kline
```
生成的K线图存放在```result/images```目录中，每个回测股票的K线图在各自的目录中，目录名是```交易所股票代码```，例如：```sh600600```。K线图文件名是```交易所股票代码_买入时间_卖出时间.png```，例如：```bj837748_2023-11-14_2023-12-01.png```。

