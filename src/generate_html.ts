import fs from 'fs/promises';
import path from 'path';

export async function generateSummaryHtml(summaryPath: string, htmlDir: string, tradeDir: string) {
    const htmlFile = path.join(htmlDir, 'index.html');
    let summaryList;
    try {
        const content = await fs.readFile(summaryPath, 'utf-8');
        summaryList = JSON.parse(content) as Array<{
            code: string;
            name: string;
            exchange: string;
            tradeCount: number;
            totalReturnPct: number;
            avgReturnPct: number;
            totalHoldDays: number;
        }>;
    } catch (e) {
        console.error('Unable to read summary data:', e);
        return;
    }
    summaryList.sort((a, b) => b.avgReturnPct - a.avgReturnPct);
    const now = new Date();
    const genTime = `${now.getFullYear()}-${String(now.getMonth() + 1).padStart(2, '0')}-${String(now.getDate()).padStart(2, '0')} ` +
        `${String(now.getHours()).padStart(2, '0')}:${String(now.getMinutes()).padStart(2, '0')}:${String(now.getSeconds()).padStart(2, '0')}`;

    // Keep only the table
    const stockDetails: Record<string, string> = {};
    for (const row of summaryList) {
        let trades = [];
        try {
            const tradeFile = path.join(tradeDir, `${row.exchange}${row.code}.json`);
            const tradeContent = await fs.readFile(tradeFile, 'utf-8');
            trades = JSON.parse(tradeContent);
        } catch { }
        // 增加 data-img 属性，指向对应K线图
        stockDetails[`${row.exchange}${row.code}`] = `
  <table>
    <thead>
      <tr>
        <th>Buy Date</th><th>Buy Price</th><th>Sell Date</th><th>Sell Price</th><th>Hold Days</th><th>Return Rate (%)</th>
      </tr>
    </thead>
    <tbody>
      ${trades.map((t: any) => {
        // 正确的K线图路径：images/交易所+股票代码/交易所+股票代码_买入日期_卖出日期.png
        const imgPath = `images/${row.exchange}${row.code}/${row.exchange}${row.code}_${t.buyDate}_${t.sellDate}.png`;
        return `
        <tr class="trade-row" data-img="${imgPath}">
          <td>${t.buyDate}</td>
          <td>${t.buyPrice}</td>
          <td>${t.sellDate}</td>
          <td>${t.sellPrice}</td>
          <td>${t.holdDays}</td>
          <td class="${t.returnPct >= 0 ? 'pos' : 'neg' }" style="color: ${t.returnPct >= 0 ? 'red' : 'green'}">${t.returnPct.toFixed(2)}</td>
        </tr>`;
      }).join('')}
    </tbody>
  </table>
        `;
    }

    const firstStock = summaryList[0];
    const firstId = `detail-${firstStock.exchange}${firstStock.code}`;
    const firstTitle = `${firstStock.exchange}${firstStock.code} ${firstStock.name} Backtest Details`;

    const htmlContent = `<!DOCTYPE html>
<html lang="en">
<head>
  <meta charset="UTF-8">
  <title>Stock Backtest Summary</title>
  <style>
    html, body {
      height: 100%;
      margin: 0;
      padding: 0;
      box-sizing: border-box;
    }
    body {
      height: 100vh;
      width: 100vw;
      font-family: Arial, sans-serif;
      background: #f8f8f8;
      box-sizing: border-box;
      overflow: hidden;
    }
    .root {
      height: 100vh;
      display: flex;
      flex-direction: column;
    }
    .header {
      flex: 0 0 auto;
      display: flex;
      flex-direction: row;
      align-items: flex-end;
      justify-content: space-between;
      padding: 0 2em 0 2em;
      height: 4.5em;
      min-height: 64px;
      background: #f8f8f8;
      border-bottom: 1px solid #e0e0e0;
      box-sizing: border-box;
    }
    .main-title {
      color: #333;
      font-size: 2em;
      font-weight: bold;
      letter-spacing: 2px;
      margin: 1.2em 0 0.5em 0;
    }
    .gentime {
      color: #888;
      font-size: 0.95em;
      margin: 0 0 1em 0;
      position: absolute;
      left: 2.5em; top: 3.2em;
    }
    .detail-title {
      color: #004080;
      font-size: 1.12em;
      font-weight: 600;
      letter-spacing: 1px;
      margin: 1.4em 0 0.8em 0;
      white-space: nowrap;
      overflow: hidden;
      text-overflow: ellipsis;
      max-width: 60vw;
      text-align: right;
    }
    .container {
      flex: 1 1 auto;
      display: flex;
      flex-direction: row;
      min-height: 0;
      min-width: 0;
      width: 100vw;
      margin-bottom: 40px;
      box-sizing: border-box;
    }
    .left, .right {
      height: 100%;
      box-sizing: border-box;
    }
    .left {
      width: 50vw;
      min-width: 350px;
      max-width: 50vw;
      overflow-y: auto;
      overflow-x: hidden;
      padding: 2em 1em 0 2em;
      background: none;
    }
    .right {
      width: 50vw;
      max-width: 50vw;
      min-width: 350px;
      background: #fff;
      border-left: 1px solid #ccc;
      overflow-y: auto;
      overflow-x: hidden;
      padding: 2em 2em 0 2em;
      display: flex;
      flex-direction: column;
      height: 100%;
    }
    table { border-collapse: collapse; width: 100%; background: #fff;}
    th, td { border: 1px solid #ccc; padding: 8px 12px; text-align: right;}
    th { background: #eee; color: #222;}
    td:first-child, th:first-child { text-align: right;}
    tr:nth-child(even) { background: #f4f4f4;}
    .pos { color: #d00;}
    .neg { color: #008800;}
    tr.stock-row { cursor: pointer;}
    tr.stock-row:hover { background: #dbefff !important;}
    .detail-block { display: none; width: 100%; }
    @media (max-width: 900px) {
      .main-title, .detail-title { font-size: 1em; }
      .header { flex-direction: column; align-items: flex-start; }
    }
  </style>
</head>
<body>
  <div class="root">
    <div class="header">
      <div>
        <div class="main-title">Stock Backtest Summary</div>
        <div class="gentime">Generated Time: ${genTime}</div>
      </div>
      <div class="detail-title" id="detailTitle">${firstTitle}</div>
    </div>
    <div class="container">
      <div class="left">
        <table><thead><tr><th>Index</th><th>Code</th><th>Name</th><th>Trade Count</th><th>Total Return (%)</th><th>Average Return (%)</th><th>Total Holding Days</th></tr></thead><tbody>
        ${summaryList.map((row, idx) => `
          <tr class='stock-row' data-code='${row.code}' data-exchange='${row.exchange}' data-title='${row.exchange}${row.code} ${row.name} Backtest Details'>
            <td>${idx + 1}</td>
            <td>${row.exchange}${row.code}</td>
            <td>${row.name}</td>
            <td>${row.tradeCount}</td>
            <td class="${row.totalReturnPct >= 0 ? 'pos' : 'neg'}">${row.totalReturnPct.toFixed(2)}</td>
            <td class="${row.avgReturnPct >= 0 ? 'pos' : 'neg'}">${row.avgReturnPct.toFixed(2)}</td>
            <td>${row.totalHoldDays}</td>
          </tr>`).join('')}
        </tbody></table>
      </div>
      <div class="right">
        ${summaryList.map((row, idx) => {
    const id = `detail-${row.exchange}${row.code}`;
    return `<div id="${id}" class="detail-block" style="display:${idx === 0 ? 'block' : 'none'}; width:100%; height:100%; position:relative;">
      <div class="kline-fixed">
        <img class="kline-img" style="max-width:100%;max-height:340px;display:none;" />
        <span class="kline-placeholder">K线图预览区</span>
      </div>
      <div class="trade-scroll">
        ${stockDetails[`${row.exchange}${row.code}`]}
      </div>
    </div>`;
  }).join('')}
      </div>
    </div>
  </div>
  <script>
    // 切换股票详情
    let lastDetailId = "${firstId}";
    let lastStockRow = null;
    document.querySelectorAll('.stock-row').forEach(function(row, idx) {
      if (idx === 0) {
        row.classList.add('selected-stock');
        lastStockRow = row;
      }
      row.addEventListener('click', function() {
        var code = this.getAttribute('data-code');
        var exchange = this.getAttribute('data-exchange');
        var id = "detail-" + exchange + code;
        var title = this.getAttribute('data-title');
        if (lastDetailId !== id) {
          document.getElementById(lastDetailId).style.display = 'none';
          document.getElementById(id).style.display = 'block';
          document.getElementById('detailTitle').innerText = title;
          lastDetailId = id;
        }
        // 高亮当前股票
        if (lastStockRow) lastStockRow.classList.remove('selected-stock');
        this.classList.add('selected-stock');
        lastStockRow = this;
        // 自动高亮右侧交易表的第一行
        const detailBlock = document.getElementById(id);
        if (detailBlock) {
          const tradeRows = detailBlock.querySelectorAll('.trade-row');
          if (tradeRows.length > 0) {
            tradeRows.forEach(r => r.classList.remove('selected'));
            tradeRows[0].classList.add('selected');
            // 显示K线图
            const klineImg = detailBlock.querySelector('.kline-img');
            const klinePlaceholder = detailBlock.querySelector('.kline-placeholder');
            const imgPath = tradeRows[0].getAttribute('data-img');
            if (imgPath && klineImg) {
              klineImg.src = imgPath;
              klineImg.style.display = '';
              if (klinePlaceholder) klinePlaceholder.style.display = 'none';
            }
          }
        }
      });
    });

    // 交易行点击显示K线图并高亮
    document.querySelectorAll('.detail-block').forEach(function(block) {
      const klineImg = block.querySelector('.kline-img');
      const klinePlaceholder = block.querySelector('.kline-placeholder');
      const tradeRows = block.querySelectorAll('.trade-row');
      tradeRows.forEach(function(tr) {
        tr.addEventListener('click', function() {
          // 高亮选中行
          tradeRows.forEach(r => r.classList.remove('selected'));
          tr.classList.add('selected');
          // 显示K线图
          const imgPath = tr.getAttribute('data-img');
          if (imgPath && klineImg) {
            klineImg.src = imgPath;
            klineImg.style.display = '';
            if (klinePlaceholder) klinePlaceholder.style.display = 'none';
          }
        });
      });
      // 默认选中第一行
      if (tradeRows.length > 0) {
        tradeRows[0].classList.add('selected');
        tradeRows[0].click();
      }
    });
  </script>
  <style>
    .selected-stock {
      background: #b3e5fc !important;
    }
    .trade-row.selected {
      background: #ffe082 !important;
    }
    .right {
      width: 50vw;
      max-width: 50vw;
      min-width: 350px;
      background: #fff;
      border-left: 1px solid #ccc;
      padding: 2em 2em 0 2em;
      display: flex;
      flex-direction: column;
      height: 100%;
      box-sizing: border-box;
      overflow: hidden;
    }
    .kline-fixed {
      position: sticky;
      top: 0;
      z-index: 2;
      flex: 0 0 360px;
      height: 360px;
      border: 1px solid #ccc;
      background: #fafbfc;
      display: flex;
      align-items: center;
      justify-content: center;
      margin-bottom: 24px;
    }
    .kline-placeholder {
      color: #bbb;
    }
    .trade-scroll {
      flex: 1 1 0;
      min-height: 0;
      overflow-y: auto;
      margin-bottom: 24px;
      height: calc(100% - 384px);
    }
  </style>
</body>
</html>`;

    await fs.mkdir(htmlDir, { recursive: true });
    await fs.writeFile(htmlFile, htmlContent, 'utf-8');
    console.log(`摘要网页已保存至 ${htmlFile}`);
}
