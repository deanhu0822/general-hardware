import type { NextRequest } from "next/server";
import { checkOrigin, currentUser, failure, json, readJson, SESSION_COOKIE, sessionCookie, sessionToken, text } from "@/lib/packets/http";
import { PacketError } from "@/lib/packets/model";
import { demoAccount } from "@/lib/packets/demo";
import { services } from "@/lib/packets/service";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

/** Who am I. Customers never see engineering authority here; the role is reported so the account menu can show owner-only Research. */
export async function GET(request: NextRequest) {
  try {
    const { store } = services();
    const user = currentUser(request, store);
    return json({
      user: user ? { id: user.id, name: user.name, email: user.email, role: user.role } : null,
      demo: demoAccount(),
    });
  } catch (error) {
    return failure(error);
  }
}

export async function POST(request: NextRequest) {
  try {
    checkOrigin(request);
    const data = await readJson(request, 16_000);
    const { store } = services();
    if (data.action === "register") {
      const user = store.registerCustomer(text("Name", data.name, 100), text("Email", data.email, 200), text("Password", data.password, 200));
      const token = store.login(user.email, text("Password", data.password, 200));
      const res = json({ ok: true, user }, 201);
      res.cookies.set(sessionCookie(token, request));
      return res;
    }
    if (data.action === "demo") {
      const demo = demoAccount();
      if (!demo) throw new PacketError("Demo sign-in is turned off on this server.", 404, "demo-disabled");
      const { user, token } = store.signInDemo(demo);
      const res = json({ ok: true, user: { id: user.id, name: user.name, email: user.email, role: user.role } });
      res.cookies.set(sessionCookie(token, request));
      return res;
    }
    if (data.action === "login") {
      const token = store.login(text("Email", data.email, 200), text("Password", data.password, 200));
      const user = store.user(token)!;
      const res = json({ ok: true, user: { id: user.id, name: user.name, email: user.email, role: user.role } });
      res.cookies.set(sessionCookie(token, request));
      return res;
    }
    if (data.action === "logout") {
      store.logout(sessionToken(request));
      const res = json({ ok: true });
      res.cookies.set({ name: SESSION_COOKIE, value: "", path: "/", maxAge: 0 });
      return res;
    }
    return json({ error: "Unknown action." }, 400);
  } catch (error) {
    return failure(error);
  }
}
