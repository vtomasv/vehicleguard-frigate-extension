import AccessControlLayout from "@/components/AccessControlLayout";
import { trpc } from "@/lib/trpc";
import { useState, useMemo } from "react";
import {
  Truck,
  Car,
  Users,
  TrendingUp,
  TrendingDown,
  Search,
  Filter,
  ChevronDown,
  ChevronUp,
  Image,
  Loader2,
  AlertCircle,
  Clock,
  Package,
  Shield,
  Eye,
  Tag,
  Wrench,
  ArrowRight,
  ArrowLeft,
  ArrowUp,
  ArrowDown,
  Brain,
  Film,
  Layers,
} from "lucide-react";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import { Link } from "wouter";

// ─── Types ────────────────────────────────────────────────────────────────────

type EventRow = {
  id: number;
  cameraId: number;
  videoUploadId: number;
  eventType: string;
  vehicleType: string;
  direction: string;
  vehicleColor: string | null;
  vehicleColorSecondary: string | null;
  vehiclePlate: string | null;
  vehicleBrand: string | null;
  vehicleModel: string | null;
  vehicleYear: string | null;
  vehicleSubtype: string | null;
  axleCount: string | null;
  hasTrailer: boolean | null;
  trailerType: string | null;
  cabinType: string | null;
  hasLoad: boolean | null;
  loadDescription: string | null;
  loadType: string | null;
  estimatedLoadWeight: string | null;
  bodyCondition: string | null;
  hasVisibleDamage: boolean | null;
  damageDescription: string | null;
  cleanlinessLevel: string | null;
  hasRoofLights: boolean | null;
  hasExhaustStack: boolean | null;
  hasCompany: string | null;
  hasSignage: string | null;
  distinctiveFeatures: string | null;
  visibleOccupants: number | null;
  driverVisible: boolean | null;
  llmDescription: string | null;
  evidenceFrameUrl: string | null;
  confidence: number | null;
  directionConfidence: number | null;
  eventTimestamp: Date | string;
  createdAt: Date | string;
};

type AccessEvent = {
  event: EventRow;
  camera: { name: string; type: string } | null;
  videoFilename?: string | null;
};

// Group of events from the same video upload
type VideoGroup = {
  videoUploadId: number;
  videoFilename: string | null;
  cameraName: string | null;
  cameraId: number;
  events: AccessEvent[];
  firstTimestamp: Date | string;
};

// ─── Group color palette ──────────────────────────────────────────────────────

const GROUP_COLORS = [
  "border-l-blue-500",
  "border-l-purple-500",
  "border-l-cyan-500",
  "border-l-emerald-500",
  "border-l-amber-500",
  "border-l-rose-500",
  "border-l-indigo-500",
  "border-l-teal-500",
];

const GROUP_BG_COLORS = [
  "bg-blue-500/5",
  "bg-purple-500/5",
  "bg-cyan-500/5",
  "bg-emerald-500/5",
  "bg-amber-500/5",
  "bg-rose-500/5",
  "bg-indigo-500/5",
  "bg-teal-500/5",
];

const GROUP_TEXT_COLORS = [
  "text-blue-400",
  "text-purple-400",
  "text-cyan-400",
  "text-emerald-400",
  "text-amber-400",
  "text-rose-400",
  "text-indigo-400",
  "text-teal-400",
];

// ─── Helper components ────────────────────────────────────────────────────────

function DirectionIcon({ direction }: { direction: string }) {
  const cls = "w-3 h-3";
  if (direction === "right") return <ArrowRight className={`${cls} text-green-400`} />;
  if (direction === "left") return <ArrowLeft className={`${cls} text-red-400`} />;
  if (direction === "forward") return <ArrowUp className={`${cls} text-green-400`} />;
  if (direction === "backward") return <ArrowDown className={`${cls} text-red-400`} />;
  return <span className="text-muted-foreground text-xs">?</span>;
}

function directionLabel(direction: string): string {
  const map: Record<string, string> = {
    right: "Derecha",
    left: "Izquierda",
    forward: "Al fondo",
    backward: "Hacia cámara",
    unknown: "Desconocida",
  };
  return map[direction] || direction;
}

