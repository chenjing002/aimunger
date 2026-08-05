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
     * 万科A 有息负债及结构
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
    /**
     * 万科A 合同负债
     *
     * Visualization: Bar chart showing contract liabilities trend
     *
     * Columns:
     *   0: 年份
     *   1: 合同负债（亿元）
     */
    '万科A 合同负债': function(data) {
        // Data in file is newest-first; reverse for chronological display
        const rows = data.rows.slice().reverse();
        const years = rows.map(r => String(r[0]));
        const values = rows.map(r => r[1]);

        return {
            tooltip: {
                trigger: 'axis',
                backgroundColor: PALETTE.surface,
                borderColor: PALETTE.border,
                textStyle: { color: PALETTE.tx1, fontSize: 13 },
                formatter: function(params) {
                    const p = params[0];
                    return '<b style="color:' + PALETTE.tx1 + '">' + p.axisValue + '</b><br/>'
                        + p.marker + ' 合同负债: ' + p.value.toLocaleString() + ' 亿元';
                }
            },
            grid: {
                top: 36,
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
            yAxis: {
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
            series: [
                {
                    name: '合同负债',
                    type: 'bar',
                    data: values,
                    itemStyle: { color: PALETTE.blue, borderRadius: [3, 3, 0, 0] },
                    barMaxWidth: 40,
                    label: {
                        show: true,
                        position: 'top',
                        distance: 4,
                        formatter: function(p) { return Math.round(p.value).toLocaleString(); },
                        fontSize: 10,
                        color: PALETTE.tx2
                    }
                }
            ]
        };
    },

    '万科A 房地产开发及相关资产经营业务毛利率': function(data) {
        // Data in file is newest-first; reverse for chronological display
        var rows = data.rows.slice().reverse();
        var years = rows.map(function(r) { return String(r[0]).replace('年', '').trim(); });
        var values = rows.map(function(r) { return r[1]; });

        return {
            tooltip: {
                trigger: 'axis',
                backgroundColor: PALETTE.surface,
                borderColor: PALETTE.border,
                textStyle: { color: PALETTE.tx1, fontSize: 13 },
                formatter: function(params) {
                    var p = params[0];
                    return '<b style="color:' + PALETTE.tx1 + '">' + p.axisValue + '</b><br/>'
                        + p.marker + ' 毛利率: ' + p.value + '%';
                }
            },
            grid: {
                top: 36,
                left: 10,
                right: 10,
                bottom: 10,
                containLabel: true
            },
            xAxis: {
                type: 'category',
                data: years,
                boundaryGap: false,
                axisLabel: { fontSize: 12, color: PALETTE.tx2 },
                axisLine: { lineStyle: { color: PALETTE.grid } },
                axisTick: { lineStyle: { color: PALETTE.grid } }
            },
            yAxis: {
                type: 'value',
                name: '毛利率',
                nameTextStyle: { fontSize: 11, color: PALETTE.tx3 },
                axisLabel: {
                    fontSize: 11,
                    color: PALETTE.tx2,
                    formatter: '{value}%'
                },
                axisLine: { show: false },
                axisTick: { show: false },
                splitLine: { lineStyle: { color: PALETTE.grid } }
            },
            series: [
                {
                    name: '毛利率',
                    type: 'line',
                    data: values,
                    smooth: false,
                    symbol: 'circle',
                    symbolSize: 8,
                    lineStyle: { width: 2.5, color: PALETTE.orange },
                    itemStyle: { color: PALETTE.orange, borderColor: PALETTE.surface, borderWidth: 2 },
                    areaStyle: {
                        color: {
                            type: 'linear', x: 0, y: 0, x2: 0, y2: 1,
                            colorStops: [
                                { offset: 0, color: 'rgba(212, 70, 39, 0.18)' },
                                { offset: 1, color: 'rgba(212, 70, 39, 0.02)' }
                            ]
                        }
                    },
                    label: {
                        show: true,
                        position: 'top',
                        distance: 6,
                        formatter: '{c}%',
                        fontSize: 11,
                        color: PALETTE.tx2
                    }
                }
            ]
        };
    },

    '中国居民个人住房贷款余额': function(data) {
        var rows = data.rows.slice().reverse();
        var years = rows.map(function(r) { return String(r[0]).replace('年', ''); });
        var values = rows.map(function(r) { return r[1]; });

        return {
            tooltip: {
                trigger: 'axis',
                backgroundColor: PALETTE.surface,
                borderColor: PALETTE.border,
                textStyle: { color: PALETTE.tx1, fontSize: 13 },
                formatter: function(params) {
                    var p = params[0];
                    return '<b style="color:' + PALETTE.tx1 + '">' + p.axisValue + '</b><br/>'
                        + p.marker + ' 个人住房贷款余额: ' + p.value + ' 万亿元';
                }
            },
            grid: {
                top: 36,
                left: 10,
                right: 10,
                bottom: 10,
                containLabel: true
            },
            xAxis: {
                type: 'category',
                data: years,
                axisLabel: { fontSize: 11, color: PALETTE.tx2, interval: 1 },
                axisLine: { lineStyle: { color: PALETTE.grid } },
                axisTick: { lineStyle: { color: PALETTE.grid } }
            },
            yAxis: {
                type: 'value',
                name: '万亿元',
                nameTextStyle: { fontSize: 11, color: PALETTE.tx3 },
                axisLabel: {
                    fontSize: 11,
                    color: PALETTE.tx2
                },
                axisLine: { show: false },
                axisTick: { show: false },
                splitLine: { lineStyle: { color: PALETTE.grid } }
            },
            series: [
                {
                    name: '个人住房贷款余额',
                    type: 'bar',
                    data: values,
                    itemStyle: { color: PALETTE.purple, borderRadius: [3, 3, 0, 0] },
                    barMaxWidth: 36,
                    label: {
                        show: true,
                        position: 'top',
                        distance: 4,
                        formatter: function(p) { return p.value; },
                        fontSize: 10,
                        color: PALETTE.tx2
                    }
                }
            ]
        };
    },

    '万科A 有息负债及结构': function(data) {
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
    },

    /**
     * 万物云住宅物业及物业设施管理项目数与饱和收入
     *
     * Tidy/long-format source: each row is
     *   [业务服务, 年份, 指标, 数值, 单位]
     * across 2 segments × 2 years × 4 metrics (two unit families).
     *
     * Visualization: focuses on the operative "under management" figures —
     * grouped bars for 在管项目饱和收入 (2024 vs 2025, left axis, 百万元) plus a
     * line per year for 在管项目数量 (right axis, 个). x-axis = the two segments.
     * Contracted (合约) figures live in the full table beneath the chart.
     */
    '万物云住宅物业及物业设施管理项目数与饱和收入': function(data) {
        var segments = ['住宅物业服务', '物业及设施管理服务'];
        var INCOME = '在管项目饱和收入';
        var COUNT = '在管项目数量';

        // Pivot the long table: value for a (segment, year, metric) cell.
        function val(seg, year, metric) {
            for (var i = 0; i < data.rows.length; i++) {
                var r = data.rows[i];
                if (r[0] === seg && Number(r[1]) === year && r[2] === metric) return r[3];
            }
            return null;
        }
        function seriesFor(year, metric) {
            return segments.map(function(s) { return val(s, year, metric); });
        }

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
                    var tip = '<b style="color:' + PALETTE.tx1 + '">' + params[0].axisValue + '</b><br/>';
                    params.forEach(function(p) {
                        var unit = p.seriesType === 'bar' ? ' 百万元' : ' 个';
                        var v = (p.value === null || p.value === undefined) ? '—' : p.value.toLocaleString();
                        tip += p.marker + ' ' + p.seriesName + ': ' + v + unit + '<br/>';
                    });
                    return tip;
                }
            },
            legend: {
                data: ['饱和收入 2024', '饱和收入 2025', '项目数量 2024', '项目数量 2025'],
                top: 0,
                textStyle: { color: PALETTE.tx2, fontSize: 12 },
                itemWidth: 14,
                itemHeight: 10,
                itemGap: 16
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
                data: segments,
                axisLabel: { fontSize: 12, color: PALETTE.tx2 },
                axisLine: { lineStyle: { color: PALETTE.grid } },
                axisTick: { lineStyle: { color: PALETTE.grid } }
            },
            yAxis: [
                {
                    type: 'value',
                    name: '百万元',
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
                    name: '项目数（个）',
                    nameTextStyle: { fontSize: 11, color: PALETTE.tx3 },
                    axisLabel: {
                        fontSize: 11,
                        color: PALETTE.tx2,
                        formatter: function(v) { return v.toLocaleString(); }
                    },
                    axisLine: { show: false },
                    axisTick: { show: false },
                    splitLine: { show: false }
                }
            ],
            series: [
                {
                    name: '饱和收入 2024',
                    type: 'bar',
                    data: seriesFor(2024, INCOME),
                    itemStyle: { color: PALETTE.amber, borderRadius: [3, 3, 0, 0] },
                    barMaxWidth: 46
                },
                {
                    name: '饱和收入 2025',
                    type: 'bar',
                    data: seriesFor(2025, INCOME),
                    itemStyle: { color: PALETTE.orange, borderRadius: [3, 3, 0, 0] },
                    barMaxWidth: 46
                },
                {
                    name: '项目数量 2024',
                    type: 'line',
                    yAxisIndex: 1,
                    data: seriesFor(2024, COUNT),
                    symbol: 'circle',
                    symbolSize: 8,
                    lineStyle: { width: 2, color: PALETTE.blue, type: 'dashed' },
                    itemStyle: { color: PALETTE.blue, borderColor: PALETTE.surface, borderWidth: 2 }
                },
                {
                    name: '项目数量 2025',
                    type: 'line',
                    yAxisIndex: 1,
                    data: seriesFor(2025, COUNT),
                    symbol: 'circle',
                    symbolSize: 9,
                    lineStyle: { width: 2.5, color: PALETTE.blue },
                    itemStyle: { color: PALETTE.blue, borderColor: PALETTE.surface, borderWidth: 2 },
                    label: {
                        show: true,
                        position: 'top',
                        distance: 6,
                        formatter: function(p) { return p.value === null ? '' : p.value.toLocaleString(); },
                        fontSize: 10,
                        color: PALETTE.blue
                    }
                }
            ]
        };
    },

    /**
     * 万科A 存货情况
     *
     * Source table (amounts in 万元): row 0 is the 存货 total; rows 1–4 are its
     * components (完工开发产品 / 在建开发产品 / 拟开发土地 / 其他), which sum to it.
     *
     * Columns:
     *   0: 项目
     *   1: 2025 年末金额（万元）
     *   2: 2025 占总资产比重 (%)
     *   3: 2024 年末金额（万元）
     *   4: 2024 占总资产比重 (%)
     *
     * Visualization: two stacked bars (2024 年末 vs 2025 年末), each stacked by
     * the four components, in 亿元. A phantom top series carries the stack total
     * label so the overall inventory decline reads at a glance.
     */
    '万科A 存货情况': function(data) {
        // 万元 → 亿元, one decimal
        var toYi = function(v) { return Math.round(v / 1000) / 10; };
        var years = ['2024 年末', '2025 年末'];
        var components = data.rows.slice(1); // drop the 存货 total row
        var colors = [PALETTE.amber, PALETTE.orange, PALETTE.purple, PALETTE.green];
        var names = components.map(function(r) { return String(r[0]).replace(/^其中：/, ''); });
        var totals = [toYi(data.rows[0][3]), toYi(data.rows[0][1])];

        var series = components.map(function(r, i) {
            var isTop = i === components.length - 1;
            return {
                name: names[i],
                type: 'bar',
                stack: 'inv',
                data: [toYi(r[3]), toYi(r[1])], // [2024, 2025]
                itemStyle: {
                    color: colors[i % colors.length],
                    borderRadius: isTop ? [3, 3, 0, 0] : 0
                },
                barMaxWidth: 96
            };
        });

        // Phantom zero-height segment on top of the stack to carry the total label.
        series.push({
            name: '合计',
            type: 'bar',
            stack: 'inv',
            data: [0, 0],
            itemStyle: { color: 'transparent' },
            silent: true,
            tooltip: { show: false },
            label: {
                show: true,
                position: 'top',
                distance: 6,
                formatter: function(p) { return totals[p.dataIndex].toLocaleString() + ' 亿'; },
                fontSize: 12,
                fontWeight: 600,
                color: PALETTE.tx1
            }
        });

        return {
            tooltip: {
                trigger: 'axis',
                axisPointer: { type: 'shadow' },
                backgroundColor: PALETTE.surface,
                borderColor: PALETTE.border,
                textStyle: { color: PALETTE.tx1, fontSize: 13 },
                formatter: function(params) {
                    var bars = params.filter(function(p) { return p.seriesName !== '合计'; });
                    var tip = '<b style="color:' + PALETTE.tx1 + '">' + params[0].axisValue + '</b><br/>';
                    var total = 0;
                    bars.forEach(function(p) {
                        tip += p.marker + ' ' + p.seriesName + ': '
                            + p.value.toLocaleString() + ' 亿元<br/>';
                        total += p.value;
                    });
                    tip += '<span style="display:inline-block;width:10px;height:10px;border-radius:50%;background:'
                        + PALETTE.tx3 + ';margin-right:5px"></span>'
                        + '存货合计: ' + (Math.round(total * 10) / 10).toLocaleString() + ' 亿元';
                    return tip;
                }
            },
            legend: {
                data: names,
                top: 0,
                textStyle: { color: PALETTE.tx2, fontSize: 12 },
                itemWidth: 14,
                itemHeight: 10,
                itemGap: 16
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
            yAxis: {
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
            series: series
        };
    }

};
