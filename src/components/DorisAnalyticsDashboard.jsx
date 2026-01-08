import React, { useState, useEffect } from 'react';
import {
    BarChart, Bar, LineChart, Line, XAxis, YAxis, CartesianGrid, Tooltip, Legend, ResponsiveContainer,
    ComposedChart, Area
} from 'recharts';
import {
    Filter, Calendar, Hash, LayoutDashboard, Smartphone,
    Tag, DollarSign, Layers, Globe, MousePointer2, Download, RefreshCw, ServerOff, CheckCircle2
} from 'lucide-react';

// --- 模拟数据生成器 (作为后备方案) ---
const generateMockData = () => {
    const data = [];
    const publishers = ['Pub_A', 'Pub_B', 'Pub_C', 'Pub_D', 'Pub_E', 'Google_Ads', 'FB_Audience'];
    const bundles = ['com.game.rpg', 'com.app.utility', 'com.social.chat', 'com.news.daily', 'com.video.stream'];
    const brands = ['Apple', 'Samsung', 'Xiaomi', 'Huawei', 'Oppo'];
    const models = ['iPhone 13', 'iPhone 14 Pro', 'Galaxy S22', 'Redmi Note 11', 'P50 Pro'];
    const adTypes = ['Banner', 'Interstitial', 'Rewarded Video', 'Native'];
    const bidFloors = [0.1, 0.5, 1.0, 2.5, 5.0];
    const offerIds = [1001, 1002, 1003, 1004];

    for (let i = 0; i < 7; i++) {
        const date = new Date();
        date.setDate(date.getDate() - i);
        const dt = date.toISOString().split('T')[0];
        for (let j = 0; j < 100; j++) {
            const clicks = Math.floor(Math.random() * 500) + 10;
            const installs = Math.floor(clicks * (Math.random() * 0.05 + 0.001));
            const events = Math.floor(installs * (Math.random() * 0.7 + 0.1));
            const revenues = events * (Math.random() * 2 + 0.5);
            data.push({
                id: `${i}-${j}`, dt, offer_id: offerIds[Math.floor(Math.random() * offerIds.length)],
                publisher: publishers[Math.floor(Math.random() * publishers.length)],
                bundle: bundles[Math.floor(Math.random() * bundles.length)],
                brand: brands[Math.floor(Math.random() * brands.length)],
                model: models[Math.floor(Math.random() * models.length)],
                ad_type: adTypes[Math.floor(Math.random() * adTypes.length)],
                bid_floor: bidFloors[Math.floor(Math.random() * bidFloors.length)],
                clicks, installs, events, revenues
            });
        }
    }
    return data;
};

const toDateInputValue = (date) => date.toISOString().split('T')[0];

const getDefaultDateRange = (days) => {
    const end = new Date();
    const start = new Date();
    start.setDate(end.getDate() - Math.max(days - 1, 0));
    return { start: toDateInputValue(start), end: toDateInputValue(end) };
};

const normalizeSummary = (summary) => {
    const clicks = Number(summary?.clicks || 0);
    const installs = Number(summary?.installs || 0);
    const events = Number(summary?.events || 0);
    const revenues = Number(summary?.revenues || 0);
    return {
        clicks,
        installs,
        events,
        revenues,
        cvr: clicks > 0 ? (installs / clicks) * 10000 : 0,
        evr: installs > 0 ? (events / installs) * 100 : 0,
    };
};

const normalizeAggregated = (rows) => rows.map((item) => {
    const clicks = Number(item.clicks || 0);
    const installs = Number(item.installs || 0);
    const events = Number(item.events || 0);
    const revenues = Number(item.revenues || 0);
    return {
        ...item,
        dimensionKey: item.dimensionKey ?? item.dimension_key ?? 'Unknown',
        clicks,
        installs,
        events,
        revenues,
        cvr: clicks > 0 ? (installs / clicks) * 10000 : 0,
        evr: installs > 0 ? (events / installs) * 100 : 0,
    };
});

