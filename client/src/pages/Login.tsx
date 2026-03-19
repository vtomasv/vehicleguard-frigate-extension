import { useAuth } from "@/_core/hooks/useAuth";
import { getLoginUrl } from "@/const";
import { useEffect, useState } from "react";
import { useLocation } from "wouter";
import { Shield, Camera, Lock, ChevronRight, Loader2, Eye, EyeOff, AlertCircle } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { trpc } from "@/lib/trpc";

// Detect if running in local auth mode (Docker standalone)
const IS_LOCAL_AUTH = import.meta.env.VITE_AUTH_MODE === "local";

function LocalLoginForm({ onSuccess }: { onSuccess: () => void }) {
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [showPassword, setShowPassword] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [loading, setLoading] = useState(false);
  const utils = trpc.useUtils();

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setError(null);
    setLoading(true);
    try {
      const res = await fetch("/api/auth/login", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        credentials: "include",
        body: JSON.stringify({ email, password }),
      });
      const data = await res.json();
      if (!res.ok) {
        setError(data.error ?? "Error al iniciar sesión");
        return;
      }
      // Invalidate the auth.me query so the layout re-checks auth
      await utils.auth.me.invalidate();
      onSuccess();
    } catch {
      setError("Error de conexión. Verifica que el servidor esté activo.");
    } finally {
      setLoading(false);
    }
  };

  return (
    <form onSubmit={handleSubmit} className="space-y-5">
      {error && (
        <div className="flex items-start gap-3 p-3 rounded-lg bg-destructive/10 border border-destructive/20">
          <AlertCircle className="w-4 h-4 text-destructive shrink-0 mt-0.5" />
          <p className="text-sm text-destructive">{error}</p>
        </div>
      )}

      <div className="space-y-2">
        <Label htmlFor="email" className="text-sm font-medium text-foreground">
          Correo electrónico
        </Label>
        <Input
          id="email"
          type="email"
          placeholder="admin@vehicleguard.local"
          value={email}
          onChange={e => setEmail(e.target.value)}
          required
          autoComplete="email"
          className="h-11"
        />
      </div>

      <div className="space-y-2">
        <Label htmlFor="password" className="text-sm font-medium text-foreground">
          Contraseña
        </Label>
        <div className="relative">
          <Input
            id="password"
            type={showPassword ? "text" : "password"}
            placeholder="••••••••"
            value={password}
            onChange={e => setPassword(e.target.value)}
            required
            autoComplete="current-password"
            className="h-11 pr-10"
          />
          <button
            type="button"
            onClick={() => setShowPassword(v => !v)}
            className="absolute right-3 top-1/2 -translate-y-1/2 text-muted-foreground hover:text-foreground transition-colors"
          >
            {showPassword ? <EyeOff className="w-4 h-4" /> : <Eye className="w-4 h-4" />}
          </button>
        </div>
      </div>

      <Button
        type="submit"
        className="w-full h-12 text-base font-semibold gap-2"
        disabled={loading || !email || !password}
      >
        {loading ? (
          <Loader2 className="w-4 h-4 animate-spin" />
        ) : (
          <Shield className="w-4 h-4" />
        )}
        {loading ? "Verificando..." : "Iniciar Sesión"}
        {!loading && <ChevronRight className="w-4 h-4 ml-auto" />}
      </Button>

      <p className="text-center text-xs text-muted-foreground">
        Modo local — Crea el usuario admin con <code className="bg-muted px-1 rounded">node seed-admin.mjs</code>
      </p>
    </form>
  );
}

