import { useState } from "react";
import { useAuth } from "@/_core/hooks/useAuth";
import AccessControlLayout from "@/components/AccessControlLayout";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import {
  Card,
  CardContent,
  CardDescription,
  CardHeader,
  CardTitle,
} from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Separator } from "@/components/ui/separator";
import {
  User,
  Lock,
  Eye,
  EyeOff,
  CheckCircle2,
  AlertCircle,
  Shield,
  Mail,
  Calendar,
  KeyRound,
} from "lucide-react";
import { toast } from "sonner";

const IS_LOCAL_AUTH = import.meta.env.VITE_AUTH_MODE === "local";

// Password strength checker
function getPasswordStrength(password: string): { score: number; label: string; color: string } {
  if (!password) return { score: 0, label: "", color: "" };
  let score = 0;
  if (password.length >= 8) score++;
  if (password.length >= 12) score++;
  if (/[A-Z]/.test(password)) score++;
  if (/[0-9]/.test(password)) score++;
  if (/[^A-Za-z0-9]/.test(password)) score++;

  if (score <= 1) return { score, label: "Muy débil", color: "bg-destructive" };
  if (score === 2) return { score, label: "Débil", color: "bg-orange-500" };
  if (score === 3) return { score, label: "Moderada", color: "bg-yellow-500" };
  if (score === 4) return { score, label: "Fuerte", color: "bg-emerald-500" };
  return { score, label: "Muy fuerte", color: "bg-primary" };
}

function PasswordInput({
  id,
  value,
  onChange,
  placeholder,
  autoComplete,
}: {
  id: string;
  value: string;
  onChange: (v: string) => void;
  placeholder?: string;
  autoComplete?: string;
}) {
  const [show, setShow] = useState(false);
  return (
    <div className="relative">
      <Input
        id={id}
        type={show ? "text" : "password"}
        value={value}
        onChange={e => onChange(e.target.value)}
        placeholder={placeholder ?? "••••••••"}
        autoComplete={autoComplete}
        className="h-11 pr-10"
      />
      <button
        type="button"
        onClick={() => setShow(v => !v)}
        className="absolute right-3 top-1/2 -translate-y-1/2 text-muted-foreground hover:text-foreground transition-colors"
        tabIndex={-1}
      >
        {show ? <EyeOff className="w-4 h-4" /> : <Eye className="w-4 h-4" />}
      </button>
    </div>
  );
}