const aggregateMockData = (data, dimension, offerId, dateRange) => {
    const filtered = data.filter(row => {
        const matchOffer = offerId === 'ALL' || row.offer_id.toString() === offerId;
        const matchDate = row.dt >= dateRange.start && row.dt <= dateRange.end;
        return matchOffer && matchDate;
    });

    const summary = filtered.reduce((acc, curr) => ({
        clicks: acc.clicks + curr.clicks,
        installs: acc.installs + curr.installs,
        events: acc.events + curr.events,
        revenues: acc.revenues + Number(curr.revenues || 0),
    }), { clicks: 0, installs: 0, events: 0, revenues: 0 });

    summary.cvr = summary.clicks > 0 ? (summary.installs / summary.clicks) * 10000 : 0;
    summary.evr = summary.installs > 0 ? (summary.events / summary.installs) * 100 : 0;

    const grouped = filtered.reduce((acc, curr) => {
        const key = curr[dimension] || 'Unknown';
        if (!acc[key]) {
            acc[key] = { dimensionKey: key, clicks: 0, installs: 0, events: 0, revenues: 0 };
        }
        acc[key].clicks += curr.clicks;
        acc[key].installs += curr.installs;
        acc[key].events += curr.events;
        acc[key].revenues += Number(curr.revenues || 0);
        return acc;
    }, {});

    const aggregated = Object.values(grouped).map(item => ({
        ...item,
        cvr: item.clicks > 0 ? (item.installs / item.clicks) * 10000 : 0,
        evr: item.installs > 0 ? (item.events / item.installs) * 100 : 0,
    })).sort((a, b) => b.clicks - a.clicks);

    const offerIds = ['ALL', ...new Set(data.map(d => d.offer_id.toString()))].sort((a, b) => {
        const numA = Number(a);
        const numB = Number(b);
        if (Number.isNaN(numA) || Number.isNaN(numB)) return a.localeCompare(b);
        return numA - numB;
    });

    return { aggregated, summary, offerIds };
};

