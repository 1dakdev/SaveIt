"use client";

import { useState } from "react";
import { useMutation } from "@tanstack/react-query";
import { toast } from "sonner";
import {
  CheckCircle2,
  Circle as CircleIcon,
  Coins,
  HandCoins,
  Loader2,
  TriangleAlert,
} from "lucide-react";
import { api, ApiError } from "@/lib/api";
import type {
  Circle,
  Contribution,
  Cycle,
  Membership,
  Period,
} from "@/lib/types";
import { formatMoney, formatDate, relativeDays } from "@/lib/format";
import { cn } from "@/lib/utils";
import { useCircleRefresh } from "./use-refresh";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { StatusPill } from "@/components/status-pill";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
  DialogTrigger,
} from "@/components/ui/dialog";

export function CyclePanel({
  circle,
  cycle,
  userId,
}: {
  circle: Circle;
  cycle: Cycle | undefined;
  userId: string | null;
}) {
  const members = circle.memberships ?? [];
  const mine = members.find((m) => m.userId === userId);
  const isOrganizer = mine?.role === "organizer" && mine.state === "active";

  // Only meaningful once the rotation has locked (cycle active/complete).
  if (!cycle || cycle.status === "proposed") return null;

  const membershipById = new Map<string, Membership>(
    members.map((m) => [m.id, m]),
  );
  const nameByUserId = new Map<string, string>(
    members.filter((m) => m.user).map((m) => [m.userId, m.user!.name]),
  );
  const periods = [...(cycle.periods ?? [])].sort((a, b) => a.index - b.index);
  const done = periods.filter(
    (p) => p.state === "paid_out" || p.state === "closed",
  ).length;

  return (
    <Card>
      <CardHeader className="flex-row items-center justify-between space-y-0">
        <CardTitle className="flex items-center gap-2 text-base">
          <Coins className="size-4.5" /> Rounds
        </CardTitle>
        <span className="text-muted-foreground text-sm tabular-nums">
          {done}/{periods.length} paid out
        </span>
      </CardHeader>
      <CardContent className="space-y-3">
        {periods.map((p) => (
          <PeriodCard
            key={p.id}
            circleId={circle.id}
            period={p}
            recipientName={
              nameByUserId.get(membershipById.get(p.recipientId)?.userId ?? "") ??
              "Unknown"
            }
            nameByUserId={nameByUserId}
            userId={userId}
            isOrganizer={isOrganizer}
            isActiveMember={mine?.state === "active"}
          />
        ))}
      </CardContent>
    </Card>
  );
}

function PeriodCard({
  circleId,
  period,
  recipientName,
  nameByUserId,
  userId,
  isOrganizer,
  isActiveMember,
}: {
  circleId: string;
  period: Period;
  recipientName: string;
  nameByUserId: Map<string, string>;
  userId: string | null;
  isOrganizer: boolean;
  isActiveMember: boolean;
}) {
  const refresh = useCircleRefresh(circleId);
  const contributions = period.contributions ?? [];
  const paid = contributions.filter((c) => c.status === "paid");
  const collected = paid.reduce((s, c) => s + c.amount, 0);
  const pot = contributions.reduce((s, c) => s + c.amount, 0);
  const allPaid = contributions.length > 0 && paid.length === contributions.length;
  const isCollecting = period.state === "collecting";
  const myContribution = contributions.find((c) => c.memberId === userId);
  const payout = period.payout;
  const iAmRecipient = payout?.recipientId === userId;

  const markPaid = useMutation({
    mutationFn: () => api.markPaid(period.id),
    onSuccess: async () => {
      await refresh();
      toast.success("Payment recorded");
    },
    onError: (e) =>
      toast.error(e instanceof ApiError ? e.message : "Could not mark paid"),
  });

  const close = useMutation({
    mutationFn: (force: boolean) => api.closePeriod(period.id, force),
    onSuccess: async () => {
      await refresh();
      toast.success("Round closed — pot released to the recipient");
    },
    onError: (e) =>
      toast.error(e instanceof ApiError ? e.message : "Could not close round"),
  });

  const confirm = useMutation({
    mutationFn: () => api.confirmReceipt(period.id),
    onSuccess: async () => {
      await refresh();
      toast.success("Receipt confirmed");
    },
    onError: (e) =>
      toast.error(e instanceof ApiError ? e.message : "Could not confirm"),
  });

  return (
    <div
      className={cn(
        "rounded-xl border p-4 transition-colors",
        isCollecting ? "border-info/40 bg-info/5" : "bg-card",
      )}
    >
      <div className="flex flex-wrap items-center justify-between gap-2">
        <div className="flex items-center gap-3">
          <div className="bg-background flex size-9 items-center justify-center rounded-full border text-sm font-semibold tabular-nums">
            {period.index + 1}
          </div>
          <div>
            <div className="text-sm font-medium">
              {recipientName} receives {formatMoney(pot)}
            </div>
            <div className="text-muted-foreground text-xs">
              Due {formatDate(period.dueDate)} · {relativeDays(period.dueDate)}
            </div>
          </div>
        </div>
        <StatusPill status={period.state} />
      </div>

      {(isCollecting || contributions.length > 0) && (
        <>
          {/* Contribution tracker */}
          <div className="mt-4 space-y-1.5">
            <div className="flex items-center justify-between text-xs">
              <span className="text-muted-foreground">
                {paid.length}/{contributions.length} contributed
              </span>
              <span className="font-medium tabular-nums">
                {formatMoney(collected)} / {formatMoney(pot)}
              </span>
            </div>
            <div className="bg-muted h-1.5 overflow-hidden rounded-full">
              <div
                className="bg-success h-full rounded-full transition-all"
                style={{
                  width: `${pot ? (collected / pot) * 100 : 0}%`,
                }}
              />
            </div>
          </div>

          {isCollecting && (
            <ul className="mt-3 grid gap-1.5 sm:grid-cols-2">
              {contributions.map((c) => (
                <ContributionRow
                  key={c.id}
                  contribution={c}
                  name={nameByUserId.get(c.memberId) ?? "Member"}
                  isMe={c.memberId === userId}
                />
              ))}
            </ul>
          )}
        </>
      )}

      {/* Payout status */}
      {payout && (
        <div className="mt-3 flex items-center gap-2 text-sm">
          <HandCoins className="text-success size-4" />
          <span className="text-muted-foreground">
            Pot of {formatMoney(payout.amount)} to {recipientName}
          </span>
          <StatusPill status={payout.status} />
        </div>
      )}

      {/* Actions */}
      <div className="mt-4 flex flex-wrap gap-2">
        {isCollecting && myContribution?.status === "pending" && (
          <Button
            size="sm"
            onClick={() => markPaid.mutate()}
            disabled={markPaid.isPending}
          >
            {markPaid.isPending && <Loader2 className="size-4 animate-spin" />}
            Mark my {formatMoney(myContribution.amount)} paid
          </Button>
        )}

        {isCollecting && isOrganizer && (
          <>
            {allPaid ? (
              <Button
                size="sm"
                variant="outline"
                onClick={() => close.mutate(false)}
                disabled={close.isPending}
              >
                {close.isPending && <Loader2 className="size-4 animate-spin" />}
                Close &amp; pay out
              </Button>
            ) : (
              <Button
                size="sm"
                variant="outline"
                onClick={() => close.mutate(true)}
                disabled={close.isPending}
              >
                {close.isPending ? (
                  <Loader2 className="size-4 animate-spin" />
                ) : (
                  <TriangleAlert className="size-4" />
                )}
                Close early (mark unpaid as missed)
              </Button>
            )}
          </>
        )}

        {payout?.status === "released" && iAmRecipient && (
          <Button
            size="sm"
            onClick={() => confirm.mutate()}
            disabled={confirm.isPending}
          >
            {confirm.isPending && <Loader2 className="size-4 animate-spin" />}
            I received the pot
          </Button>
        )}

        {isActiveMember && period.state !== "upcoming" && (
          <DisputeDialog periodId={period.id} onDone={refresh} />
        )}
      </div>
    </div>
  );
}

