'use client';

/**
 * 汇率图表（最近 30 天）—— client island
 * - 上图：MSO vs CoinGecko 中间价 双折线
 * - 下图：偏离 % 柱状图，超过 ±0.3% 红色，否则绿色
 */
import {
  Bar,
  BarChart,
  Cell,
  CartesianGrid,
  Legend,
  Line,
  LineChart,
  ReferenceLine,
  ResponsiveContainer,
  Tooltip,
  XAxis,
  YAxis,
} from 'recharts';

export type FxChartPoint = {
  date: string; // YYYY-MM-DD
  mso: number | null;
  mid: number | null;
  deviationPct: number | null;
};

const ALERT_THRESHOLD = 0.3; // % 超 ±0.3% 红

export function FxRateCharts({ data, pair }: { data: FxChartPoint[]; pair: string }) {
  if (data.length === 0) {
    return (
      <div className="rounded-xl border border-dashed border-slate-200 bg-slate-50/40 p-10 text-center text-xs text-slate-400">
        最近 30 天无 {pair} 数据。等 cron 拉到 MSO + 中间价 source 后显示。
      </div>
    );
  }

  return (
    <div className="space-y-4">
      <div>
        <div className="mb-1 text-xs font-medium text-slate-600">{pair} · MSO vs CoinGecko 中间价</div>
        <div className="h-56 w-full rounded-xl border border-slate-200 bg-white p-2">
          <ResponsiveContainer width="100%" height="100%">
            <LineChart data={data} margin={{ top: 8, right: 16, bottom: 8, left: 0 }}>
              <CartesianGrid strokeDasharray="3 3" stroke="#e2e8f0" />
              <XAxis dataKey="date" tick={{ fontSize: 10, fill: '#64748b' }} />
              <YAxis tick={{ fontSize: 10, fill: '#64748b' }} domain={['auto', 'auto']} />
              <Tooltip
                contentStyle={{ fontSize: 12, borderRadius: 8 }}
                formatter={(value, name) => {
                  const v = typeof value === 'number' ? value : Number(value);
                  return [Number.isNaN(v) ? '—' : v.toFixed(4), name === 'mso' ? 'MSO' : '中间价'];
                }}
              />
              <Legend wrapperStyle={{ fontSize: 11 }} />
              <Line type="monotone" dataKey="mso" stroke="#b91c1c" name="MSO" strokeWidth={2} dot={{ r: 2 }} />
              <Line type="monotone" dataKey="mid" stroke="#0284c7" name="中间价" strokeWidth={2} dot={{ r: 2 }} />
            </LineChart>
          </ResponsiveContainer>
        </div>
      </div>

      <div>
        <div className="mb-1 text-xs font-medium text-slate-600">
          偏离 %（≥ ±{ALERT_THRESHOLD}% 红色，否则绿色）
        </div>
        <div className="h-44 w-full rounded-xl border border-slate-200 bg-white p-2">
          <ResponsiveContainer width="100%" height="100%">
            <BarChart data={data} margin={{ top: 8, right: 16, bottom: 8, left: 0 }}>
              <CartesianGrid strokeDasharray="3 3" stroke="#e2e8f0" />
              <XAxis dataKey="date" tick={{ fontSize: 10, fill: '#64748b' }} />
              <YAxis tick={{ fontSize: 10, fill: '#64748b' }} unit="%" />
              <Tooltip
                contentStyle={{ fontSize: 12, borderRadius: 8 }}
                formatter={(value) => {
                  const v = typeof value === 'number' ? value : Number(value);
                  return [Number.isNaN(v) ? '—' : `${v.toFixed(3)}%`, '偏离'];
                }}
              />
              <ReferenceLine y={ALERT_THRESHOLD} stroke="#fca5a5" strokeDasharray="4 4" />
              <ReferenceLine y={-ALERT_THRESHOLD} stroke="#fca5a5" strokeDasharray="4 4" />
              <ReferenceLine y={0} stroke="#cbd5e1" />
              <Bar dataKey="deviationPct" name="偏离 %">
                {data.map((d, i) => (
                  <Cell
                    key={i}
                    fill={
                      d.deviationPct === null
                        ? '#cbd5e1'
                        : Math.abs(d.deviationPct) >= ALERT_THRESHOLD
                        ? '#b91c1c'
                        : '#10b981'
                    }
                  />
                ))}
              </Bar>
            </BarChart>
          </ResponsiveContainer>
        </div>
      </div>
    </div>
  );
}
