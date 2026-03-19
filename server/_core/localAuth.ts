/**
 * Local authentication system for standalone Docker deployment.
 * Activated when AUTH_MODE=local in environment variables.
 * Replaces Manus OAuth with email/password login + JWT cookies.
 */
import * as bcrypt from "bcryptjs";
import { SignJWT, jwtVerify } from "jose";
import type { Express, Request, Response } from "express";
import { COOKIE_NAME, ONE_YEAR_MS } from "@shared/const";
import { getSessionCookieOptions } from "./cookies";
import * as db from "../db";

const LOCAL_AUTH_OPEN_ID_PREFIX = "local:";

function getJwtSecret(): Uint8Array {
  const secret = process.env.JWT_SECRET ?? "local-dev-secret-change-me";
  return new TextEncoder().encode(secret);
}

export async function createLocalSessionToken(userId: number, email: string, name: string): Promise<string> {
  const openId = `${LOCAL_AUTH_OPEN_ID_PREFIX}${userId}`;
  const secretKey = getJwtSecret();
  return new SignJWT({ openId, appId: "local", name, email })
    .setProtectedHeader({ alg: "HS256", typ: "JWT" })
    .setExpirationTime(Math.floor((Date.now() + ONE_YEAR_MS) / 1000))
    .sign(secretKey);
}

export async function verifyLocalSession(cookieValue: string | undefined | null) {
  if (!cookieValue) return null;
  try {
    const secretKey = getJwtSecret();
    const { payload } = await jwtVerify(cookieValue, secretKey, { algorithms: ["HS256"] });
    const { openId, name } = payload as Record<string, unknown>;
    if (typeof openId !== "string" || !openId.startsWith(LOCAL_AUTH_OPEN_ID_PREFIX)) return null;
    return { openId: openId as string, name: (name as string) ?? "" };
  } catch {
    return null;
  }
}

export function registerLocalAuthRoutes(app: Express) {
  // POST /api/auth/login
  app.post("/api/auth/login", async (req: Request, res: Response) => {
    const { email, password } = req.body ?? {};
    if (!email || !password) {
      res.status(400).json({ error: "email and password are required" });
      return;
    }
    try {
      const user = await db.getUserByEmail(email as string);
      if (!user || !user.passwordHash) {
        res.status(401).json({ error: "Invalid email or password" });
        return;
      }
      const valid = await bcrypt.compare(password as string, user.passwordHash);
      if (!valid) {
        res.status(401).json({ error: "Invalid email or password" });
        return;
      }
      // Update lastSignedIn
      await db.upsertUser({ openId: user.openId, lastSignedIn: new Date() });

      const token = await createLocalSessionToken(user.id, user.email ?? email as string, user.name ?? email as string);
      const cookieOptions = getSessionCookieOptions(req);
      res.cookie(COOKIE_NAME, token, { ...cookieOptions, maxAge: ONE_YEAR_MS });
      res.json({ success: true, user: { id: user.id, email: user.email, name: user.name, role: user.role } });
    } catch (error) {
      console.error("[LocalAuth] Login failed", error);
      res.status(500).json({ error: "Login failed" });
    }
  });

  // POST /api/auth/logout
  app.post("/api/auth/logout", (req: Request, res: Response) => {
    const cookieOptions = getSessionCookieOptions(req);
    res.clearCookie(COOKIE_NAME, { ...cookieOptions, maxAge: -1 });
    res.json({ success: true });
  });

  // GET /api/auth/me
  app.get("/api/auth/me", async (req: Request, res: Response) => {
    const cookies = parseCookies(req.headers.cookie);
    const sessionCookie = cookies.get(COOKIE_NAME);
    const session = await verifyLocalSession(sessionCookie);
    if (!session) {
      res.status(401).json({ error: "Not authenticated" });
      return;
    }
    const user = await db.getUserByOpenId(session.openId);
    if (!user) {
      res.status(401).json({ error: "User not found" });
      return;
    }
    res.json({ id: user.id, email: user.email, name: user.name, role: user.role, openId: user.openId });
  });
}

function parseCookies(cookieHeader: string | undefined): Map<string, string> {
  const map = new Map<string, string>();
  if (!cookieHeader) return map;
  for (const part of cookieHeader.split(";")) {
    const [key, ...rest] = part.trim().split("=");
    if (key) map.set(key.trim(), decodeURIComponent(rest.join("=")));
  }
  return map;
}