// --- 组件主入口 ---
export default function DorisAnalyticsDashboard() {
    const [aggregated, setAggregated] = useState([]);
    const [summary, setSummary] = useState(normalizeSummary({}));
    const [offerIds, setOfferIds] = useState(['ALL']);
    const [loading, setLoading] = useState(true);
    const [dataSource, setDataSource] = useState('connecting'); // connecting, remote, mock

    // 筛选状态
    const [selectedOfferId, setSelectedOfferId] = useState('ALL');
    const [dateRange, setDateRange] = useState(() => getDefaultDateRange(7));
    const [activeDimension, setActiveDimension] = useState('publisher');

    // 初始化数据：每个维度单独请求后端接口
    useEffect(() => {
        const fetchData = async () => {
            setLoading(true);
            try {
                const apiBase = import.meta.env.DEV ? 'http://43.163.113.178' : '';
                const params = new URLSearchParams();
                if (dateRange.start && dateRange.end) {
                    params.set('start', dateRange.start);
                    params.set('end', dateRange.end);
                } else {
                    params.set('days', '7');
                }
                if (selectedOfferId !== 'ALL') {
                    params.set('offer_id', selectedOfferId);
                }

                const response = await fetch(`${apiBase}/api/analytics/${activeDimension}?${params.toString()}`, {
                    signal: AbortSignal.timeout(20000)
                });

                if (!response.ok) throw new Error('Network response was not ok');

                const json = await response.json();
                if (json.code === 200 && json.data) {
                    setAggregated(normalizeAggregated(json.data.aggregated || []));
                    setSummary(normalizeSummary(json.data.summary || {}));
                    if (Array.isArray(json.data.offer_ids) && json.data.offer_ids.length) {
                        setOfferIds(['ALL', ...json.data.offer_ids.map((id) => id.toString())]);
                    }
                    setDataSource('remote');
                } else {
                    throw new Error('Invalid data format');
                }
            } catch (error) {
                console.warn("Backend connection failed, using Mock data:", error);
                const mock = generateMockData();
                const mockResult = aggregateMockData(mock, activeDimension, selectedOfferId, dateRange);
                setAggregated(mockResult.aggregated);
                setSummary(mockResult.summary);
                setOfferIds(mockResult.offerIds);
                setDataSource('mock');
            } finally {
                setLoading(false);
            }
        };

        fetchData();
    }, [activeDimension, selectedOfferId, dateRange.start, dateRange.end]);

    // 辅助函数
    const fmtNum = (num) => new Intl.NumberFormat('en-US').format(num);
    const fmtPct = (num) => `${num.toFixed(2)}%`;
    const fmtCvr = (num) => `${num.toFixed(2)}‱`;
    const fmtMoney = (num) => `$${num.toFixed(2)}`;

    const dimensions = [
        { key: 'publisher', label: 'Publisher (渠道)', icon: <Globe size={18} /> },
        { key: 'bundle', label: 'Bundle (包名)', icon: <Layers size={18} /> },
        { key: 'brand', label: 'Brand (品牌)', icon: <Tag size={18} /> },
        { key: 'model', label: 'Model (机型)', icon: <Smartphone size={18} /> },
        { key: 'ad_type', label: 'Ad Type (广告类型)', icon: <LayoutDashboard size={18} /> },
        { key: 'bid_floor', label: 'Bid Floor (底价)', icon: <DollarSign size={18} /> },
    ];

    if (loading) {
        return (
            <div className="flex items-center justify-center h-screen bg-slate-50 text-slate-500">
                <RefreshCw className="animate-spin mr-2" />
                <span className="font-medium">Connecting to Doris...</span>
            </div>
        );
    }

    return (
        <div className="min-h-screen bg-slate-100 p-6 font-sans text-slate-800">

            {/* 顶部 Header */}
            <header className="mb-8 flex justify-between items-start">
                <div>
                    <h1 className="text-2xl font-bold text-slate-900 flex items-center gap-2">
                        <LayoutDashboard className="text-indigo-600" />
                        Doris 广告投放质量分析
                    </h1>
                    <p className="text-slate-500 text-sm mt-1">
                        Table: <code className="bg-slate-200 px-1 rounded text-slate-600">pando.click_postback_agg</code>
                    </p>
                </div>

                {/* 数据源状态指示器 */}
                <div className={`px-4 py-2 rounded-full text-xs font-semibold flex items-center gap-2 border ${
                    dataSource === 'remote'
                        ? 'bg-green-50 text-green-700 border-green-200'
                        : 'bg-amber-50 text-amber-700 border-amber-200'
                }`}>
                    {dataSource === 'remote' ? <CheckCircle2 size={16} /> : <ServerOff size={16} />}
                    {dataSource === 'remote' ? 'Connected to Doris' : 'Demo Mode (Mock Data)'}
                </div>
            </header>

            {/* 核心指标卡片 */}
            <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-5 gap-4 mb-8">
                <MetricCard label="Total Clicks" value={fmtNum(summary.clicks)} icon={<MousePointer2 size={20} />} color="blue" />
                <MetricCard label="Total Installs" value={fmtNum(summary.installs)} icon={<Download size={20} />} color="green" />
                <MetricCard label="Total Events" value={fmtNum(summary.events)} icon={<Layers size={20} />} color="purple" />
                <MetricCard label="Avg CVR" value={fmtCvr(summary.cvr)} subValue="Goal: >150‱" color="indigo" />
                <MetricCard label="Avg EVR" value={fmtPct(summary.evr)} subValue="Goal: >30%" color="orange" />
            </div>

            <div className="grid grid-cols-12 gap-6">

                {/* 左侧筛选栏 */}
                <div className="col-span-12 lg:col-span-3 space-y-6">
                    <div className="bg-white p-5 rounded-xl shadow-sm border border-slate-200">
                        <h3 className="font-semibold text-slate-700 mb-4 flex items-center gap-2">
                            <Filter size={18} /> 全局筛选
                        </h3>

                        <div className="mb-4">
                            <label className="text-xs font-medium text-slate-500 uppercase mb-1 block">Date Range (DT)</label>
                            <div className="grid grid-cols-2 gap-2">
                                <input
                                    type="date"
                                    value={dateRange.start}
                                    onChange={(e) => setDateRange({...dateRange, start: e.target.value})}
                                    className="w-full text-sm border-slate-300 rounded-md focus:ring-indigo-500 focus:border-indigo-500"
                                />
                                <input
                                    type="date"
                                    value={dateRange.end}
                                    onChange={(e) => setDateRange({...dateRange, end: e.target.value})}
                                    className="w-full text-sm border-slate-300 rounded-md focus:ring-indigo-500 focus:border-indigo-500"
                                />
                            </div>
                        </div>

                        <div className="mb-4">
                            <label className="text-xs font-medium text-slate-500 uppercase mb-1 block">Offer ID</label>
                            <select
                                value={selectedOfferId}
                                onChange={(e) => setSelectedOfferId(e.target.value)}
                                className="w-full text-sm border-slate-300 rounded-md focus:ring-indigo-500 focus:border-indigo-500"
                            >
                                {offerIds.map(id => (
                                    <option key={id} value={id}>{id === 'ALL' ? 'All Offers' : `Offer ${id}`}</option>
                                ))}
                            </select>
                        </div>
                    </div>

                    {/* 维度切换 */}
                    <div className="bg-white p-2 rounded-xl shadow-sm border border-slate-200">
                        <h3 className="font-semibold text-slate-700 px-3 py-2 text-sm">分析维度</h3>
                        <div className="space-y-1">
                            {dimensions.map(dim => (
                                <button
                                    key={dim.key}
                                    onClick={() => setActiveDimension(dim.key)}
                                    className={`w-full flex items-center gap-3 px-3 py-2.5 text-sm font-medium rounded-lg transition-colors ${
                                        activeDimension === dim.key
                                            ? 'bg-indigo-50 text-indigo-700'
                                            : 'text-slate-600 hover:bg-slate-50'
                                    }`}
                                >
                                    {dim.icon}
                                    {dim.label}
                                </button>
                            ))}
                        </div>
                    </div>
                </div>

                {/* 右侧图表与数据 */}
                <div className="col-span-12 lg:col-span-9 space-y-6">
                    <div className="bg-white p-6 rounded-xl shadow-sm border border-slate-200">
                        <div className="flex justify-between items-center mb-6">
                            <h2 className="text-lg font-bold text-slate-800">
                                {dimensions.find(d => d.key === activeDimension)?.label} 转化趋势分析
                            </h2>
                            <div className="flex items-center gap-4 text-xs">
                                <span className="flex items-center gap-1"><div className="w-3 h-3 bg-indigo-500 rounded-sm"></div> CVR(‱)</span>
                                <span className="flex items-center gap-1"><div className="w-3 h-3 bg-emerald-500 rounded-full"></div> EVR(%)</span>
                                <span className="flex items-center gap-1"><div className="w-3 h-3 bg-slate-200 rounded-sm"></div> Clicks</span>
                            </div>
                        </div>

                        <div className="h-[400px] w-full">
                            <ResponsiveContainer width="100%" height="100%">
                                <ComposedChart data={aggregated.slice(0, 20)} margin={{ top: 20, right: 20, bottom: 20, left: 20 }}>
                                    <CartesianGrid strokeDasharray="3 3" vertical={false} stroke="#e2e8f0" />
                                    <XAxis dataKey="dimensionKey" axisLine={false} tickLine={false} tick={{ fill: '#64748b', fontSize: 12 }} dy={10} />
                                    <YAxis yAxisId="left" orientation="left" tickFormatter={(val) => val} axisLine={false} tickLine={false} tick={{ fill: '#64748b', fontSize: 12 }} />
                                    <YAxis yAxisId="right" orientation="right" hide={true} />
                                    <Tooltip content={<CustomTooltip />} />
                                    <Bar yAxisId="right" dataKey="clicks" fill="#f1f5f9" barSize={40} radius={[4, 4, 0, 0]} name="Clicks" />
                                    <Bar yAxisId="left" dataKey="cvr" fill="#6366f1" barSize={20} radius={[4, 4, 0, 0]} name="CVR" />
                                    <Line yAxisId="left" type="monotone" dataKey="evr" stroke="#10b981" strokeWidth={3} dot={{ r: 4, fill: '#10b981', strokeWidth: 2, stroke: '#fff' }} name="EVR" />
                                </ComposedChart>
                            </ResponsiveContainer>
                        </div>
                        <p className="text-center text-xs text-slate-400 mt-2">* 仅展示 Top 20 CVR</p>
                    </div>

                    <div className="bg-white rounded-xl shadow-sm border border-slate-200 overflow-hidden">
                        <div className="px-6 py-4 border-b border-slate-100 flex justify-between items-center bg-slate-50">
                            <h3 className="font-semibold text-slate-700">详细数据列表</h3>
                            <span className="text-xs text-slate-500">Rows: {aggregated.length}</span>
                        </div>
                        <div className="overflow-x-auto">
                            <table className="w-full text-sm text-left">
                                <thead className="bg-slate-50 text-slate-500 font-medium">
                                <tr>
                                    <th className="px-6 py-3">{dimensions.find(d => d.key === activeDimension)?.label}</th>
                                    <th className="px-6 py-3 text-right">Clicks</th>
                                    <th className="px-6 py-3 text-right">Installs</th>
                                    <th className="px-6 py-3 text-right text-indigo-600">CVR(‱)</th>
                                    <th className="px-6 py-3 text-right">Events</th>
                                    <th className="px-6 py-3 text-right text-emerald-600">EVR</th>
                                    <th className="px-6 py-3 text-right">Revenues</th>
                                </tr>
                                </thead>
                                <tbody className="divide-y divide-slate-100">
                                {aggregated.map((row, idx) => (
                                    <tr key={idx} className="hover:bg-slate-50 transition-colors">
                                        <td className="px-6 py-3 font-medium text-slate-700">{row.dimensionKey}</td>
                                        <td className="px-6 py-3 text-right text-slate-600">{fmtNum(row.clicks)}</td>
                                        <td className="px-6 py-3 text-right text-slate-600">{fmtNum(row.installs)}</td>
                                        <td className="px-6 py-3 text-right font-semibold text-indigo-600 bg-indigo-50/30">{fmtCvr(row.cvr)}</td>
                                        <td className="px-6 py-3 text-right text-slate-600">{fmtNum(row.events)}</td>
                                        <td className="px-6 py-3 text-right font-semibold text-emerald-600 bg-emerald-50/30">{fmtPct(row.evr)}</td>
                                        <td className="px-6 py-3 text-right text-slate-800">{fmtMoney(row.revenues)}</td>
                                    </tr>
                                ))}
                                </tbody>
                            </table>
                        </div>
                    </div>
                </div>
            </div>
        </div>
    );
}