export default function Login() {
  const { isAuthenticated, loading } = useAuth();
  const [, navigate] = useLocation();

  useEffect(() => {
    if (!loading && isAuthenticated) {
      navigate("/dashboard");
    }
  }, [isAuthenticated, loading, navigate]);

  if (loading) {
    return (
      <div className="min-h-screen bg-background flex items-center justify-center">
        <Loader2 className="w-8 h-8 animate-spin text-primary" />
      </div>
    );
  }

  return (
    <div className="min-h-screen bg-background flex">
      {/* Left panel - branding */}
      <div className="hidden lg:flex lg:w-1/2 flex-col justify-between p-12 bg-card border-r border-border relative overflow-hidden">
        {/* Background grid pattern */}
        <div
          className="absolute inset-0 opacity-5"
          style={{
            backgroundImage: `linear-gradient(oklch(0.65 0.18 145) 1px, transparent 1px), linear-gradient(90deg, oklch(0.65 0.18 145) 1px, transparent 1px)`,
            backgroundSize: "40px 40px",
          }}
        />

        {/* Corner accent */}
        <div className="absolute top-0 left-0 w-64 h-64 bg-primary/5 rounded-full -translate-x-32 -translate-y-32" />
        <div className="absolute bottom-0 right-0 w-96 h-96 bg-primary/5 rounded-full translate-x-48 translate-y-48" />

        <div className="relative z-10">
          <div className="flex items-center gap-3 mb-2">
            <div className="w-10 h-10 rounded-lg bg-primary/20 border border-primary/30 flex items-center justify-center">
              <Shield className="w-5 h-5 text-primary" />
            </div>
            <span className="text-xs font-mono text-muted-foreground tracking-widest uppercase">
              VehicleGuard Pro
            </span>
          </div>
        </div>

        <div className="relative z-10 space-y-8">
          <div>
            <h1 className="text-4xl font-bold text-foreground leading-tight mb-4">
              Sistema de Control de Acceso{" "}
              <span className="text-primary">Vehicular</span>
            </h1>
            <p className="text-muted-foreground text-lg leading-relaxed">
              Monitoreo inteligente con análisis de video en tiempo real mediante
              visión artificial para control de acceso industrial.
            </p>
          </div>

          <div className="space-y-4">
            {[
              {
                icon: Camera,
                title: "Análisis de Video con IA",
                desc: "Detección automática de vehículos y personas con LLM de visión",
              },
              {
                icon: Shield,
                title: "Registro de Evidencia",
                desc: "Almacenamiento permanente con trazabilidad completa",
              },
              {
                icon: Lock,
                title: "Control de Acceso Dual",
                desc: "Cámara de camiones y cámara de vehículos/personas",
              },
            ].map(({ icon: Icon, title, desc }) => (
              <div key={title} className="flex items-start gap-4 p-4 rounded-lg bg-background/50 border border-border">
                <div className="w-9 h-9 rounded-md bg-primary/15 border border-primary/25 flex items-center justify-center shrink-0 mt-0.5">
                  <Icon className="w-4 h-4 text-primary" />
                </div>
                <div>
                  <p className="text-sm font-semibold text-foreground">{title}</p>
                  <p className="text-xs text-muted-foreground mt-0.5">{desc}</p>
                </div>
              </div>
            ))}
          </div>
        </div>

        <div className="relative z-10">
          <div className="flex items-center gap-2">
            <div className="w-2 h-2 rounded-full bg-primary live-indicator" />
            <span className="text-xs text-muted-foreground font-mono">
              {IS_LOCAL_AUTH ? "Modo local — Docker standalone" : "Sistema operativo — 2 cámaras activas"}
            </span>
          </div>
        </div>
      </div>

      {/* Right panel - login form */}
      <div className="flex-1 flex flex-col items-center justify-center p-8">
        <div className="w-full max-w-md space-y-8">
          {/* Mobile logo */}
          <div className="lg:hidden flex items-center gap-3 mb-8">
            <div className="w-10 h-10 rounded-lg bg-primary/20 border border-primary/30 flex items-center justify-center">
              <Shield className="w-5 h-5 text-primary" />
            </div>
            <span className="text-sm font-mono text-muted-foreground tracking-widest uppercase">
              VehicleGuard Pro
            </span>
          </div>

          <div className="space-y-2">
            <h2 className="text-2xl font-bold text-foreground">Acceso al Sistema</h2>
            <p className="text-muted-foreground text-sm">
              {IS_LOCAL_AUTH
                ? "Ingresa con tu email y contraseña de administrador."
                : "Ingresa con tu cuenta para acceder al panel de control de acceso vehicular."}
            </p>
          </div>

          {/* Login card */}
          <div className="bg-card border border-border rounded-xl p-8 space-y-6">
            {IS_LOCAL_AUTH ? (
              <LocalLoginForm onSuccess={() => navigate("/dashboard")} />
            ) : (
              <>
                <div className="flex items-center gap-3 p-4 rounded-lg bg-primary/10 border border-primary/20">
                  <Lock className="w-4 h-4 text-primary shrink-0" />
                  <p className="text-xs text-muted-foreground">
                    Acceso protegido mediante autenticación segura. Solo personal autorizado.
                  </p>
                </div>

                <Button
                  className="w-full h-12 text-base font-semibold gap-2"
                  onClick={() => {
                    window.location.href = getLoginUrl();
                  }}
                >
                  <Shield className="w-4 h-4" />
                  Iniciar Sesión
                  <ChevronRight className="w-4 h-4 ml-auto" />
                </Button>

                <div className="relative">
                  <div className="absolute inset-0 flex items-center">
                    <div className="w-full border-t border-border" />
                  </div>
                  <div className="relative flex justify-center text-xs">
                    <span className="bg-card px-3 text-muted-foreground">Sistema de Seguridad Industrial</span>
                  </div>
                </div>

                <div className="grid grid-cols-3 gap-3 text-center">
                  {[
                    { label: "Cámaras", value: "2" },
                    { label: "Análisis IA", value: "LLM" },
                    { label: "Evidencia", value: "S3" },
                  ].map(({ label, value }) => (
                    <div key={label} className="p-3 rounded-lg bg-background border border-border">
                      <p className="text-lg font-bold text-primary">{value}</p>
                      <p className="text-xs text-muted-foreground mt-0.5">{label}</p>
                    </div>
                  ))}
                </div>
              </>
            )}
          </div>

          <p className="text-center text-xs text-muted-foreground">
            VehicleGuard Pro — Sistema de Control de Acceso Vehicular v1.0
          </p>
        </div>
      </div>
    </div>
  );
}
