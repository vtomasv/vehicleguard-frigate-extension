import AccessControlLayout from "@/components/AccessControlLayout";
import { trpc } from "@/lib/trpc";
import { useState, useMemo } from "react";
import {
  BarChart,
  Bar,
  XAxis,
  YAxis,
  CartesianGrid,
  Tooltip,
  Legend,
  ResponsiveContainer,
  PieChart,
  Pie,
  Cell,
  LineChart,
  Line,
} from "recharts";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import {
  TrendingUp,
  TrendingDown,
  Truck,
  Car,
  Users,
  BarChart3,
  Loader2,
  Calendar,
} from "lucide-react";

const COLORS = {
  entry: "oklch(0.65 0.18 145)",
  exit: "oklch(0.60 0.22 25)",
  truck: "oklch(0.70 0.18 60)",
  car: "oklch(0.60 0.18 200)",
  van: "oklch(0.65 0.18 280)",
  motorcycle: "oklch(0.65 0.18 320)",
  person: "oklch(0.60 0.18 240)",
  unknown: "oklch(0.45 0.01 240)",
};

const PERIOD_OPTIONS = [
  { label: "Hoy", days: 0 },
  { label: "7 días", days: 7 },
  { label: "30 días", days: 30 },
  { label: "90 días", days: 90 },
];

function CustomTooltip({ active, payload, label }: { active?: boolean; payload?: Array<{ name: string; value: number; color: string }>; label?: string }) {
  if (!active || !payload?.length) return null;
  return (
    <div className="bg-card border border-border rounded-lg p-3 shadow-lg">
      <p className="text-xs font-medium text-foreground mb-2">{label}</p>
      {payload.map((p) => (
        <div key={p.name} className="flex items-center gap-2 text-xs">
          <div className="w-2 h-2 rounded-full" style={{ background: p.color }} />
          <span className="text-muted-foreground">{p.name}:</span>
          <span className="text-foreground font-medium">{p.value}</span>
        </div>
      ))}
    </div>
  );
}