function InfoRow({ label, value, accent }: { label: string; value: string | null | undefined; accent?: string }) {
  if (!value) return null;
  return (
    <div className="flex justify-between items-start gap-2 py-1 border-b border-border/40 last:border-0">
      <span className="text-xs text-muted-foreground shrink-0">{label}</span>
      <span className={`text-xs font-medium text-right ${accent || "text-foreground"}`}>{value}</span>
    </div>
  );
}

function SectionTitle({ icon: Icon, label }: { icon: React.ElementType; label: string }) {
  return (
    <div className="flex items-center gap-1.5 mb-2 mt-3">
      <Icon className="w-3.5 h-3.5 text-primary" />
      <span className="text-xs font-semibold text-primary uppercase tracking-wider">{label}</span>
    </div>
  );
}

function EventDetailModal({
  event,
  open,
  onClose,
}: {
  event: AccessEvent | null;
  open: boolean;
  onClose: () => void;
}) {
  const e = event?.event ?? null;
  const isEntry = e?.eventType === "entry";

  if (!e) {
    return (
      <Dialog open={open} onOpenChange={onClose}>
        <DialogContent className="max-w-3xl bg-card border-border">
          <DialogHeader>
            <DialogTitle className="text-foreground">Cargando...</DialogTitle>
          </DialogHeader>
        </DialogContent>
      </Dialog>
    );
  }

  const vehicleLabel = (type: string) => {
    const map: Record<string, string> = { truck: "Camión", car: "Auto", van: "Camioneta", motorcycle: "Moto", person: "Persona", unknown: "Desconocido" };
    return map[type] || type;
  };

  return (
    <Dialog open={open} onOpenChange={onClose}>
      <DialogContent className="max-w-3xl bg-card border-border max-h-[90vh] overflow-y-auto">
        <DialogHeader>
          <DialogTitle className="flex items-center gap-2 text-foreground">
            {isEntry ? (
              <TrendingUp className="w-4 h-4 text-green-400" />
            ) : (
              <TrendingDown className="w-4 h-4 text-red-400" />
            )}
            Evento #{e.id} — {isEntry ? "ENTRADA" : e.eventType === "exit" ? "SALIDA" : "DESCONOCIDO"}
            <Badge className={`ml-2 text-xs ${isEntry ? "bg-green-500/15 text-green-400 border-green-500/30" : e.eventType === "exit" ? "bg-red-500/15 text-red-400 border-red-500/30" : "bg-gray-500/15 text-gray-400"}`}>
              {vehicleLabel(e.vehicleType)}
            </Badge>
          </DialogTitle>
        </DialogHeader>

        <div className="space-y-4">
          {e.evidenceFrameUrl && (
            <div className="rounded-lg overflow-hidden border border-border">
              <img
                src={e.evidenceFrameUrl}
                alt="Frame de evidencia"
                className="w-full object-cover max-h-64"
              />
              <div className="px-3 py-1.5 bg-secondary flex items-center gap-2">
                <Image className="w-3 h-3 text-muted-foreground" />
                <span className="text-xs text-muted-foreground">Fotograma de evidencia — {new Date(e.eventTimestamp).toLocaleString("es-AR")}</span>
              </div>
            </div>
          )}

          <div className="grid grid-cols-2 gap-4">
            <div>
              <SectionTitle icon={Eye} label="Identificación" />
              <div className="bg-secondary/50 rounded-lg p-3 space-y-0">
                <InfoRow label="Tipo" value={`${vehicleLabel(e.vehicleType)}${e.vehicleSubtype ? ` (${e.vehicleSubtype})` : ""}`} />
                <InfoRow label="Marca" value={e.vehicleBrand} />
                <InfoRow label="Modelo" value={e.vehicleModel} />
                <InfoRow label="Año estimado" value={e.vehicleYear} />
                <InfoRow label="Color principal" value={e.vehicleColor} />
                <InfoRow label="Color secundario" value={e.vehicleColorSecondary} />
                <InfoRow label="Patente" value={e.vehiclePlate} accent="text-primary font-mono" />
                <InfoRow label="Empresa/Logo" value={e.hasCompany} accent="text-yellow-400" />
                <InfoRow label="Señalización" value={e.hasSignage} />
              </div>

              <SectionTitle icon={Wrench} label="Configuración" />
              <div className="bg-secondary/50 rounded-lg p-3 space-y-0">
                <InfoRow label="Tipo de cabina" value={e.cabinType} />
                <InfoRow label="Ejes" value={e.axleCount} />
                <InfoRow label="Remolque" value={e.hasTrailer === null ? null : e.hasTrailer ? `Sí${e.trailerType ? ` — ${e.trailerType}` : ""}` : "No"} />
                <InfoRow label="Luces en techo" value={e.hasRoofLights === null ? null : e.hasRoofLights ? "Sí" : "No"} />
                <InfoRow label="Chimenea escape" value={e.hasExhaustStack === null ? null : e.hasExhaustStack ? "Sí" : "No"} />
                <InfoRow label="Características únicas" value={e.distinctiveFeatures} />
              </div>
            </div>

            <div>
              <SectionTitle icon={Shield} label="Evento" />
              <div className="bg-secondary/50 rounded-lg p-3 space-y-0">
                <InfoRow label="Tipo de evento" value={isEntry ? "ENTRADA" : e.eventType === "exit" ? "SALIDA" : "DESCONOCIDO"} accent={isEntry ? "text-green-400 font-bold" : e.eventType === "exit" ? "text-red-400 font-bold" : "text-muted-foreground"} />
                <InfoRow label="Dirección" value={directionLabel(e.direction)} />
                <InfoRow label="Cámara" value={event?.camera?.name || "Desconocida"} />
                <InfoRow label="Fecha y hora" value={new Date(e.eventTimestamp).toLocaleString("es-AR")} />
                <InfoRow label="Confianza análisis" value={e.confidence ? `${Math.round(e.confidence * 100)}%` : null} accent={e.confidence && e.confidence > 0.7 ? "text-green-400" : "text-yellow-400"} />
                <InfoRow label="Confianza dirección" value={e.directionConfidence ? `${Math.round(e.directionConfidence * 100)}%` : null} accent={e.directionConfidence && e.directionConfidence > 0.7 ? "text-green-400" : "text-yellow-400"} />
              </div>

              <SectionTitle icon={Package} label="Carga" />
              <div className="bg-secondary/50 rounded-lg p-3 space-y-0">
                <InfoRow label="¿Lleva carga?" value={e.hasLoad === null ? "No determinado" : e.hasLoad ? "Sí" : "No"} accent={e.hasLoad ? "text-yellow-400" : undefined} />
                <InfoRow label="Tipo de carga" value={e.loadType} />
                <InfoRow label="Peso estimado" value={e.estimatedLoadWeight} />
                <InfoRow label="Descripción" value={e.loadDescription} />
              </div>

              <SectionTitle icon={Tag} label="Condición" />
              <div className="bg-secondary/50 rounded-lg p-3 space-y-0">
                <InfoRow label="Estado carrocería" value={e.bodyCondition} />
                <InfoRow label="Daños visibles" value={e.hasVisibleDamage === null ? null : e.hasVisibleDamage ? "Sí" : "No"} accent={e.hasVisibleDamage ? "text-red-400" : undefined} />
                <InfoRow label="Descripción daños" value={e.damageDescription} accent="text-red-400" />
                <InfoRow label="Limpieza" value={e.cleanlinessLevel} />
                <InfoRow label="Conductor visible" value={e.driverVisible === null ? null : e.driverVisible ? "Sí" : "No"} />
                <InfoRow label="Ocupantes visibles" value={e.visibleOccupants ? String(e.visibleOccupants) : null} />
              </div>
            </div>
          </div>

          {e.llmDescription && (
            <div className="p-4 rounded-lg bg-secondary border border-border">
              <p className="text-xs text-muted-foreground mb-2 font-semibold uppercase tracking-wider flex items-center gap-1.5">
                <Shield className="w-3 h-3 text-primary" />
                Descripción completa del análisis IA
              </p>
              <p className="text-sm text-foreground leading-relaxed">{e.llmDescription}</p>
            </div>
          )}
        </div>
      </DialogContent>
    </Dialog>
  );
}