function MetricCard({ label, value, subValue, icon, color }) {
    const colorMap = {
        blue: 'text-blue-600 bg-blue-50',
        green: 'text-emerald-600 bg-emerald-50',
        purple: 'text-purple-600 bg-purple-50',
        indigo: 'text-indigo-600 bg-indigo-50',
        orange: 'text-orange-600 bg-orange-50',
    };
    return (
        <div className="bg-white p-5 rounded-xl border border-slate-200 shadow-sm flex flex-col justify-between">
            <div className="flex justify-between items-start mb-2">
                <span className="text-slate-500 text-xs font-semibold uppercase tracking-wider">{label}</span>
                {icon && <div className={`p-1.5 rounded-lg ${colorMap[color]}`}>{icon}</div>}
            </div>
            <div>
                <div className={`text-2xl font-bold ${colorMap[color].split(' ')[0]}`}>{value}</div>
                {subValue && <div className="text-xs text-slate-400 mt-1">{subValue}</div>}
            </div>
        </div>
    );
}

function CustomTooltip({ active, payload, label }) {
    if (active && payload && payload.length) {
        const data = payload[0].payload;
        return (
            <div className="bg-white p-4 shadow-xl border border-slate-100 rounded-lg text-sm">
                <p className="font-bold text-slate-800 mb-2 border-b pb-1">{label}</p>
                <div className="space-y-1">
                    <p className="flex justify-between gap-8"><span className="text-slate-500">Clicks:</span> <span className="font-mono">{new Intl.NumberFormat().format(data.clicks)}</span></p>
                    <p className="flex justify-between gap-8"><span className="text-slate-500">Installs:</span> <span className="font-mono">{new Intl.NumberFormat().format(data.installs)}</span></p>
                    <p className="flex justify-between gap-8 text-indigo-600 font-semibold"><span>CVR:</span> <span>{data.cvr.toFixed(2)}‱</span></p>
                    <p className="flex justify-between gap-8 text-emerald-600 font-semibold"><span>EVR:</span> <span>{data.evr.toFixed(2)}%</span></p>
                </div>
            </div>
        );
    }
    return null;
}
