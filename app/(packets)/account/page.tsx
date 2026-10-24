"use client";

import { useRouter, useSearchParams } from "next/navigation";
import { Suspense, useEffect, useState, type FormEvent } from "react";
import { Alert, AlertDescription } from "@/components/ui/alert";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Field, FieldDescription, FieldGroup, FieldLabel } from "@/components/ui/field";
import { Input } from "@/components/ui/input";
import { Separator } from "@/components/ui/separator";
import { api, ApiError } from "@/components/packets/api";

type Demo = { name: string; email: string; password: string };

export default function AccountPage() {
  return (
    <Suspense fallback={null}>
      <AccountForm />
    </Suspense>
  );
}

/** Sign in or create a customer account. Customer accounts never gain engineering authority. */
function AccountForm() {
  const router = useRouter();
  const params = useSearchParams();
  const next = params.get("next") || "/packets";
  const [mode, setMode] = useState<"login" | "register">("login");
  const [busy, setBusy] = useState<"demo" | "form" | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [demo, setDemo] = useState<Demo | null>(null);
  const [form, setForm] = useState({ name: "", email: "", password: "" });

  useEffect(() => {
    let active = true;
    api<{ demo: Demo | null }>("/api/packets/auth")
      .then((r) => active && setDemo(r.demo))
      .catch(() => active && setDemo(null));
    return () => {
      active = false;
    };
  }, []);

  function go() {
    router.push(next.startsWith("/") ? next : "/packets");
    router.refresh();
  }

  async function continueAsDemo() {
    setBusy("demo");
    setError(null);
    try {
      await api("/api/packets/auth", { json: { action: "demo" } });
      go();
    } catch (err) {
      setError(err instanceof ApiError ? err.message : "Demo sign-in failed.");
      setBusy(null);
    }
  }

  async function submit(e: FormEvent) {
    e.preventDefault();
    setBusy("form");
    setError(null);
    try {
      await api("/api/packets/auth", { json: { action: mode, ...form } });
      go();
    } catch (err) {
      setError(err instanceof ApiError ? err.message : "Sign-in failed.");
      setBusy(null);
    }
  }
  return (
    <div className="mx-auto w-full max-w-md">
      <Card className="liquid-glass">
        <CardHeader>
          <CardTitle>{mode === "login" ? "Sign in" : "Create a customer account"}</CardTitle>
          <CardDescription>{mode === "login" ? "Access your requests, orders and delivered packets." : "A customer account buys and reads review packets. It has no engineering reviewer authority."}</CardDescription>
        </CardHeader>
        <CardContent className="space-y-4">
          {demo ? (
            <div className="space-y-3">
              <Button type="button" className="w-full" disabled={busy !== null} onClick={continueAsDemo}>
                {busy === "demo" ? "Signing in…" : "Continue as demo customer"}
              </Button>
              <p className="text-xs text-muted-foreground">
                Shared demo account, created on first use. Email <span className="font-mono text-foreground">{demo.email}</span>, password <span className="font-mono text-foreground">{demo.password}</span>. It can buy and read its own packets and has no engineering authority.
              </p>
              <div className="flex items-center gap-3">
                <Separator className="flex-1" />
                <span className="text-xs text-muted-foreground">or use your own account</span>
                <Separator className="flex-1" />
              </div>
            </div>
          ) : null}
          <form onSubmit={submit} noValidate>
            <FieldGroup>
              {mode === "register" ? (
                <Field>
                  <FieldLabel htmlFor="name">Name</FieldLabel>
                  <Input id="name" autoComplete="name" required maxLength={100} value={form.name} onChange={(e) => setForm({ ...form, name: e.target.value })} />
                </Field>
              ) : null}
              <Field>
                <FieldLabel htmlFor="email">Email</FieldLabel>
                <Input id="email" type="email" autoComplete="email" required maxLength={200} value={form.email} onChange={(e) => setForm({ ...form, email: e.target.value })} />
              </Field>
              <Field>
                <FieldLabel htmlFor="password">Password</FieldLabel>
                <Input id="password" type="password" autoComplete={mode === "login" ? "current-password" : "new-password"} required minLength={12} maxLength={200} value={form.password} onChange={(e) => setForm({ ...form, password: e.target.value })} />
                {mode === "register" ? <FieldDescription>12 to 200 characters.</FieldDescription> : null}
              </Field>
              {error ? (
                <Alert variant="destructive" role="alert">
                  <AlertDescription>{error}</AlertDescription>
                </Alert>
              ) : null}
              <div className="flex flex-wrap items-center justify-between gap-2">
                <Button type="submit" disabled={busy !== null}>
                  {busy === "form" ? "Working…" : mode === "login" ? "Sign in" : "Create account"}
                </Button>
                <Button type="button" variant="link" onClick={() => setMode(mode === "login" ? "register" : "login")}>
                  {mode === "login" ? "New here? Create an account" : "Have an account? Sign in"}
                </Button>
              </div>
            </FieldGroup>
          </form>
        </CardContent>
      </Card>
    </div>
  );
}