export default function UserProfile() {
  const { user } = useAuth();

  // Password change state
  const [currentPassword, setCurrentPassword] = useState("");
  const [newPassword, setNewPassword] = useState("");
  const [confirmPassword, setConfirmPassword] = useState("");
  const [loading, setLoading] = useState(false);
  const [success, setSuccess] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const strength = getPasswordStrength(newPassword);
  const passwordsMatch = newPassword === confirmPassword;
  const canSubmit =
    currentPassword.length > 0 &&
    newPassword.length >= 8 &&
    passwordsMatch &&
    !loading;

  const handleChangePassword = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!canSubmit) return;

    setError(null);
    setSuccess(false);
    setLoading(true);

    try {
      const res = await fetch("/api/auth/change-password", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        credentials: "include",
        body: JSON.stringify({ currentPassword, newPassword }),
      });
      const data = await res.json();
      if (!res.ok) {
        setError(data.error ?? "Error al cambiar la contraseña");
        return;
      }
      setSuccess(true);
      setCurrentPassword("");
      setNewPassword("");
      setConfirmPassword("");
      toast.success("Contraseña actualizada correctamente");
    } catch {
      setError("Error de conexión. Verifica que el servidor esté activo.");
    } finally {
      setLoading(false);
    }
  };

  return (
    <AccessControlLayout title="Perfil de Usuario">
      <div className="max-w-2xl mx-auto space-y-6">

        {/* Header */}
        <div>
          <h1 className="text-2xl font-bold text-foreground">Perfil de Usuario</h1>
          <p className="text-sm text-muted-foreground mt-1">
            Información de tu cuenta y configuración de seguridad.
          </p>
        </div>

        {/* User info card */}
        <Card>
          <CardHeader className="pb-4">
            <CardTitle className="text-base flex items-center gap-2">
              <User className="w-4 h-4 text-primary" />
              Información de la Cuenta
            </CardTitle>
          </CardHeader>
          <CardContent className="space-y-4">
            <div className="flex items-center gap-4">
              <div className="w-14 h-14 rounded-full bg-primary/15 border-2 border-primary/25 flex items-center justify-center shrink-0">
                <span className="text-xl font-bold text-primary">
                  {user?.name?.[0]?.toUpperCase() ?? "U"}
                </span>
              </div>
              <div className="min-w-0">
                <p className="font-semibold text-foreground text-lg leading-tight">
                  {user?.name ?? "Usuario"}
                </p>
                <p className="text-sm text-muted-foreground">{user?.email ?? "—"}</p>
              </div>
              <div className="ml-auto">
                <Badge
                  variant="outline"
                  className={
                    user?.role === "admin"
                      ? "border-primary/40 text-primary bg-primary/10"
                      : "border-border text-muted-foreground"
                  }
                >
                  <Shield className="w-3 h-3 mr-1" />
                  {user?.role === "admin" ? "Administrador" : "Usuario"}
                </Badge>
              </div>
            </div>

            <Separator />

            <div className="grid grid-cols-1 sm:grid-cols-2 gap-4 text-sm">
              <div className="flex items-center gap-3 p-3 rounded-lg bg-muted/50">
                <Mail className="w-4 h-4 text-muted-foreground shrink-0" />
                <div className="min-w-0">
                  <p className="text-xs text-muted-foreground">Correo electrónico</p>
                  <p className="font-medium text-foreground truncate">{user?.email ?? "—"}</p>
                </div>
              </div>
              <div className="flex items-center gap-3 p-3 rounded-lg bg-muted/50">
                <KeyRound className="w-4 h-4 text-muted-foreground shrink-0" />
                <div>
                  <p className="text-xs text-muted-foreground">Método de autenticación</p>
                  <p className="font-medium text-foreground">
                    {IS_LOCAL_AUTH ? "Contraseña local" : "Manus OAuth"}
                  </p>
                </div>
              </div>
              <div className="flex items-center gap-3 p-3 rounded-lg bg-muted/50">
                <Calendar className="w-4 h-4 text-muted-foreground shrink-0" />
                <div>
                  <p className="text-xs text-muted-foreground">Modo del sistema</p>
                  <p className="font-medium text-foreground">
                    {IS_LOCAL_AUTH ? "Docker standalone" : "Manus Cloud"}
                  </p>
                </div>
              </div>
              <div className="flex items-center gap-3 p-3 rounded-lg bg-muted/50">
                <Shield className="w-4 h-4 text-muted-foreground shrink-0" />
                <div>
                  <p className="text-xs text-muted-foreground">Nivel de acceso</p>
                  <p className="font-medium text-foreground">
                    {user?.role === "admin" ? "Acceso completo" : "Acceso estándar"}
                  </p>
                </div>
              </div>
            </div>
          </CardContent>
        </Card>

        {/* Change password card */}
        <Card>
          <CardHeader className="pb-4">
            <CardTitle className="text-base flex items-center gap-2">
              <Lock className="w-4 h-4 text-primary" />
              Cambiar Contraseña
            </CardTitle>
            <CardDescription>
              {IS_LOCAL_AUTH
                ? "Actualiza tu contraseña de acceso al sistema. Mínimo 8 caracteres."
                : "El cambio de contraseña no está disponible en modo Manus OAuth. Gestiona tu contraseña desde tu cuenta de Manus."}
            </CardDescription>
          </CardHeader>

          {IS_LOCAL_AUTH ? (
            <CardContent>
              {/* Success banner */}
              {success && (
                <div className="flex items-start gap-3 p-4 rounded-lg bg-emerald-500/10 border border-emerald-500/20 mb-6">
                  <CheckCircle2 className="w-4 h-4 text-emerald-500 shrink-0 mt-0.5" />
                  <p className="text-sm text-emerald-600 dark:text-emerald-400 font-medium">
                    Contraseña actualizada correctamente. Usa la nueva contraseña en tu próximo inicio de sesión.
                  </p>
                </div>
              )}

              {/* Error banner */}
              {error && (
                <div className="flex items-start gap-3 p-4 rounded-lg bg-destructive/10 border border-destructive/20 mb-6">
                  <AlertCircle className="w-4 h-4 text-destructive shrink-0 mt-0.5" />
                  <p className="text-sm text-destructive">{error}</p>
                </div>
              )}

              <form onSubmit={handleChangePassword} className="space-y-5">
                {/* Current password */}
                <div className="space-y-2">
                  <Label htmlFor="currentPassword" className="text-sm font-medium">
                    Contraseña actual
                  </Label>
                  <PasswordInput
                    id="currentPassword"
                    value={currentPassword}
                    onChange={setCurrentPassword}
                    placeholder="Tu contraseña actual"
                    autoComplete="current-password"
                  />
                </div>

                <Separator />

                {/* New password */}
                <div className="space-y-2">
                  <Label htmlFor="newPassword" className="text-sm font-medium">
                    Nueva contraseña
                  </Label>
                  <PasswordInput
                    id="newPassword"
                    value={newPassword}
                    onChange={v => {
                      setNewPassword(v);
                      setSuccess(false);
                      setError(null);
                    }}
                    placeholder="Mínimo 8 caracteres"
                    autoComplete="new-password"
                  />
                  {/* Strength bar */}
                  {newPassword.length > 0 && (
                    <div className="space-y-1.5">
                      <div className="flex gap-1 h-1.5">
                        {[1, 2, 3, 4, 5].map(i => (
                          <div
                            key={i}
                            className={`flex-1 rounded-full transition-colors ${
                              i <= strength.score ? strength.color : "bg-muted"
                            }`}
                          />
                        ))}
                      </div>
                      <p className="text-xs text-muted-foreground">
                        Seguridad: <span className="font-medium text-foreground">{strength.label}</span>
                      </p>
                    </div>
                  )}
                </div>

                {/* Confirm password */}
                <div className="space-y-2">
                  <Label htmlFor="confirmPassword" className="text-sm font-medium">
                    Confirmar nueva contraseña
                  </Label>
                  <PasswordInput
                    id="confirmPassword"
                    value={confirmPassword}
                    onChange={setConfirmPassword}
                    placeholder="Repite la nueva contraseña"
                    autoComplete="new-password"
                  />
                  {confirmPassword.length > 0 && (
                    <p
                      className={`text-xs flex items-center gap-1.5 ${
                        passwordsMatch ? "text-emerald-500" : "text-destructive"
                      }`}
                    >
                      {passwordsMatch ? (
                        <>
                          <CheckCircle2 className="w-3 h-3" />
                          Las contraseñas coinciden
                        </>
                      ) : (
                        <>
                          <AlertCircle className="w-3 h-3" />
                          Las contraseñas no coinciden
                        </>
                      )}
                    </p>
                  )}
                </div>

                {/* Requirements list */}
                <div className="p-3 rounded-lg bg-muted/50 space-y-1.5">
                  <p className="text-xs font-medium text-muted-foreground mb-2">Requisitos de contraseña:</p>
                  {[
                    { label: "Mínimo 8 caracteres", met: newPassword.length >= 8 },
                    { label: "Al menos una mayúscula (A-Z)", met: /[A-Z]/.test(newPassword) },
                    { label: "Al menos un número (0-9)", met: /[0-9]/.test(newPassword) },
                    { label: "Al menos un carácter especial (!@#$...)", met: /[^A-Za-z0-9]/.test(newPassword) },
                  ].map(({ label, met }) => (
                    <div key={label} className="flex items-center gap-2">
                      <div
                        className={`w-3.5 h-3.5 rounded-full flex items-center justify-center shrink-0 ${
                          met ? "bg-emerald-500/20" : "bg-muted"
                        }`}
                      >
                        {met && <CheckCircle2 className="w-2.5 h-2.5 text-emerald-500" />}
                      </div>
                      <span className={`text-xs ${met ? "text-foreground" : "text-muted-foreground"}`}>
                        {label}
                      </span>
                    </div>
                  ))}
                </div>

                <Button
                  type="submit"
                  className="w-full h-11 font-semibold gap-2"
                  disabled={!canSubmit}
                >
                  {loading ? (
                    <>
                      <div className="w-4 h-4 border-2 border-current border-t-transparent rounded-full animate-spin" />
                      Actualizando...
                    </>
                  ) : (
                    <>
                      <Lock className="w-4 h-4" />
                      Actualizar Contraseña
                    </>
                  )}
                </Button>
              </form>
            </CardContent>
          ) : (
            <CardContent>
              <div className="flex items-center gap-3 p-4 rounded-lg bg-muted/50 border border-border">
                <Shield className="w-5 h-5 text-muted-foreground shrink-0" />
                <p className="text-sm text-muted-foreground">
                  Tu contraseña es gestionada por Manus OAuth. Para cambiarla, visita{" "}
                  <a
                    href="https://manus.im"
                    target="_blank"
                    rel="noopener noreferrer"
                    className="text-primary underline underline-offset-2 hover:no-underline"
                  >
                    manus.im
                  </a>
                  .
                </p>
              </div>
            </CardContent>
          )}
        </Card>
      </div>
    </AccessControlLayout>
  );
}