function HasReportButton({ eventId }: { eventId: number }) {
  const { data: report } = trpc.reports.getByEventId.useQuery({ eventId });
  if (!report) return null;
  return (
    <Link href={`/reports/${eventId}`} onClick={(e) => e.stopPropagation()}>
      <Button
        variant="outline"
        size="sm"
        className="h-7 text-xs w-full border-primary/40 text-primary hover:bg-primary/10"
      >
        <Brain className="w-3 h-3 mr-1" />
        Ver análisis detallado
      </Button>
    </Link>
  );
}

// ─── Video group header ───────────────────────────────────────────────────────

function VideoGroupHeader({
  group,
  colorIdx,
  isCollapsed,
  onToggle,
}: {
  group: VideoGroup;
  colorIdx: number;
  isCollapsed: boolean;
  onToggle: () => void;
}) {
  const textColor = GROUP_TEXT_COLORS[colorIdx % GROUP_TEXT_COLORS.length];
  const bgColor = GROUP_BG_COLORS[colorIdx % GROUP_BG_COLORS.length];
  const borderColor = GROUP_COLORS[colorIdx % GROUP_COLORS.length];

  const entryCount = group.events.filter((ev) => ev.event.eventType === "entry").length;
  const exitCount = group.events.filter((ev) => ev.event.eventType === "exit").length;
  const vehicleTypes = Array.from(new Set(group.events.map((ev) => ev.event.vehicleType)));

  const filename = group.videoFilename
    ? group.videoFilename.replace(/\.[^/.]+$/, "").slice(0, 40)
    : `Video #${group.videoUploadId}`;

  return (
    <div
      className={`flex items-center gap-3 px-4 py-2.5 cursor-pointer border-l-2 ${borderColor} ${bgColor} hover:brightness-110 transition-all`}
      onClick={onToggle}
    >
      <Film className={`w-3.5 h-3.5 ${textColor} shrink-0`} />
      <div className="flex-1 min-w-0">
        <div className="flex items-center gap-2 flex-wrap">
          <span className={`text-xs font-semibold ${textColor} font-mono truncate max-w-64`}>
            {filename}
          </span>
          <Badge className={`text-xs h-4 px-1.5 ${bgColor} ${textColor} border-current/30`}>
            <Layers className="w-2.5 h-2.5 mr-1" />
            {group.events.length} vehículo{group.events.length !== 1 ? "s" : ""}
          </Badge>
          {entryCount > 0 && (
            <Badge className="text-xs h-4 px-1.5 bg-green-500/15 text-green-400 border-green-500/30">
              {entryCount} entrada{entryCount !== 1 ? "s" : ""}
            </Badge>
          )}
          {exitCount > 0 && (
            <Badge className="text-xs h-4 px-1.5 bg-red-500/15 text-red-400 border-red-500/30">
              {exitCount} salida{exitCount !== 1 ? "s" : ""}
            </Badge>
          )}
          {vehicleTypes.map((vt) => (
            <span key={vt} className="text-xs text-muted-foreground capitalize">{vt !== "unknown" ? vt : ""}</span>
          ))}
        </div>
        <div className="flex items-center gap-2 mt-0.5">
          <Clock className="w-2.5 h-2.5 text-muted-foreground" />
          <span className="text-xs text-muted-foreground">
            {new Date(group.firstTimestamp).toLocaleString("es-AR", {
              day: "2-digit", month: "2-digit", year: "numeric",
              hour: "2-digit", minute: "2-digit",
            })}
          </span>
          {group.cameraName && (
            <>
              <span className="text-muted-foreground/40">·</span>
              <span className="text-xs text-muted-foreground">{group.cameraName.split(" - ")[0]}</span>
            </>
          )}
        </div>
      </div>
      {isCollapsed ? (
        <ChevronDown className="w-3.5 h-3.5 text-muted-foreground shrink-0" />
      ) : (
        <ChevronUp className="w-3.5 h-3.5 text-muted-foreground shrink-0" />
      )}
    </div>
  );
}

