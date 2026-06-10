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
 * Palette
 *
 * Neutrals (from site chartTheme):
 *   bg:      #fbf7f2  (page background)
 *   surface: #ffffff
 *   tx1:     #1a1a1a  (primary text)
 *   tx2:     #6f625b  (muted text)
 *   tx3:     #b9b0aa  (context / very muted)
 *   grid:    #e8ded6
 *   axis:    #b8aaa1
 *   border:  #ddd0c7
 *
 * Categorical (6 hues):
 *   purple:  #774FA0  rgb(119,  79, 160)
 *   amber:   #EFB743  rgb(239, 183,  67)
 *   orange:  #D44627  rgb(212,  70,  39)
 *   crimson: #E72F52  rgb(231,  47,  82)
 *   blue:    #0D95D0  rgb( 13, 149, 208)
 *   green:   #7DC462  rgb(125, 196,  98)
 */
var PALETTE = {
    bg:      '#fbf7f2',
    surface: '#ffffff',
    tx1:     '#1a1a1a',
    tx2:     '#6f625b',
    tx3:     '#b9b0aa',
    grid:    '#e8ded6',
    axis:    '#b8aaa1',
    border:  '#ddd0c7',

    purple:  '#774FA0',
    amber:   '#EFB743',
    orange:  '#D44627',
    crimson: '#E72F52',
    blue:    '#0D95D0',
    green:   '#7DC462',

    // site brand red (kept for non-categorical use)
    red:     '#8b2500'
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
                    lineStyle: { color: PALETTE.grid }
                },
                backgroundColor: PALETTE.surface,
                borderColor: PALETTE.border,
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
                axisLine: { lineStyle: { color: PALETTE.grid } },
                axisTick: { lineStyle: { color: PALETTE.grid } }
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
                    splitLine: { lineStyle: { color: PALETTE.grid } }
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
                    itemStyle: { color: PALETTE.amber, borderRadius: 0 },
                    barMaxWidth: 40
                },
                {
                    name: '一年以上',
                    type: 'bar',
                    stack: 'debt',
                    data: longTerm,
                    itemStyle: { color: PALETTE.orange, borderRadius: [3, 3, 0, 0] },
                    barMaxWidth: 40
                },
                {
                    name: '占总资产比例',
                    type: 'line',
                    yAxisIndex: 1,
                    data: assetRatio,
                    symbol: 'circle',
                    symbolSize: 8,
                    lineStyle: { width: 2.5, color: PALETTE.blue },
                    itemStyle: { color: PALETTE.blue, borderColor: PALETTE.surface, borderWidth: 2 },
                    label: {
                        show: true,
                        position: 'top',
                        distance: 6,
                        formatter: '{c}%',
                        fontSize: 11,
                        color: PALETTE.blue,
                        fontWeight: 600,
                        backgroundColor: PALETTE.surface,
                        borderColor: PALETTE.blue,
                        borderWidth: 1,
                        borderRadius: 3,
                        padding: [2, 5]
                    }
                }
            ]
        };
    }

};
