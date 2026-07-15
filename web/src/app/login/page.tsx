"use client";

import { useEffect, useState } from "react";
import { useRouter } from "next/navigation";
import { useMutation, useQueryClient } from "@tanstack/react-query";
import { toast } from "sonner";
import { ArrowRight, Loader2, Plus, Users, X } from "lucide-react";
import { api, ApiError } from "@/lib/api";
import { setUserId } from "@/lib/auth-store";
import {
  forgetUser,
  getKnownUsers,
  rememberUser,
  type KnownUser,
} from "@/lib/known-users";
import { initials } from "@/lib/format";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Avatar, AvatarFallback } from "@/components/ui/avatar";
import { Separator } from "@/components/ui/separator";

export default function LoginPage() {
  const router = useRouter();
  const qc = useQueryClient();
  const [known, setKnown] = useState<KnownUser[]>([]);
  const [name, setName] = useState("");
  const [email, setEmail] = useState("");
  const [pastedId, setPastedId] = useState("");

  useEffect(() => setKnown(getKnownUsers()), []);

  function enter(user: KnownUser) {
    setUserId(user.id);
    rememberUser(user);
    qc.clear();
    router.push("/circles");
  }

  const create = useMutation({
    mutationFn: async () => {
      const user = await api.createUser({
        name: name.trim(),
        email: email.trim(),
      });
      // Dev convenience: verify KYC immediately so the account can act.
      try {
        await api.verifyKyc(user.id);
      } catch {
        /* verify is best-effort in dev */
      }
      return user;
    },
    onSuccess: (user) => {
      toast.success(`Welcome, ${user.name}`);
      enter({ id: user.id, name: user.name, email: user.email });
    },
    onError: (e) =>
      toast.error(e instanceof ApiError ? e.message : "Could not create account"),
  });

  const usePasted = useMutation({
    mutationFn: async () => {
      setUserId(pastedId.trim());
      return api.me();
    },
    onSuccess: (user) => enter({ id: user.id, name: user.name, email: user.email }),
    onError: (e) => {
      setUserId(null);
      toast.error(e instanceof ApiError ? e.message : "That id didn't work");
    },
  });

  return (
    <div className="grid min-h-dvh lg:grid-cols-2">
      {/* Brand panel (desktop) */}
      <div className="bg-primary text-primary-foreground relative hidden flex-col justify-between overflow-hidden p-12 lg:flex">
        <div className="flex items-center gap-2 text-lg font-semibold">
          <div className="bg-primary-foreground/15 flex size-9 items-center justify-center rounded-xl ring-1 ring-white/20">
            <Users className="size-5" />
          </div>
          SanKofa
        </div>
        <div className="relative z-10 space-y-4">
          <h1 className="text-4xl font-semibold tracking-tight text-balance">
            Save together. Take turns. Reach your goal.
          </h1>
          <p className="text-primary-foreground/80 max-w-md text-lg">
            Digital rotating savings circles. The group agrees on the order,
            everyone contributes each round, and one member takes the pot — until
            everyone has had their turn.
          </p>
        </div>
        <p className="text-primary-foreground/60 text-sm">
          Dev sign-in — pick an account to explore the app.
        </p>
        <div className="bg-primary-foreground/10 absolute -right-24 -bottom-24 size-96 rounded-full blur-2xl" />
      </div>

      {/* Auth panel */}
      <div className="flex items-center justify-center p-6 sm:p-12">
        <div className="w-full max-w-sm space-y-8">
          <div className="space-y-1.5 lg:hidden">
            <div className="text-primary flex items-center gap-2 text-lg font-semibold">
              <Users className="size-5" /> SanKofa
            </div>
          </div>

          <div className="space-y-1.5">
            <h2 className="text-2xl font-semibold tracking-tight">
              Sign in
            </h2>
            <p className="text-muted-foreground text-sm">
              Create a dev account to get started, or switch to one you&apos;ve
              used before.
            </p>
          </div>

          {known.length > 0 && (
            <div className="space-y-2">
              <Label className="text-muted-foreground text-xs tracking-wide uppercase">
                Recent accounts
              </Label>
              <div className="space-y-1.5">
                {known.map((u) => (
                  <div
                    key={u.id}
                    className="group hover:border-primary/40 hover:bg-accent/40 flex items-center gap-3 rounded-lg border p-2.5 transition-colors"
                  >
                    <button
                      onClick={() => enter(u)}
                      className="flex flex-1 items-center gap-3 text-left"
                    >
                      <Avatar className="size-9">
                        <AvatarFallback className="bg-primary/10 text-primary text-xs font-medium">
                          {initials(u.name)}
                        </AvatarFallback>
                      </Avatar>
                      <div className="min-w-0 flex-1">
                        <div className="truncate text-sm font-medium">
                          {u.name}
                        </div>
                        {u.email && (
                          <div className="text-muted-foreground truncate text-xs">
                            {u.email}
                          </div>
                        )}
                      </div>
                      <ArrowRight className="text-muted-foreground size-4 opacity-0 transition-opacity group-hover:opacity-100" />
                    </button>
                    <button
                      onClick={() => {
                        forgetUser(u.id);
                        setKnown(getKnownUsers());
                      }}
                      className="text-muted-foreground hover:text-foreground p-1"
                      aria-label="Forget account"
                    >
                      <X className="size-3.5" />
                    </button>
                  </div>
                ))}
              </div>
              <Separator className="my-4" />
            </div>
          )}

          <form
            className="space-y-3"
            onSubmit={(e) => {
              e.preventDefault();
              create.mutate();
            }}
          >
            <div className="space-y-1.5">
              <Label htmlFor="name">Full name</Label>
              <Input
                id="name"
                placeholder="Ama Mensah"
                value={name}
                onChange={(e) => setName(e.target.value)}
                required
              />
            </div>
            <div className="space-y-1.5">
              <Label htmlFor="email">Email</Label>
              <Input
                id="email"
                type="email"
                placeholder="ama@example.com"
                value={email}
                onChange={(e) => setEmail(e.target.value)}
                required
              />
            </div>
            <Button
              type="submit"
              className="w-full"
              disabled={create.isPending}
            >
              {create.isPending ? (
                <Loader2 className="size-4 animate-spin" />
              ) : (
                <Plus className="size-4" />
              )}
              Create account &amp; sign in
            </Button>
          </form>

          <details className="text-sm">
            <summary className="text-muted-foreground hover:text-foreground cursor-pointer">
              Sign in with an existing user id
            </summary>
            <form
              className="mt-3 flex gap-2"
              onSubmit={(e) => {
                e.preventDefault();
                usePasted.mutate();
              }}
            >
              <Input
                placeholder="cuid…"
                value={pastedId}
                onChange={(e) => setPastedId(e.target.value)}
              />
              <Button
                type="submit"
                variant="outline"
                disabled={!pastedId.trim() || usePasted.isPending}
              >
                {usePasted.isPending ? (
                  <Loader2 className="size-4 animate-spin" />
                ) : (
                  "Use"
                )}
              </Button>
            </form>
          </details>
        </div>
      </div>
    </div>
  );
}
