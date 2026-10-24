import { NextResponse, type NextRequest } from "next/server";
import { WorkspaceError } from "@/lib/changes/store";
import type { User } from "@/lib/changes/model";
import { PacketError } from "./model";
import { packetStore, type PacketStore } from "./store";

/** Session cookie for the packet product. Separate from the engineering workspace cookie. */
export const SESSION_COOKIE = "caid_session";

export const json = (value: unknown, status = 200, headers: Record<string, string> = {}) =>
  NextResponse.json(value, { status, headers: { "Cache-Control": "no-store", ...headers } });

export function failure(error: unknown) {
  if (error instanceof PacketError) return json({ error: error.message, code: error.code }, error.status);
  if (error instanceof WorkspaceError) return json({ error: error.message, code: "workspace" }, error.status);
  console.error("[packets] request failed:", error);
  return json({ error: "The request could not be completed. No partial state was saved.", code: "internal" }, 500);
}

export function checkOrigin(request: NextRequest) {
  const expected = process.env.CAID_ORIGIN || process.env.FORMA_CHANGE_ORIGIN || request.nextUrl.origin;
  if (request.headers.get("origin") !== expected) throw new PacketError("Request origin does not match this application.", 403, "origin");
  return expected;
}

export async function readJson(request: NextRequest, limit = 512_000): Promise<Record<string, unknown>> {
  if (!request.headers.get("content-type")?.startsWith("application/json")) throw new PacketError("Send JSON.", 415, "content-type");
  const reader = request.body?.getReader();
  if (!reader) throw new PacketError("Missing request body.", 400);
  const chunks: Uint8Array[] = [];
  let size = 0;
  while (true) {
    const { done, value } = await reader.read();
    if (done) break;
    size += value.length;
    if (size > limit) {
      await reader.cancel();
      throw new PacketError(`Request exceeds the ${Math.round(limit / 1000)} KB limit.`, 413, "too-large");
    }
    chunks.push(value);
  }
  try {
    const value = JSON.parse(Buffer.concat(chunks).toString("utf8"));
    if (!value || typeof value !== "object" || Array.isArray(value)) throw new Error();
    return value as Record<string, unknown>;
  } catch {
    throw new PacketError("Invalid JSON request.", 400, "json");
  }
}

export function sessionToken(request: NextRequest) {
  return request.cookies.get(SESSION_COOKIE)?.value || "";
}

export function currentUser(request: NextRequest, store: PacketStore = packetStore()): User | undefined {
  return store.user(sessionToken(request));
}

export function requireUser(request: NextRequest, store: PacketStore = packetStore()): User {
  const user = currentUser(request, store);
  if (!user) throw new PacketError("Sign in to continue.", 401, "unauthenticated");
  return user;
}

export function requireOwner(request: NextRequest, store: PacketStore = packetStore()): User {
  const user = requireUser(request, store);
  if (user.role !== "owner") throw new PacketError("Owner access is required.", 403, "forbidden");
  return user;
}

export function text(name: string, value: unknown, max = 4000, required = true) {
  if (value === undefined || value === null) value = "";
  if (typeof value !== "string" || value.length > max) throw new PacketError(`Invalid ${name}.`, 400);
  if (required && !value.trim()) throw new PacketError(`${name} is required.`, 400);
  return value;
}

export function sessionCookie(token: string, request: NextRequest) {
  const origin = process.env.CAID_ORIGIN || process.env.FORMA_CHANGE_ORIGIN || request.nextUrl.origin;
  return { name: SESSION_COOKIE, value: token, httpOnly: true, sameSite: "strict" as const, secure: new URL(origin).protocol === "https:", path: "/", maxAge: 8 * 3600 };
}
