import { randomBytes, timingSafeEqual } from "node:crypto";
import type { NextFunction, Request, Response } from "express";
import { loadConfig } from "./store.ts";

const sessions = new Map<string, { user: string; expires: number }>();
const DAY = 30 * 24 * 60 * 60 * 1000;

function safeEqual(a: string, b: string) {
  const left = Buffer.from(a);
  const right = Buffer.from(b);
  if (left.length !== right.length) return false;
  return timingSafeEqual(left, right);
}

export function parseCookie(header?: string) {
  const out: Record<string, string> = {};
  for (const part of (header || "").split(";")) {
    const eq = part.indexOf("=");
    if (eq === -1) continue;
    const key = part.slice(0, eq).trim();
    const value = part.slice(eq + 1).trim();
    if (key) out[key] = decodeURIComponent(value);
  }
  return out;
}

export function readToken(req: Request) {
  const header = req.headers.authorization;
  if (header?.startsWith("Bearer ")) return header.slice(7);
  const query = req.query.token;
  if (typeof query === "string" && query) return query;
  return parseCookie(req.headers.cookie).th_session || "";
}

export function validSession(token: string) {
  if (!token) return false;
  const session = sessions.get(token);
  if (!session) return false;
  if (session.expires < Date.now()) {
    sessions.delete(token);
    return false;
  }
  return true;
}

export function login(username: string, password: string) {
  const config = loadConfig();
  const userOk = safeEqual(username, config.username);
  const passOk = safeEqual(password, config.password);
  if (!userOk || !passOk) return null;
  const token = randomBytes(24).toString("hex");
  sessions.set(token, { user: config.username, expires: Date.now() + DAY });
  return token;
}

export function logout(token: string) {
  sessions.delete(token);
}

export function sessionCookie(token: string) {
  return `th_session=${encodeURIComponent(token)}; Path=/; HttpOnly; SameSite=Lax; Max-Age=${Math.floor(DAY / 1000)}`;
}

export function clearCookie() {
  return "th_session=; Path=/; HttpOnly; SameSite=Lax; Max-Age=0";
}

export function requireAuth(req: Request, res: Response, next: NextFunction) {
  if (validSession(readToken(req))) {
    next();
    return;
  }
  res.status(401).json({ error: "Sign in required." });
}
