"use client";

import { useState } from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { useMutation, useQueryClient } from "@tanstack/react-query";
import { toast } from "sonner";
import { ArrowLeft, BadgeCheck, Loader2 } from "lucide-react";
import { api, ApiError } from "@/lib/api";
import { qk } from "@/lib/query-keys";
import { useCurrentUser } from "@/hooks/use-current-user";
import { formatMoney } from "@/lib/format";
import { PageHeader } from "@/components/page-header";
import { Button } from "@/components/ui/button";
import { Card, CardContent } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";

export default function NewCirclePage() {
  const router = useRouter();
  const qc = useQueryClient();
  const { user } = useCurrentUser();
  const [name, setName] = useState("");
  const [amount, setAmount] = useState("50");
  const [frequency, setFrequency] = useState<"weekly" | "monthly">("monthly");

  const verified = user?.kycStatus === "verified";

  const verify = useMutation({
    mutationFn: () => api.verifyKyc(user!.id),
    onSuccess: async () => {
      await qc.invalidateQueries({ queryKey: qk.me });
      toast.success("Identity verified");
    },
    onError: () => toast.error("Could not verify KYC"),
  });

  const create = useMutation({
    mutationFn: () =>
      api.createCircle({
        name: name.trim(),
        amount: Math.round(parseFloat(amount) * 100),
        frequency,
      }),
    onSuccess: async (circle) => {
      await qc.invalidateQueries({ queryKey: qk.circles });
      toast.success("Circle created");
      router.push(`/circles/${circle.id}`);
    },
    onError: (e) =>
      toast.error(e instanceof ApiError ? e.message : "Could not create circle"),
  });

  const amountNum = parseFloat(amount);
  const valid = name.trim().length > 0 && amountNum > 0;

  return (
    <div className="mx-auto max-w-lg">
      <PageHeader
        title="Start a circle"
        description="Set the contribution and how often it repeats. You can invite members next."
        back={
          <Link
            href="/circles"
            className="text-muted-foreground hover:text-foreground inline-flex items-center gap-1 text-sm"
          >
            <ArrowLeft className="size-4" /> Circles
          </Link>
        }
      />

      {!verified && (
        <Card className="border-warning/40 bg-warning/5 mb-4">
          <CardContent className="flex flex-wrap items-center justify-between gap-3">
            <div className="text-sm">
              <p className="font-medium">Verify your identity to create a circle</p>
              <p className="text-muted-foreground">
                Circles hold real obligations, so organizers must complete KYC.
              </p>
            </div>
            <Button
              variant="outline"
              onClick={() => verify.mutate()}
              disabled={verify.isPending}
            >
              {verify.isPending ? (
                <Loader2 className="size-4 animate-spin" />
              ) : (
                <BadgeCheck className="size-4" />
              )}
              Verify (dev)
            </Button>
          </CardContent>
        </Card>
      )}

      <Card>
        <CardContent>
          <form
            className="space-y-5"
            onSubmit={(e) => {
              e.preventDefault();
              create.mutate();
            }}
          >
            <div className="space-y-1.5">
              <Label htmlFor="name">Circle name</Label>
              <Input
                id="name"
                placeholder="Sunday Savings"
                value={name}
                onChange={(e) => setName(e.target.value)}
                required
              />
            </div>

            <div className="grid grid-cols-2 gap-4">
              <div className="space-y-1.5">
                <Label htmlFor="amount">Contribution</Label>
                <div className="relative">
                  <span className="text-muted-foreground pointer-events-none absolute top-1/2 left-3 -translate-y-1/2 text-sm">
                    $
                  </span>
                  <Input
                    id="amount"
                    type="number"
                    min="1"
                    step="1"
                    className="pl-7"
                    value={amount}
                    onChange={(e) => setAmount(e.target.value)}
                    required
                  />
                </div>
              </div>
              <div className="space-y-1.5">
                <Label htmlFor="frequency">Frequency</Label>
                <Select
                  value={frequency}
                  onValueChange={(v) => setFrequency(v as "weekly" | "monthly")}
                >
                  <SelectTrigger id="frequency" className="w-full">
                    <SelectValue />
                  </SelectTrigger>
                  <SelectContent>
                    <SelectItem value="weekly">Weekly</SelectItem>
                    <SelectItem value="monthly">Monthly</SelectItem>
                  </SelectContent>
                </Select>
              </div>
            </div>

            <p className="text-muted-foreground bg-muted/50 rounded-lg px-3 py-2 text-sm">
              Each member contributes{" "}
              <span className="text-foreground font-medium">
                {amountNum > 0 ? formatMoney(Math.round(amountNum * 100)) : "—"}
              </span>{" "}
              per {frequency === "weekly" ? "week" : "month"}. With N members the
              pot is that × N each round.
            </p>

            <Button
              type="submit"
              className="w-full"
              disabled={!valid || !verified || create.isPending}
            >
              {create.isPending && <Loader2 className="size-4 animate-spin" />}
              Create circle
            </Button>
          </form>
        </CardContent>
      </Card>
    </div>
  );
}
