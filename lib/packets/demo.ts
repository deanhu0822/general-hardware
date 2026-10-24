/** Shared demo customer. Public by design; disable with CAID_DEMO_ACCOUNT=false before a launch that should not offer a shared account. */
export type DemoAccount = { name: string; email: string; password: string };

export function demoAccount(env = process.env): DemoAccount | null {
  if (env.CAID_DEMO_ACCOUNT === "false") return null;
  const email = (env.CAID_DEMO_EMAIL || "demo@caid.test").trim().toLowerCase();
  const password = env.CAID_DEMO_PASSWORD || "demo-packet-2026";
  const name = (env.CAID_DEMO_NAME || "Demo customer").trim() || "Demo customer";
  if (!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email) || password.length < 12 || password.length > 200) return null;
  return { name: name.slice(0, 100), email, password };
}