// ─── Main page ────────────────────────────────────────────────────────────────

export default function AccessRecords() {
  const [search, setSearch] = useState("");
  const [filterType, setFilterType] = useState<string>("all");
  const [filterEvent, setFilterEvent] = useState<string>("all");
  const [filterCamera, setFilterCamera] = useState<string>("all");
  const [selectedEvent, setSelectedEvent] = useState<AccessEvent | null>(null);
  const [expandedId, setExpandedId] = useState<number | null>(null);
  const [collapsedGroups, setCollapsedGroups] = useState<Set<number>>(new Set());

  const { data: events, isLoading } = trpc.events.list.useQuery({
    limit: 200,
    offset: 0,
    ...(filterEvent !== "all" ? { eventType: filterEvent as "entry" | "exit" | "unknown" } : {}),
    ...(filterCamera !== "all" ? { cameraId: parseInt(filterCamera) } : {}),
  });

  const { data: cameras } = trpc.cameras.list.useQuery();

  const filteredEvents = useMemo(() => {
    if (!events) return [];
    return events.filter((ev) => {
      const e = ev.event as EventRow;
      if (filterType !== "all" && e.vehicleType !== filterType) return false;
      if (search) {
        const s = search.toLowerCase();
        const matches =
          (e.vehicleColor?.toLowerCase().includes(s)) ||
          (e.vehicleColorSecondary?.toLowerCase().includes(s)) ||
          (e.vehiclePlate?.toLowerCase().includes(s)) ||
          (e.vehicleBrand?.toLowerCase().includes(s)) ||
          (e.vehicleModel?.toLowerCase().includes(s)) ||
          (e.hasCompany?.toLowerCase().includes(s)) ||
          (e.hasSignage?.toLowerCase().includes(s)) ||
          (e.distinctiveFeatures?.toLowerCase().includes(s)) ||
          (e.llmDescription?.toLowerCase().includes(s)) ||
          (ev as AccessEvent).videoFilename?.toLowerCase().includes(s) ||
          (ev.camera as { name: string } | null)?.name?.toLowerCase().includes(s);
        if (!matches) return false;
      }
      return true;
    }) as AccessEvent[];
  }, [events, filterType, search]);

  // Group events by videoUploadId, preserving order (most recent first)
  const videoGroups = useMemo(() => {
    const groupMap = new Map<number, VideoGroup>();
    const groupOrder: number[] = [];

    for (const ev of filteredEvents) {
      const e = ev.event as EventRow;
      const uploadId = e.videoUploadId ?? 0;

      if (!groupMap.has(uploadId)) {
        groupOrder.push(uploadId);
        groupMap.set(uploadId, {
          videoUploadId: uploadId,
          videoFilename: ev.videoFilename ?? null,
          cameraName: ev.camera?.name ?? null,
          cameraId: e.cameraId,
          events: [],
          firstTimestamp: e.eventTimestamp,
        });
      }
      groupMap.get(uploadId)!.events.push(ev);
    }

    return groupOrder.map((id) => groupMap.get(id)!);
  }, [filteredEvents]);

  const toggleGroup = (uploadId: number) => {
    setCollapsedGroups((prev) => {
      const next = new Set(prev);
      if (next.has(uploadId)) next.delete(uploadId);
      else next.add(uploadId);
      return next;
    });
  };

  const vehicleIcon = (type: string) => {
    if (type === "truck") return <Truck className="w-3.5 h-3.5 text-yellow-400" />;
    if (type === "person") return <Users className="w-3.5 h-3.5 text-blue-400" />;
    return <Car className="w-3.5 h-3.5 text-blue-400" />;
  };

  const vehicleLabel = (type: string) => {
    const map: Record<string, string> = {
      truck: "Camión", car: "Auto", van: "Camioneta",
      motorcycle: "Moto", person: "Persona", unknown: "Desconocido",
    };
    return map[type] || type;
  };

  const multiVehicleGroups = videoGroups.filter((g) => g.events.length > 1).length;

  return (
    <AccessControlLayout title="Registros de Acceso">
      <div className="space-y-6">
        <div>
          <h2 className="text-xl font-bold text-foreground">Planilla de Registros</h2>
          <p className="text-sm text-muted-foreground mt-0.5">
            Historial completo de ingresos y egresos detectados por el sistema
          </p>
        </div>

        {/* Filters */}
        <Card className="bg-card border-border">
          <CardContent className="p-4">
            <div className="flex flex-wrap gap-3">
              <div className="flex items-center gap-2 flex-1 min-w-48">
                <Search className="w-4 h-4 text-muted-foreground shrink-0" />
                <Input
                  placeholder="Buscar por color, patente, marca, empresa, descripción..."
                  value={search}
                  onChange={(e) => setSearch(e.target.value)}
                  className="h-8 text-sm bg-secondary border-border"
                />
              </div>
              <Select value={filterEvent} onValueChange={setFilterEvent}>
                <SelectTrigger className="w-36 h-8 text-sm bg-secondary border-border">
                  <Filter className="w-3 h-3 mr-1" />
                  <SelectValue placeholder="Evento" />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="all">Todos</SelectItem>
                  <SelectItem value="entry">Entradas</SelectItem>
                  <SelectItem value="exit">Salidas</SelectItem>
                </SelectContent>
              </Select>
              <Select value={filterType} onValueChange={setFilterType}>
                <SelectTrigger className="w-36 h-8 text-sm bg-secondary border-border">
                  <SelectValue placeholder="Vehículo" />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="all">Todos</SelectItem>
                  <SelectItem value="truck">Camiones</SelectItem>
                  <SelectItem value="car">Autos</SelectItem>
                  <SelectItem value="van">Camionetas</SelectItem>
                  <SelectItem value="motorcycle">Motos</SelectItem>
                  <SelectItem value="person">Personas</SelectItem>
                </SelectContent>
              </Select>
              <Select value={filterCamera} onValueChange={setFilterCamera}>
                <SelectTrigger className="w-40 h-8 text-sm bg-secondary border-border">
                  <SelectValue placeholder="Cámara" />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="all">Todas las cámaras</SelectItem>
                  {cameras?.map((cam) => (
                    <SelectItem key={cam.id} value={String(cam.id)}>
                      {cam.name.slice(0, 20)}...
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>
          </CardContent>
        </Card>

        {/* Summary row */}
        <div className="flex items-center gap-4 text-sm text-muted-foreground flex-wrap">
          <span>
            <span className="font-medium text-foreground">{filteredEvents.length}</span> eventos
            {" · "}
            <span className="font-medium text-foreground">{videoGroups.length}</span> videos
          </span>
          {multiVehicleGroups > 0 && (
            <Badge className="text-xs bg-primary/15 text-primary border-primary/30 gap-1">
              <Layers className="w-3 h-3" />
              {multiVehicleGroups} video{multiVehicleGroups !== 1 ? "s" : ""} con múltiples vehículos
            </Badge>
          )}
          {search && <span>· Búsqueda: "{search}"</span>}
        </div>

        {/* Records grouped by video */}
        <Card className="bg-card border-border overflow-hidden">
          <CardHeader className="pb-0 px-4 pt-4">
            <CardTitle className="text-sm font-semibold text-muted-foreground uppercase tracking-wider flex items-center gap-2">
              <Film className="w-3.5 h-3.5" />
              Registros agrupados por video
            </CardTitle>
          </CardHeader>
          <CardContent className="p-0">
            {isLoading ? (
              <div className="flex items-center justify-center py-16">
                <Loader2 className="w-6 h-6 animate-spin text-primary" />
              </div>
            ) : filteredEvents.length === 0 ? (
              <div className="flex flex-col items-center justify-center py-16 text-center">
                <AlertCircle className="w-8 h-8 text-muted-foreground mb-3" />
                <p className="text-sm font-medium text-foreground">Sin registros</p>
                <p className="text-xs text-muted-foreground mt-1">
                  No hay eventos que coincidan con los filtros aplicados
                </p>
              </div>
            ) : (
              <div className="divide-y divide-border">
                {/* Table header */}
                <div className="grid grid-cols-12 gap-2 px-4 py-2 bg-secondary text-xs font-medium text-muted-foreground uppercase tracking-wider">
                  <div className="col-span-1">#</div>
                  <div className="col-span-2">Fecha/Hora</div>
                  <div className="col-span-1">Evento</div>
                  <div className="col-span-2">Vehículo</div>
                  <div className="col-span-2">Marca / Subtipo</div>
                  <div className="col-span-1">Color</div>
                  <div className="col-span-1">Patente</div>
                  <div className="col-span-1">Carga</div>
                  <div className="col-span-1">Dir.</div>
                </div>

                {videoGroups.map((group, groupIdx) => {
                  const isCollapsed = collapsedGroups.has(group.videoUploadId);
                  const borderColor = GROUP_COLORS[groupIdx % GROUP_COLORS.length];

                  return (
                    <div key={group.videoUploadId}>
                      {/* Group header — only shown when group has >1 event OR always for clarity */}
                      <VideoGroupHeader
                        group={group}
                        colorIdx={groupIdx}
                        isCollapsed={isCollapsed}
                        onToggle={() => toggleGroup(group.videoUploadId)}
                      />

                      {/* Group events */}
                      {!isCollapsed && group.events.map((ev) => {
                        const e = ev.event as EventRow;
                        const cam = ev.camera as { name: string } | null;
                        const isEntry = e.eventType === "entry";
                        const isExpanded = expandedId === e.id;

                        return (
                          <div key={e.id} className={`border-l-2 ${borderColor} ml-0`}>
                            <div
                              className="grid grid-cols-12 gap-2 px-4 py-3 hover:bg-secondary/50 cursor-pointer transition-colors items-center"
                              onClick={() => setExpandedId(isExpanded ? null : e.id)}
                            >
                              <div className="col-span-1 text-xs text-muted-foreground font-mono">
                                {e.id}
                              </div>
                              <div className="col-span-2">
                                <div className="flex items-center gap-1">
                                  <Clock className="w-3 h-3 text-muted-foreground shrink-0" />
                                  <span className="text-xs text-foreground">
                                    {new Date(e.eventTimestamp).toLocaleString("es-AR", {
                                      day: "2-digit", month: "2-digit",
                                      hour: "2-digit", minute: "2-digit",
                                    })}
                                  </span>
                                </div>
                                <div className="text-xs text-muted-foreground truncate mt-0.5 pl-4">
                                  {cam?.name?.split(" - ")[0] || "—"}
                                </div>
                              </div>
                              <div className="col-span-1">
                                <Badge className={`text-xs px-1.5 ${isEntry ? "bg-green-500/15 text-green-400 border-green-500/30" : e.eventType === "exit" ? "bg-red-500/15 text-red-400 border-red-500/30" : "bg-gray-500/15 text-gray-400 border-gray-500/30"}`}>
                                  {isEntry ? "↑ ENT" : e.eventType === "exit" ? "↓ SAL" : "?"}
                                </Badge>
                              </div>
                              <div className="col-span-2 flex items-center gap-1.5">
                                {vehicleIcon(e.vehicleType)}
                                <span className="text-xs text-foreground">{vehicleLabel(e.vehicleType)}</span>
                              </div>
                              <div className="col-span-2 text-xs text-muted-foreground truncate">
                                {[e.vehicleBrand, e.vehicleSubtype].filter(Boolean).join(" · ") || "—"}
                              </div>
                              <div className="col-span-1 text-xs text-foreground capitalize">
                                {e.vehicleColor || "—"}
                              </div>
                              <div className="col-span-1 text-xs font-mono text-primary">
                                {e.vehiclePlate || "—"}
                              </div>
                              <div className="col-span-1 text-xs text-foreground">
                                {e.hasLoad === null ? "—" : e.hasLoad ? "✓" : "✗"}
                              </div>
                              <div className="col-span-1 flex items-center gap-1">
                                <DirectionIcon direction={e.direction} />
                                {isExpanded ? (
                                  <ChevronUp className="w-3 h-3 text-muted-foreground ml-auto" />
                                ) : (
                                  <ChevronDown className="w-3 h-3 text-muted-foreground ml-auto" />
                                )}
                              </div>
                            </div>

                            {/* Expanded row */}
                            {isExpanded && (
                              <div className="px-4 py-3 bg-secondary/30 border-t border-border">
                                <div className="flex items-start gap-4">
                                  {e.evidenceFrameUrl && (
                                    <img
                                      src={e.evidenceFrameUrl}
                                      alt="Evidencia"
                                      className="w-36 h-24 object-cover rounded-md border border-border shrink-0"
                                    />
                                  )}
                                  <div className="flex-1 min-w-0 space-y-1.5">
                                    <div className="flex flex-wrap gap-2">
                                      {e.vehicleBrand && (
                                        <Badge variant="outline" className="text-xs h-5">{e.vehicleBrand}{e.vehicleModel ? ` ${e.vehicleModel}` : ""}</Badge>
                                      )}
                                      {e.vehicleYear && (
                                        <Badge variant="outline" className="text-xs h-5">{e.vehicleYear}</Badge>
                                      )}
                                      {e.hasCompany && (
                                        <Badge className="text-xs h-5 bg-yellow-500/15 text-yellow-400 border-yellow-500/30">{e.hasCompany}</Badge>
                                      )}
                                      {e.axleCount && (
                                        <Badge variant="outline" className="text-xs h-5">{e.axleCount} ejes</Badge>
                                      )}
                                      {e.hasTrailer && (
                                        <Badge variant="outline" className="text-xs h-5">Con remolque{e.trailerType ? `: ${e.trailerType}` : ""}</Badge>
                                      )}
                                      {e.hasLoad && e.loadType && (
                                        <Badge className="text-xs h-5 bg-orange-500/15 text-orange-400 border-orange-500/30">Carga: {e.loadType}</Badge>
                                      )}
                                      {e.hasVisibleDamage && (
                                        <Badge className="text-xs h-5 bg-red-500/15 text-red-400 border-red-500/30">Daños visibles</Badge>
                                      )}
                                      {e.bodyCondition && (
                                        <Badge variant="outline" className="text-xs h-5 capitalize">{e.bodyCondition}</Badge>
                                      )}
                                      {e.confidence !== null && (
                                        <Badge variant="outline" className={`text-xs h-5 ${e.confidence > 0.7 ? "text-green-400" : "text-yellow-400"}`}>
                                          IA: {Math.round((e.confidence || 0) * 100)}%
                                        </Badge>
                                      )}
                                    </div>
                                    <p className="text-xs text-muted-foreground font-medium">Descripción IA:</p>
                                    <p className="text-xs text-foreground leading-relaxed line-clamp-3">
                                      {e.llmDescription || "Sin descripción disponible"}
                                    </p>
                                  </div>
                                  <div className="flex flex-col gap-1.5 shrink-0">
                                    <Button
                                      variant="outline"
                                      size="sm"
                                      className="h-7 text-xs w-full"
                                      onClick={(mouseEv) => {
                                        mouseEv.stopPropagation();
                                        setSelectedEvent(ev);
                                      }}
                                    >
                                      Ver detalle completo
                                    </Button>
                                    <HasReportButton eventId={e.id} />
                                  </div>
                                </div>
                              </div>
                            )}
                          </div>
                        );
                      })}
                    </div>
                  );
                })}
              </div>
            )}
          </CardContent>
        </Card>
      </div>

      <EventDetailModal
        event={selectedEvent}
        open={!!selectedEvent}
        onClose={() => setSelectedEvent(null)}
      />
    </AccessControlLayout>
  );
}
