/**
 * localContext.ts — tRPC context for local auth mode (AUTH_MODE=local)
 * Reads the JWT cookie and resolves the user from the local DB.
 */
import type { CreateExpressContextOptions } from "@trpc/server/adapters/express";
import type { User } from "../../drizzle/schema";
import { COOKIE_NAME } from "@shared/const";
import { verifyLocalSession } from "./localAuth";
import * as db from "../db";

export type TrpcContext = {
  req: CreateExpressContextOptions["req"];
  res: CreateExpressContextOptions["res"];
  user: User | null;
};

function parseCookies(cookieHeader: string | undefined): Map<string, string> {
  const map = new Map<string, string>();
  if (!cookieHeader) return map;
  for (const part of cookieHeader.split(";")) {
    const [key, ...rest] = part.trim().split("=");
    if (key) map.set(key.trim(), decodeURIComponent(rest.join("=")));
  }
  return map;
}

export async function createLocalContext(
  opts: CreateExpressContextOptions
): Promise<TrpcContext> {
  let user: User | null = null;
  try {
    const cookies = parseCookies(opts.req.headers.cookie);
    const sessionCookie = cookies.get(COOKIE_NAME);
    const session = await verifyLocalSession(sessionCookie);
    if (session) {
      const found = await db.getUserByOpenId(session.openId);
      user = found ?? null;
    }
  } catch {
    user = null;
  }
  return { req: opts.req, res: opts.res, user };
}
