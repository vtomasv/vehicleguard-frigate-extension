import AccessControlLayout from "@/components/AccessControlLayout";
import { trpc } from "@/lib/trpc";
import { Link } from "wouter";
import {
  Camera,
  TrendingUp,
  TrendingDown,
  Users,
  Truck,
  Car,
  AlertCircle,
  ArrowRight,
  Clock,
  CheckCircle2,
  XCircle,
  Loader2,
} from "lucide-react";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { useMemo, useState } from "react";

function StatCard({
  title,
  value,
  icon: Icon,
  color,
  subtitle,
}: {
  title: string;
  value: string | number;
  icon: React.ElementType;
  color: string;
  subtitle?: string;
}) {
  return (
    <Card className="bg-card border-border">
      <CardContent className="p-5">
        <div className="flex items-start justify-between">
          <div>
            <p className="text-xs text-muted-foreground font-medium uppercase tracking-wider">{title}</p>
            <p className="text-3xl font-bold text-foreground mt-1">{value}</p>
            {subtitle && <p className="text-xs text-muted-foreground mt-1">{subtitle}</p>}
          </div>
          <div className={`w-10 h-10 rounded-lg flex items-center justify-center ${color}`}>
            <Icon className="w-5 h-5" />
          </div>
        </div>
      </CardContent>
    </Card>
  );
}

function EventRow({ event }: { event: { event: Record<string, unknown>; camera: Record<string, unknown> | null } }) {
  const e = event.event as {
    id: number;
    eventType: string;
    vehicleType: string;
    vehicleColor: string | null;
    vehiclePlate: string | null;
    confidence: number | null;
    eventTimestamp: Date;
    llmDescription: string | null;
  };
  const cam = event.camera as { name: string } | null;

  const isEntry = e.eventType === "entry";
  const vehicleIcon = e.vehicleType === "truck" ? Truck : e.vehicleType === "person" ? Users : Car;
  const VehicleIcon = vehicleIcon;

  return (
    <div className="flex items-center gap-4 p-3 rounded-lg hover:bg-secondary/50 transition-colors">
      <div className={`w-8 h-8 rounded-full flex items-center justify-center shrink-0 ${isEntry ? "bg-green-500/15 text-green-400" : "bg-red-500/15 text-red-400"}`}>
        {isEntry ? <TrendingUp className="w-4 h-4" /> : <TrendingDown className="w-4 h-4" />}
      </div>
      <div className="flex-1 min-w-0">
        <div className="flex items-center gap-2">
          <VehicleIcon className="w-3.5 h-3.5 text-muted-foreground" />
          <span className="text-sm font-medium text-foreground capitalize">
            {e.vehicleType === "truck" ? "Camión" : e.vehicleType === "car" ? "Auto" : e.vehicleType === "van" ? "Camioneta" : e.vehicleType === "person" ? "Persona" : "Desconocido"}
          </span>
          {e.vehicleColor && (
            <span className="text-xs text-muted-foreground">— {e.vehicleColor}</span>
          )}
          {e.vehiclePlate && (
            <Badge variant="outline" className="text-xs font-mono px-1.5 py-0">
              {e.vehiclePlate}
            </Badge>
          )}
        </div>
        <p className="text-xs text-muted-foreground mt-0.5 truncate">
          {cam?.name || "Cámara"} · {new Date(e.eventTimestamp).toLocaleString("es-AR")}
        </p>
      </div>
      <Badge className={`text-xs shrink-0 ${isEntry ? "bg-green-500/15 text-green-400 border-green-500/30" : "bg-red-500/15 text-red-400 border-red-500/30"}`}>
        {isEntry ? "ENTRADA" : e.eventType === "exit" ? "SALIDA" : "DESCONOCIDO"}
      </Badge>
    </div>
  );
}

