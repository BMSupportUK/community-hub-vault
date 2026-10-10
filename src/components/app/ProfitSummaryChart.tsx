import { Cell, Pie, PieChart, ResponsiveContainer } from "recharts";
import { ChartPie, Package, TrendingUp, Wallet } from "lucide-react";

type Props = {
  title: string;
  revenue: number;
  cost: number;
  missing: boolean;
  sales?: number;
};

const money = (value: number) => new Intl.NumberFormat("en-GB", { style: "currency", currency: "GBP" }).format(value / 100);

export function ProfitSummaryChart({ title, revenue, cost, missing, sales }: Props) {
  const profit = revenue - cost;
  const margin = revenue ? (profit / revenue) * 100 : 0;
  const data = [
    { name: "Profit", value: Math.max(0, profit), color: "var(--success)" },
    { name: "Costs", value: cost, color: "var(--warning)" },
  ];
  return (
    <section aria-label={`${title} profit statistics`} className="rounded-lg border border-border/70 bg-card/90 p-5 shadow-elegant backdrop-blur-md">
      <h3 className="flex items-center gap-2 text-sm font-semibold"><ChartPie className="size-4 text-accent" />{title}</h3>
      <div className="relative mx-auto my-4 size-44" role="img" aria-label={`Revenue ${money(revenue)}, costs ${money(cost)}, ${profit < 0 ? "loss" : "profit"} ${money(Math.abs(profit))}, margin ${margin.toFixed(1)} percent${missing ? ", costs incomplete" : ""}`}>
        {data.some((item) => item.value > 0) ? (
          <ResponsiveContainer width="100%" height="100%">
            <PieChart><Pie data={data} dataKey="value" nameKey="name" innerRadius="76%" outerRadius="98%" startAngle={90} endAngle={-270} stroke="var(--card)" strokeWidth={3} isAnimationActive={false}>
              {data.map((item) => <Cell key={item.name} fill={item.color} />)}
            </Pie></PieChart>
          </ResponsiveContainer>
        ) : <div className="size-full rounded-full border-[18px] border-muted" />}
        <div className="pointer-events-none absolute inset-0 flex flex-col items-center justify-center">
          <strong className={`text-3xl tabular-nums ${profit < 0 ? "text-destructive" : "text-success"}`}>{revenue ? `${margin.toFixed(1)}%` : "—"}</strong>
          <span className="mt-1 text-xs text-muted-foreground">{missing ? "Provisional margin" : "Profit margin"}</span>
        </div>
      </div>
      <dl className="space-y-3 text-sm">
        {sales != null && <div className="flex items-center justify-between gap-2"><dt className="flex items-center gap-2 text-muted-foreground"><Package className="size-3.5" />Total sales</dt><dd className="font-semibold tabular-nums">{sales}</dd></div>}
        <div className="flex items-center justify-between gap-2"><dt className="flex items-center gap-2 text-muted-foreground"><Wallet className="size-3.5" />Revenue</dt><dd className="font-semibold tabular-nums">{money(revenue)}</dd></div>
        <div className="flex items-center justify-between gap-2"><dt className="flex items-center gap-2 text-muted-foreground"><span className="size-2 rounded-full bg-warning" />Costs</dt><dd className="font-semibold tabular-nums">{money(cost)}</dd></div>
        <div className="flex items-center justify-between gap-2 border-t border-border pt-3"><dt className="flex items-center gap-2"><TrendingUp className={`size-3.5 ${profit < 0 ? "text-destructive" : "text-success"}`} />{profit < 0 ? "Loss" : "Profit"}</dt><dd className={`font-semibold tabular-nums ${profit < 0 ? "text-destructive" : "text-success"}`}>{money(Math.abs(profit))}</dd></div>
      </dl>
      {missing && <p className="mt-3 text-xs text-warning">Costs incomplete · profit is provisional</p>}
    </section>
  );
}