function ContributionRow({
  contribution,
  name,
  isMe,
}: {
  contribution: Contribution;
  name: string;
  isMe: boolean;
}) {
  const paid = contribution.status === "paid";
  const missed = contribution.status === "missed";
  return (
    <li className="flex items-center gap-2 text-sm">
      {paid ? (
        <CheckCircle2 className="text-success size-4" />
      ) : missed ? (
        <TriangleAlert className="text-destructive size-4" />
      ) : (
        <CircleIcon className="text-muted-foreground size-4" />
      )}
      <span className={cn(paid && "text-muted-foreground")}>
        {name}
        {isMe && <span className="text-muted-foreground"> (you)</span>}
      </span>
    </li>
  );
}

function DisputeDialog({
  periodId,
  onDone,
}: {
  periodId: string;
  onDone: () => Promise<unknown>;
}) {
  const [open, setOpen] = useState(false);
  const [txRef, setTxRef] = useState("");

  const dispute = useMutation({
    mutationFn: () =>
      api.openDispute({ periodId, txRef: txRef.trim() || undefined }),
    onSuccess: async () => {
      await onDone();
      toast.success("Dispute opened — the organizer has 3 days to review");
      setTxRef("");
      setOpen(false);
    },
    onError: (e) =>
      toast.error(e instanceof ApiError ? e.message : "Could not open dispute"),
  });

  return (
    <Dialog open={open} onOpenChange={setOpen}>
      <DialogTrigger
        render={<Button size="sm" variant="ghost" className="text-muted-foreground" />}
      >
        <TriangleAlert className="size-4" /> Report an issue
      </DialogTrigger>
      <DialogContent>
        <DialogHeader>
          <DialogTitle>Report a payment issue</DialogTitle>
          <DialogDescription>
            Opening a dispute flags this round for the organizer to review within
            3 days. Add a reference to your off-platform payment if you have one.
          </DialogDescription>
        </DialogHeader>
        <form
          id="dispute-form"
          onSubmit={(e) => {
            e.preventDefault();
            dispute.mutate();
          }}
        >
          <div className="space-y-1.5">
            <Label htmlFor="txref">Payment reference (optional)</Label>
            <Input
              id="txref"
              placeholder="e.g. Zelle confirmation #"
              value={txRef}
              onChange={(e) => setTxRef(e.target.value)}
            />
          </div>
        </form>
        <DialogFooter>
          <Button
            type="submit"
            form="dispute-form"
            variant="destructive"
            disabled={dispute.isPending}
          >
            {dispute.isPending && <Loader2 className="size-4 animate-spin" />}
            Open dispute
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
