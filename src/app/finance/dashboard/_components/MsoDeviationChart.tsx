'use client';

/**
 * MSO 偏离趋势折线（最近 7 天）—— client island
 */
import {
  CartesianGrid,
  Line,
  LineChart,
  ResponsiveContainer,
  Tooltip,
  XAxis,
  YAxis,
  Legend,
} from 'recharts';

export type MsoDeviationPoint = {
  date: string; // YYYY-MM-DD
  mso: number | null;
  mid: number | null;
  deviationPct: number | null;
};

export function MsoDeviationChart({
  data,
  pair,
}: {
  data: MsoDeviationPoint[];
  pair: string;
}) {
  if (data.length === 0) {
    return (
      <div className="rounded-xl border border-dashed border-slate-200 bg-slate-50/40 p-6 text-center text-xs text-slate-400">
        最近 7 天无 {pair} 数据。等 cron 跑出 MSO + CoinGecko / HKMA 中间价后显示。
      </div>
    );
  }
  return (
    <div className="h-56 w-full">
      <ResponsiveContainer width="100%" height="100%">
        <LineChart data={data} margin={{ top: 8, right: 16, bottom: 8, left: 0 }}>
          <CartesianGrid strokeDasharray="3 3" stroke="#e2e8f0" />
          <XAxis dataKey="date" tick={{ fontSize: 11, fill: '#64748b' }} />
          <YAxis tick={{ fontSize: 11, fill: '#64748b' }} domain={['auto', 'auto']} />
          <Tooltip
            contentStyle={{ fontSize: 12, borderRadius: 8 }}
            formatter={(value, name) => {
              const v = typeof value === 'number' ? value : Number(value);
              if (Number.isNaN(v)) return ['—', String(name)];
              if (name === 'deviationPct') return [`${v.toFixed(3)}%`, '偏离 %'];
              return [v.toFixed(4), name === 'mso' ? 'MSO' : '中间价'];
            }}
          />
          <Legend wrapperStyle={{ fontSize: 11 }} />
          <Line type="monotone" dataKey="mso" stroke="#b91c1c" name="MSO" strokeWidth={2} dot={{ r: 3 }} />
          <Line type="monotone" dataKey="mid" stroke="#0284c7" name="中间价" strokeWidth={2} dot={{ r: 3 }} />
        </LineChart>
      </ResponsiveContainer>
    </div>
  );
}