export default function Dashboard() {
  const [from] = useState(() => {
    const d = new Date();
    d.setDate(d.getDate() - 7);
    return d;
  });

  const { data: cameras, isLoading: loadingCameras } = trpc.cameras.list.useQuery();
  const { data: stats } = trpc.dashboard.stats.useQuery({ from });
  const { data: recentEvents, isLoading: loadingEvents } = trpc.events.list.useQuery({
    limit: 10,
    offset: 0,
  });

  const summary = useMemo(() => {
    if (!stats?.totals) return { entries: 0, exits: 0, trucks: 0, cars: 0 };
    let entries = 0, exits = 0, trucks = 0, cars = 0;
    for (const row of stats.totals) {
      const count = Number(row.count);
      if (row.eventType === "entry") entries += count;
      if (row.eventType === "exit") exits += count;
      if (row.vehicleType === "truck") trucks += count;
      if (row.vehicleType === "car") cars += count;
    }
    return { entries, exits, trucks, cars };
  }, [stats]);

  const cameraStatuses = useMemo(() => {
    if (!cameras) return [];
    return cameras.map((cam) => ({
      ...cam,
      status: "active" as const,
    }));
  }, [cameras]);

  return (
    <AccessControlLayout title="Panel Principal">
      <div className="space-y-6">
        {/* Header */}
        <div className="flex items-center justify-between">
          <div>
            <h2 className="text-xl font-bold text-foreground">Panel de Control</h2>
            <p className="text-sm text-muted-foreground mt-0.5">
              Resumen de actividad — últimos 7 días
            </p>
          </div>
          <Link href="/cameras">
            <Button size="sm" className="gap-2">
              <Camera className="w-4 h-4" />
              Ver Cámaras
            </Button>
          </Link>
        </div>

        {/* Stats grid */}
        <div className="grid grid-cols-2 lg:grid-cols-4 gap-4">
          <StatCard
            title="Entradas"
            value={summary.entries}
            icon={TrendingUp}
            color="bg-green-500/15 text-green-400"
            subtitle="últimos 7 días"
          />
          <StatCard
            title="Salidas"
            value={summary.exits}
            icon={TrendingDown}
            color="bg-red-500/15 text-red-400"
            subtitle="últimos 7 días"
          />
          <StatCard
            title="Camiones"
            value={summary.trucks}
            icon={Truck}
            color="bg-yellow-500/15 text-yellow-400"
            subtitle="detectados"
          />
          <StatCard
            title="Autos"
            value={summary.cars}
            icon={Car}
            color="bg-blue-500/15 text-blue-400"
            subtitle="detectados"
          />
        </div>

        {/* Camera status + Recent events */}
        <div className="grid grid-cols-1 lg:grid-cols-3 gap-6">
          {/* Camera status */}
          <Card className="bg-card border-border">
            <CardHeader className="pb-3">
              <CardTitle className="text-sm font-semibold flex items-center gap-2">
                <Camera className="w-4 h-4 text-primary" />
                Estado de Cámaras
              </CardTitle>
            </CardHeader>
            <CardContent className="space-y-3">
              {loadingCameras ? (
                <div className="flex items-center justify-center py-8">
                  <Loader2 className="w-5 h-5 animate-spin text-muted-foreground" />
                </div>
              ) : (
                cameraStatuses.map((cam) => (
                  <div key={cam.id} className="p-3 rounded-lg bg-secondary border border-border">
                    <div className="flex items-center justify-between mb-2">
                      <div className="flex items-center gap-2">
                        <div className="w-2 h-2 rounded-full bg-primary live-indicator" />
                        <span className="text-xs font-semibold text-foreground">
                          Cámara {cam.id}
                        </span>
                      </div>
                      <Badge className="text-xs bg-primary/15 text-primary border-primary/25">
                        {cam.type === "trucks" ? "Camiones" : "Vehículos"}
                      </Badge>
                    </div>
                    <p className="text-xs text-muted-foreground truncate">{cam.location}</p>
                    <Link href="/cameras">
                      <Button variant="ghost" size="sm" className="w-full mt-2 h-7 text-xs gap-1">
                        Abrir Cámara
                        <ArrowRight className="w-3 h-3" />
                      </Button>
                    </Link>
                  </div>
                ))
              )}
            </CardContent>
          </Card>

          {/* Recent events */}
          <Card className="lg:col-span-2 bg-card border-border">
            <CardHeader className="pb-3">
              <div className="flex items-center justify-between">
                <CardTitle className="text-sm font-semibold flex items-center gap-2">
                  <Clock className="w-4 h-4 text-primary" />
                  Eventos Recientes
                </CardTitle>
                <Link href="/records">
                  <Button variant="ghost" size="sm" className="h-7 text-xs gap-1">
                    Ver todos
                    <ArrowRight className="w-3 h-3" />
                  </Button>
                </Link>
              </div>
            </CardHeader>
            <CardContent>
              {loadingEvents ? (
                <div className="flex items-center justify-center py-8">
                  <Loader2 className="w-5 h-5 animate-spin text-muted-foreground" />
                </div>
              ) : recentEvents && recentEvents.length > 0 ? (
                <div className="space-y-1">
                  {recentEvents.map((event) => (
                    <EventRow key={(event.event as { id: number }).id} event={event as { event: Record<string, unknown>; camera: Record<string, unknown> | null }} />
                  ))}
                </div>
              ) : (
                <div className="flex flex-col items-center justify-center py-12 text-center">
                  <AlertCircle className="w-8 h-8 text-muted-foreground mb-3" />
                  <p className="text-sm font-medium text-foreground">Sin eventos registrados</p>
                  <p className="text-xs text-muted-foreground mt-1">
                    Sube un video en el panel de cámaras para comenzar
                  </p>
                  <Link href="/cameras">
                    <Button size="sm" className="mt-4 gap-2">
                      <Camera className="w-4 h-4" />
                      Ir a Cámaras
                    </Button>
                  </Link>
                </div>
              )}
            </CardContent>
          </Card>
        </div>

        {/* Quick status */}
        <div className="grid grid-cols-1 sm:grid-cols-3 gap-4">
          {[
            { icon: CheckCircle2, label: "Sistema operativo", color: "text-green-400", bg: "bg-green-500/10" },
            { icon: Camera, label: "2 cámaras activas", color: "text-primary", bg: "bg-primary/10" },
            { icon: XCircle, label: "0 alertas activas", color: "text-muted-foreground", bg: "bg-secondary" },
          ].map(({ icon: Icon, label, color, bg }) => (
            <div key={label} className={`flex items-center gap-3 p-4 rounded-lg border border-border ${bg}`}>
              <Icon className={`w-4 h-4 ${color} shrink-0`} />
              <span className="text-sm text-foreground">{label}</span>
            </div>
          ))}
        </div>
      </div>
    </AccessControlLayout>
  );
}
