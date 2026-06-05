/**
 * chart-configs.js
 *
 * Per-file ECharts configurations. Each key matches a filename (without .md)
 * from the data source. The value is a function that receives parsed data
 * ({ headers, rows }) and returns an ECharts option object.
 *
 * DESIGN PRINCIPLE:
 * - Data parsing is handled by generate-data.js (automatic).
 * - Chart design here is MANUAL — only change when a human reviews and adjusts.
 * - When the underlying Markdown table gains/loses rows, the chart auto-updates
 *   because the config function reads from the latest data.
 *
 * To add a new file's visualization:
 *   1. Add a new key matching the filename (without .md)
 *   2. Write a function(data) that returns an ECharts option
 *   3. Run generate-data.js to include the new file's data
 */

/**
 * Flexoki-inspired palette, anchored to site colors #8b2500 and #1a1a1a
 *
 * Neutrals (Flexoki base scale):
 *   tx-1 (primary text):  #1C1B1A  (≈ site #1a1a1a)
 *   tx-2 (secondary):     #6F6E69  (base-600)
 *   tx-3 (muted):         #878580  (base-500)
 *   ui-1 (borders):       #E6E4D9  (base-100)
 *   ui-2 (subtle bg):     #F2F0E5  (base-50)
 *   bg:                   #FFFCF0  (paper)
 *
 * Accents:
 *   red (site accent):    #8b2500  (site brand)
 *   red-light:            #AF3029  (Flexoki red-600)
 *   orange:               #DA702C  (Flexoki orange-400)
 *   orange-dark:          #BC5215  (Flexoki orange-600)
 *   yellow:               #AD8301  (Flexoki yellow-600)
 *   yellow-light:         #D0A215  (Flexoki yellow-400)
 */
var PALETTE = {
    tx1: '#1C1B1A',
    tx2: '#6F6E69',
    tx3: '#878580',
    ui1: '#E6E4D9',
    ui2: '#F2F0E5',
    bg:  '#FFFCF0',
    red:         '#8b2500',
    redLight:    '#AF3029',
    orange:      '#DA702C',
    orangeDark:  '#BC5215',
    yellow:      '#AD8301',
    yellowLight: '#D0A215'
};

const CHART_CONFIGS = {

    /**
     * 万科 A 有息负债及结构
     *
     * Visualization: Stacked bar (short-term + long-term debt) + line (debt-to-asset ratio)
     *
     * Columns:
     *   0: 年份
     *   1: 有息负债合计（亿元）
     *   2: 占总资产比例 (%)
     *   3: 一年内到期有息负债（亿元）
     *   4: 一年内占比 (%)
     *   5: 一年以上有息负债（亿元）
     *   6: 一年以上占比 (%)
     */
    '万科 A 有息负债及结构': function(data) {
        const years = data.rows.map(r => String(r[0]));
        const shortTerm = data.rows.map(r => r[3]);  // 一年内到期
        const longTerm = data.rows.map(r => r[5]);   // 一年以上
        const assetRatio = data.rows.map(r => r[2]);  // 占总资产比例

        return {
            tooltip: {
                trigger: 'axis',
                axisPointer: {
                    type: 'cross',
                    crossStyle: { color: PALETTE.tx3 },
                    lineStyle: { color: PALETTE.ui1 }
                },
                backgroundColor: PALETTE.bg,
                borderColor: PALETTE.ui1,
                textStyle: { color: PALETTE.tx1, fontSize: 13 },
                formatter: function(params) {
                    let tip = '<b style="color:' + PALETTE.tx1 + '">' + params[0].axisValue + '</b><br/>';
                    let total = 0;
                    params.forEach(function(p) {
                        if (p.seriesType === 'bar') {
                            tip += p.marker + ' ' + p.seriesName + ': '
                                + p.value.toLocaleString() + ' 亿元<br/>';
                            total += p.value;
                        } else {
                            tip += p.marker + ' ' + p.seriesName + ': '
                                + p.value + '%<br/>';
                        }
                    });
                    if (total > 0) {
                        tip += '<span style="display:inline-block;width:10px;height:10px;border-radius:50%;background:'
                            + PALETTE.tx3 + ';margin-right:5px"></span>'
                            + '有息负债合计: ' + total.toLocaleString() + ' 亿元';
                    }
                    return tip;
                }
            },
            legend: {
                data: ['一年内到期', '一年以上', '占总资产比例'],
                top: 0,
                textStyle: { color: PALETTE.tx2, fontSize: 12 },
                itemWidth: 14,
                itemHeight: 10,
                itemGap: 20
            },
            grid: {
                top: 48,
                left: 10,
                right: 10,
                bottom: 10,
                containLabel: true
            },
            xAxis: {
                type: 'category',
                data: years,
                axisLabel: { fontSize: 12, color: PALETTE.tx2 },
                axisLine: { lineStyle: { color: PALETTE.ui1 } },
                axisTick: { lineStyle: { color: PALETTE.ui1 } }
            },
            yAxis: [
                {
                    type: 'value',
                    name: '亿元',
                    nameTextStyle: { fontSize: 11, color: PALETTE.tx3 },
                    axisLabel: {
                        fontSize: 11,
                        color: PALETTE.tx2,
                        formatter: function(v) { return v.toLocaleString(); }
                    },
                    axisLine: { show: false },
                    axisTick: { show: false },
                    splitLine: { lineStyle: { color: PALETTE.ui1 } }
                },
                {
                    type: 'value',
                    name: '占总资产',
                    nameTextStyle: { fontSize: 11, color: PALETTE.tx3 },
                    axisLabel: {
                        fontSize: 11,
                        color: PALETTE.tx2,
                        formatter: '{value}%'
                    },
                    axisLine: { show: false },
                    axisTick: { show: false },
                    splitLine: { show: false }
                }
            ],
            series: [
                {
                    name: '一年内到期',
                    type: 'bar',
                    stack: 'debt',
                    data: shortTerm,
                    itemStyle: { color: PALETTE.orange, borderRadius: 0 },
                    barMaxWidth: 40
                },
                {
                    name: '一年以上',
                    type: 'bar',
                    stack: 'debt',
                    data: longTerm,
                    itemStyle: { color: PALETTE.red, borderRadius: [3, 3, 0, 0] },
                    barMaxWidth: 40
                },
                {
                    name: '占总资产比例',
                    type: 'line',
                    yAxisIndex: 1,
                    data: assetRatio,
                    symbol: 'circle',
                    symbolSize: 6,
                    lineStyle: { width: 2, color: PALETTE.yellowLight },
                    itemStyle: { color: PALETTE.yellowLight, borderColor: PALETTE.bg, borderWidth: 1.5 },
                    label: {
                        show: true,
                        formatter: '{c}%',
                        fontSize: 11,
                        color: PALETTE.yellow
                    }
                }
            ]
        };
    }

};