export default function Analytics() {
  const [periodDays, setPeriodDays] = useState(7);

  const from = useMemo(() => {
    if (periodDays === 0) {
      const d = new Date();
      d.setHours(0, 0, 0, 0);
      return d;
    }
    const d = new Date();
    d.setDate(d.getDate() - periodDays);
    return d;
  }, [periodDays]);

  const { data: stats, isLoading } = trpc.dashboard.stats.useQuery({ from });
  const { data: personCounts1 } = trpc.dashboard.personCounts.useQuery({ cameraId: 1 });
  const { data: personCounts2 } = trpc.dashboard.personCounts.useQuery({ cameraId: 2 });

  // Process hourly data for bar chart
  const hourlyData = useMemo(() => {
    if (!stats?.hourly) return [];
    const hours: Record<number, { hour: string; Entradas: number; Salidas: number }> = {};
    for (let h = 0; h < 24; h++) {
      hours[h] = { hour: `${String(h).padStart(2, "0")}:00`, Entradas: 0, Salidas: 0 };
    }
    for (const row of stats.hourly) {
      const h = Number(row.hour);
      const count = Number(row.count);
      if (row.eventType === "entry") hours[h].Entradas += count;
      if (row.eventType === "exit") hours[h].Salidas += count;
    }
    return Object.values(hours).filter((h) => h.Entradas > 0 || h.Salidas > 0);
  }, [stats]);

  // Process vehicle type distribution
  const vehicleData = useMemo(() => {
    if (!stats?.totals) return [];
    const types: Record<string, number> = {};
    for (const row of stats.totals) {
      const type = row.vehicleType as string;
      types[type] = (types[type] || 0) + Number(row.count);
    }
    const labels: Record<string, string> = {
      truck: "Camiones", car: "Autos", van: "Camionetas",
      motorcycle: "Motos", person: "Personas", unknown: "Desconocido",
    };
    return Object.entries(types).map(([type, count]) => ({
      name: labels[type] || type,
      value: count,
      color: COLORS[type as keyof typeof COLORS] || COLORS.unknown,
    }));
  }, [stats]);

  // Summary totals
  const summary = useMemo(() => {
    if (!stats?.totals) return { total: 0, entries: 0, exits: 0, trucks: 0, cars: 0, persons: 0 };
    let total = 0, entries = 0, exits = 0, trucks = 0, cars = 0, persons = 0;
    for (const row of stats.totals) {
      const count = Number(row.count);
      total += count;
      if (row.eventType === "entry") entries += count;
      if (row.eventType === "exit") exits += count;
      if (row.vehicleType === "truck") trucks += count;
      if (row.vehicleType === "car") cars += count;
      if (row.vehicleType === "person") persons += count;
    }
    return { total, entries, exits, trucks, cars, persons };
  }, [stats]);

  // Total unique persons
  const totalPersons = useMemo(() => {
    const c1 = personCounts1?.reduce((s, p) => s + p.totalCount, 0) || 0;
    const c2 = personCounts2?.reduce((s, p) => s + p.totalCount, 0) || 0;
    return c1 + c2;
  }, [personCounts1, personCounts2]);

  return (
    <AccessControlLayout title="Analítica">
      <div className="space-y-6">
        <div className="flex items-center justify-between flex-wrap gap-4">
          <div>
            <h2 className="text-xl font-bold text-foreground">Dashboard Analítico</h2>
            <p className="text-sm text-muted-foreground mt-0.5">
              Estadísticas y tendencias del control de acceso vehicular
            </p>
          </div>
          <div className="flex items-center gap-2">
            <Calendar className="w-4 h-4 text-muted-foreground" />
            {PERIOD_OPTIONS.map(({ label, days }) => (
              <Button
                key={days}
                variant={periodDays === days ? "default" : "outline"}
                size="sm"
                className="h-8 text-xs"
                onClick={() => setPeriodDays(days)}
              >
                {label}
              </Button>
            ))}
          </div>
        </div>

        {isLoading ? (
          <div className="flex items-center justify-center py-24">
            <Loader2 className="w-8 h-8 animate-spin text-primary" />
          </div>
        ) : (
          <>
            {/* KPI cards */}
            <div className="grid grid-cols-2 lg:grid-cols-6 gap-3">
              {[
                { label: "Total Eventos", value: summary.total, icon: BarChart3, color: "text-primary", bg: "bg-primary/10" },
                { label: "Entradas", value: summary.entries, icon: TrendingUp, color: "text-green-400", bg: "bg-green-500/10" },
                { label: "Salidas", value: summary.exits, icon: TrendingDown, color: "text-red-400", bg: "bg-red-500/10" },
                { label: "Camiones", value: summary.trucks, icon: Truck, color: "text-yellow-400", bg: "bg-yellow-500/10" },
                { label: "Autos", value: summary.cars, icon: Car, color: "text-blue-400", bg: "bg-blue-500/10" },
                { label: "Personas únicas", value: totalPersons, icon: Users, color: "text-purple-400", bg: "bg-purple-500/10" },
              ].map(({ label, value, icon: Icon, color, bg }) => (
                <Card key={label} className="bg-card border-border">
                  <CardContent className="p-4">
                    <div className={`w-8 h-8 rounded-lg ${bg} flex items-center justify-center mb-2`}>
                      <Icon className={`w-4 h-4 ${color}`} />
                    </div>
                    <p className="text-2xl font-bold text-foreground">{value}</p>
                    <p className="text-xs text-muted-foreground mt-0.5">{label}</p>
                  </CardContent>
                </Card>
              ))}
            </div>

            {/* Hourly activity chart */}
            <Card className="bg-card border-border">
              <CardHeader className="pb-2">
                <CardTitle className="text-sm font-semibold flex items-center gap-2">
                  <BarChart3 className="w-4 h-4 text-primary" />
                  Actividad por Hora del Día
                </CardTitle>
              </CardHeader>
              <CardContent>
                {hourlyData.length === 0 ? (
                  <div className="flex items-center justify-center h-48 text-muted-foreground text-sm">
                    Sin datos para el período seleccionado
                  </div>
                ) : (
                  <ResponsiveContainer width="100%" height={280}>
                    <BarChart data={hourlyData} margin={{ top: 5, right: 10, left: -20, bottom: 5 }}>
                      <CartesianGrid strokeDasharray="3 3" stroke="oklch(0.25 0.01 240)" />
                      <XAxis
                        dataKey="hour"
                        tick={{ fontSize: 11, fill: "oklch(0.55 0.01 240)" }}
                        axisLine={{ stroke: "oklch(0.25 0.01 240)" }}
                      />
                      <YAxis
                        tick={{ fontSize: 11, fill: "oklch(0.55 0.01 240)" }}
                        axisLine={{ stroke: "oklch(0.25 0.01 240)" }}
                      />
                      <Tooltip content={<CustomTooltip />} />
                      <Legend
                        wrapperStyle={{ fontSize: "12px", color: "oklch(0.55 0.01 240)" }}
                      />
                      <Bar dataKey="Entradas" fill={COLORS.entry} radius={[3, 3, 0, 0]} />
                      <Bar dataKey="Salidas" fill={COLORS.exit} radius={[3, 3, 0, 0]} />
                    </BarChart>
                  </ResponsiveContainer>
                )}
              </CardContent>
            </Card>

            {/* Vehicle distribution + Entry/Exit ratio */}
            <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
              {/* Vehicle type pie chart */}
              <Card className="bg-card border-border">
                <CardHeader className="pb-2">
                  <CardTitle className="text-sm font-semibold flex items-center gap-2">
                    <Car className="w-4 h-4 text-primary" />
                    Distribución por Tipo de Vehículo
                  </CardTitle>
                </CardHeader>
                <CardContent>
                  {vehicleData.length === 0 ? (
                    <div className="flex items-center justify-center h-48 text-muted-foreground text-sm">
                      Sin datos para el período seleccionado
                    </div>
                  ) : (
                    <div className="flex items-center gap-4">
                      <ResponsiveContainer width="60%" height={200}>
                        <PieChart>
                          <Pie
                            data={vehicleData}
                            cx="50%"
                            cy="50%"
                            innerRadius={50}
                            outerRadius={80}
                            paddingAngle={3}
                            dataKey="value"
                          >
                            {vehicleData.map((entry, index) => (
                              <Cell key={index} fill={entry.color} />
                            ))}
                          </Pie>
                          <Tooltip content={<CustomTooltip />} />
                        </PieChart>
                      </ResponsiveContainer>
                      <div className="flex-1 space-y-2">
                        {vehicleData.map((item) => (
                          <div key={item.name} className="flex items-center justify-between">
                            <div className="flex items-center gap-2">
                              <div className="w-2.5 h-2.5 rounded-full shrink-0" style={{ background: item.color }} />
                              <span className="text-xs text-muted-foreground">{item.name}</span>
                            </div>
                            <Badge variant="outline" className="text-xs font-mono">
                              {item.value}
                            </Badge>
                          </div>
                        ))}
                      </div>
                    </div>
                  )}
                </CardContent>
              </Card>

              {/* Entry vs Exit ratio */}
              <Card className="bg-card border-border">
                <CardHeader className="pb-2">
                  <CardTitle className="text-sm font-semibold flex items-center gap-2">
                    <TrendingUp className="w-4 h-4 text-primary" />
                    Entradas vs Salidas
                  </CardTitle>
                </CardHeader>
                <CardContent className="space-y-4">
                  {summary.total === 0 ? (
                    <div className="flex items-center justify-center h-48 text-muted-foreground text-sm">
                      Sin datos para el período seleccionado
                    </div>
                  ) : (
                    <>
                      <div className="space-y-3">
                        {[
                          { label: "Entradas", value: summary.entries, total: summary.total, color: "bg-green-500" },
                          { label: "Salidas", value: summary.exits, total: summary.total, color: "bg-red-500" },
                        ].map(({ label, value, total, color }) => (
                          <div key={label} className="space-y-1.5">
                            <div className="flex items-center justify-between text-xs">
                              <span className="text-muted-foreground">{label}</span>
                              <span className="text-foreground font-medium">
                                {value} ({total > 0 ? Math.round((value / total) * 100) : 0}%)
                              </span>
                            </div>
                            <div className="h-2 bg-secondary rounded-full overflow-hidden">
                              <div
                                className={`h-full ${color} rounded-full transition-all duration-500`}
                                style={{ width: `${total > 0 ? (value / total) * 100 : 0}%` }}
                              />
                            </div>
                          </div>
                        ))}
                      </div>

                      {/* Truck vs Car breakdown */}
                      <div className="pt-3 border-t border-border space-y-2">
                        <p className="text-xs text-muted-foreground font-medium uppercase tracking-wider">
                          Desglose por tipo
                        </p>
                        {[
                          { label: "Camiones", value: summary.trucks, icon: Truck, color: "text-yellow-400" },
                          { label: "Autos", value: summary.cars, icon: Car, color: "text-blue-400" },
                          { label: "Personas", value: totalPersons, icon: Users, color: "text-purple-400" },
                        ].map(({ label, value, icon: Icon, color }) => (
                          <div key={label} className="flex items-center justify-between p-2 rounded-lg bg-secondary">
                            <div className="flex items-center gap-2">
                              <Icon className={`w-3.5 h-3.5 ${color}`} />
                              <span className="text-xs text-foreground">{label}</span>
                            </div>
                            <span className={`text-sm font-bold ${color}`}>{value}</span>
                          </div>
                        ))}
                      </div>
                    </>
                  )}
                </CardContent>
              </Card>
            </div>

            {/* Hourly breakdown table */}
            {hourlyData.length > 0 && (
              <Card className="bg-card border-border">
                <CardHeader className="pb-2">
                  <CardTitle className="text-sm font-semibold">Detalle por Hora</CardTitle>
                </CardHeader>
                <CardContent>
                  <div className="overflow-x-auto">
                    <table className="w-full text-xs">
                      <thead>
                        <tr className="border-b border-border">
                          <th className="text-left py-2 px-3 text-muted-foreground font-medium">Hora</th>
                          <th className="text-center py-2 px-3 text-green-400 font-medium">Entradas</th>
                          <th className="text-center py-2 px-3 text-red-400 font-medium">Salidas</th>
                          <th className="text-center py-2 px-3 text-muted-foreground font-medium">Total</th>
                        </tr>
                      </thead>
                      <tbody>
                        {hourlyData.map((row) => (
                          <tr key={row.hour} className="border-b border-border/50 hover:bg-secondary/50">
                            <td className="py-2 px-3 font-mono text-foreground">{row.hour}</td>
                            <td className="py-2 px-3 text-center text-green-400 font-medium">{row.Entradas}</td>
                            <td className="py-2 px-3 text-center text-red-400 font-medium">{row.Salidas}</td>
                            <td className="py-2 px-3 text-center text-foreground">{row.Entradas + row.Salidas}</td>
                          </tr>
                        ))}
                      </tbody>
                    </table>
                  </div>
                </CardContent>
              </Card>
            )}
          </>
        )}
      </div>
    </AccessControlLayout>
  );
}
