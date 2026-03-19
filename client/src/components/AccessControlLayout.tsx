import { useAuth } from "@/_core/hooks/useAuth";
import { getLoginUrl } from "@/const";
import { useEffect } from "react";
import { useLocation, Link } from "wouter";
import {
  Shield,
  Camera,
  LayoutDashboard,
  FileText,
  BarChart3,
  LogOut,
  Menu,
  X,
  Loader2,
  Settings2,
} from "lucide-react";
import { Button } from "@/components/ui/button";
import { useState } from "react";
import { trpc } from "@/lib/trpc";
import { toast } from "sonner";

const navItems = [
  { href: "/dashboard", label: "Panel Principal", icon: LayoutDashboard },
  { href: "/cameras", label: "Cámaras", icon: Camera },
  { href: "/records", label: "Registros", icon: FileText },
  { href: "/analytics", label: "Analítica", icon: BarChart3 },
  { href: "/settings/api", label: "APIs y Modelos", icon: Settings2 },
];

interface Props {
  children: React.ReactNode;
  title?: string;
}

export default function AccessControlLayout({ children, title }: Props) {
  const { user, isAuthenticated, loading } = useAuth();
  const [location, navigate] = useLocation();
  const [sidebarOpen, setSidebarOpen] = useState(false);
  const logoutMutation = trpc.auth.logout.useMutation({
    onSuccess: () => {
      toast.success("Sesión cerrada correctamente");
      navigate("/login");
    },
  });

  useEffect(() => {
    if (!loading && !isAuthenticated) {
      window.location.href = getLoginUrl();
    }
  }, [isAuthenticated, loading]);

  if (loading) {
    return (
      <div className="min-h-screen bg-background flex items-center justify-center">
        <div className="flex flex-col items-center gap-4">
          <Loader2 className="w-8 h-8 animate-spin text-primary" />
          <p className="text-sm text-muted-foreground">Verificando acceso...</p>
        </div>
      </div>
    );
  }

  if (!isAuthenticated) return null;

  return (
    <div className="min-h-screen bg-background flex">
      {/* Mobile overlay */}
      {sidebarOpen && (
        <div
          className="fixed inset-0 bg-black/60 z-40 lg:hidden"
          onClick={() => setSidebarOpen(false)}
        />
      )}

      {/* Sidebar */}
      <aside
        className={`fixed lg:static inset-y-0 left-0 z-50 w-64 bg-sidebar border-r border-sidebar-border flex flex-col transition-transform duration-200 ${
          sidebarOpen ? "translate-x-0" : "-translate-x-full lg:translate-x-0"
        }`}
      >
        {/* Logo */}
        <div className="p-5 border-b border-sidebar-border">
          <div className="flex items-center gap-3">
            <div className="w-9 h-9 rounded-lg bg-primary/20 border border-primary/30 flex items-center justify-center shrink-0">
              <Shield className="w-4 h-4 text-primary" />
            </div>
            <div>
              <p className="text-sm font-bold text-sidebar-foreground leading-tight">VehicleGuard</p>
              <p className="text-xs text-muted-foreground font-mono">Control de Acceso</p>
            </div>
          </div>
        </div>

        {/* Status indicator */}
        <div className="px-4 py-3 border-b border-sidebar-border">
          <div className="flex items-center gap-2 px-3 py-2 rounded-md bg-primary/10 border border-primary/20">
            <div className="w-2 h-2 rounded-full bg-primary live-indicator shrink-0" />
            <span className="text-xs text-primary font-mono">Sistema Activo</span>
          </div>
        </div>

        {/* Navigation */}
        <nav className="flex-1 p-4 space-y-1">
          {navItems.map(({ href, label, icon: Icon }) => {
            const isActive = location === href || location.startsWith(href + "/");
            return (
              <Link key={href} href={href}>
                <div
                  className={`flex items-center gap-3 px-3 py-2.5 rounded-lg text-sm font-medium transition-colors cursor-pointer ${
                    isActive
                      ? "bg-primary/15 text-primary border border-primary/25"
                      : "text-sidebar-foreground hover:bg-sidebar-accent hover:text-sidebar-accent-foreground"
                  }`}
                  onClick={() => setSidebarOpen(false)}
                >
                  <Icon className="w-4 h-4 shrink-0" />
                  {label}
                  {isActive && (
                    <div className="ml-auto w-1.5 h-1.5 rounded-full bg-primary" />
                  )}
                </div>
              </Link>
            );
          })}
        </nav>

        {/* User section */}
        <div className="p-4 border-t border-sidebar-border space-y-3">
          <div className="flex items-center gap-3 px-3 py-2 rounded-lg bg-sidebar-accent">
            <div className="w-7 h-7 rounded-full bg-primary/20 border border-primary/30 flex items-center justify-center shrink-0">
              <span className="text-xs font-bold text-primary">
                {user?.name?.[0]?.toUpperCase() || "U"}
              </span>
            </div>
            <div className="min-w-0">
              <p className="text-xs font-semibold text-sidebar-foreground truncate">
                {user?.name || "Usuario"}
              </p>
              <p className="text-xs text-muted-foreground truncate">{user?.email || ""}</p>
            </div>
          </div>
          <Button
            variant="ghost"
            size="sm"
            className="w-full justify-start gap-2 text-muted-foreground hover:text-destructive hover:bg-destructive/10"
            onClick={() => logoutMutation.mutate()}
            disabled={logoutMutation.isPending}
          >
            {logoutMutation.isPending ? (
              <Loader2 className="w-4 h-4 animate-spin" />
            ) : (
              <LogOut className="w-4 h-4" />
            )}
            Cerrar Sesión
          </Button>
        </div>
      </aside>

      {/* Main content */}
      <div className="flex-1 flex flex-col min-w-0">
        {/* Top bar */}
        <header className="h-14 border-b border-border bg-card flex items-center px-4 gap-4 shrink-0">
          <Button
            variant="ghost"
            size="icon"
            className="lg:hidden"
            onClick={() => setSidebarOpen(!sidebarOpen)}
          >
            {sidebarOpen ? <X className="w-4 h-4" /> : <Menu className="w-4 h-4" />}
          </Button>
          <div className="flex items-center gap-2">
            <span className="text-xs text-muted-foreground font-mono">
              {new Date().toLocaleString("es-AR", {
                day: "2-digit",
                month: "2-digit",
                year: "numeric",
                hour: "2-digit",
                minute: "2-digit",
                second: "2-digit",
              })}
            </span>
          </div>
          {title && (
            <h1 className="text-sm font-semibold text-foreground ml-2">{title}</h1>
          )}
          <div className="ml-auto flex items-center gap-2">
            <div className="hidden sm:flex items-center gap-1.5 px-2.5 py-1 rounded-md bg-primary/10 border border-primary/20">
              <div className="w-1.5 h-1.5 rounded-full bg-primary live-indicator" />
              <span className="text-xs text-primary font-mono">EN VIVO</span>
            </div>
          </div>
        </header>

        {/* Page content */}
        <main className="flex-1 overflow-auto p-6">
          {children}
        </main>
      </div>
    </div>
  );
}
