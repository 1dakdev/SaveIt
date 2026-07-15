"use client";

import { useMutation } from "@tanstack/react-query";
import { toast } from "sonner";
import { Check, ListOrdered, Loader2, ThumbsDown, ThumbsUp } from "lucide-react";
import { api, ApiError } from "@/lib/api";
import type { Circle, Cycle } from "@/lib/types";
import { initials } from "@/lib/format";
import { useCircleRefresh } from "./use-refresh";
import { Avatar, AvatarFallback } from "@/components/ui/avatar";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { StatusPill } from "@/components/status-pill";

export function RotationPanel({
  circle,
  cycle,
  userId,
}: {
  circle: Circle;
  cycle: Cycle | undefined;
  userId: string | null;
}) {
  const refresh = useCircleRefresh(circle.id);
  const members = circle.memberships ?? [];
  const active = members.filter((m) => m.state === "active");
  const mine = members.find((m) => m.userId === userId);
  const isOrganizer = mine?.role === "organizer" && mine.state === "active";

  const propose = useMutation({
    mutationFn: () => api.proposeOrder(circle.id),
    onSuccess: async () => {
      await refresh();
      toast.success("Order proposed — members can now vote");
    },
    onError: (e) =>
      toast.error(e instanceof ApiError ? e.message : "Could not propose"),
  });

  const vote = useMutation({
    mutationFn: (value: "approve" | "decline") =>
      api.vote(cycle!.id, value),
    onSuccess: async (res) => {
      await refresh();
      if (res.locked) toast.success("Everyone approved — the circle is live! 🎉");
      else toast.success("Vote recorded");
    },
    onError: (e) =>
      toast.error(e instanceof ApiError ? e.message : "Could not vote"),
  });

  // Locked or running: rotation is settled, nothing to do here.
  if (cycle && cycle.status !== "proposed") return null;

  // Pre-proposal (circle forming, no cycle yet).
  if (!cycle || cycle.status !== "proposed") {
    const ordered = [...active].sort(
      (a, b) =>
        new Date(a.createdAt).getTime() - new Date(b.createdAt).getTime(),
    );
    return (
      <Card>
        <CardHeader>
          <CardTitle className="flex items-center gap-2 text-base">
            <ListOrdered className="size-4.5" /> Payout order
          </CardTitle>
        </CardHeader>
        <CardContent className="space-y-4">
          <p className="text-muted-foreground text-sm">
            {isOrganizer
              ? "Propose the order members receive the pot in. Everyone votes to lock it, then the circle goes live."
              : "The organizer will propose the payout order. You’ll vote to approve it."}
          </p>
          <ol className="space-y-2">
            {ordered.map((m, i) => (
              <li key={m.id} className="flex items-center gap-3 text-sm">
                <span className="text-muted-foreground w-5 text-right tabular-nums">
                  {i + 1}
                </span>
                <Avatar className="size-7">
                  <AvatarFallback className="bg-primary/10 text-primary text-[10px] font-medium">
                    {initials(m.user?.name ?? "?")}
                  </AvatarFallback>
                </Avatar>
                <span>{m.user?.name}</span>
              </li>
            ))}
          </ol>
          {isOrganizer && (
            <Button
              onClick={() => propose.mutate()}
              disabled={active.length < 2 || propose.isPending}
            >
              {propose.isPending && <Loader2 className="size-4 animate-spin" />}
              Propose this order
            </Button>
          )}
          {isOrganizer && active.length < 2 && (
            <p className="text-muted-foreground text-xs">
              Invite at least one more member to propose an order.
            </p>
          )}
        </CardContent>
      </Card>
    );
  }

  // Voting (cycle proposed).
  const votesByMembership = new Map(
    (cycle.votes ?? []).map((v) => [v.membershipId, v.value]),
  );
  const approvals = active.filter(
    (m) => votesByMembership.get(m.id) === "approve",
  ).length;
  const myVote = mine ? votesByMembership.get(mine.id) : undefined;
  const canVote = mine?.state === "active";

  return (
    <Card>
      <CardHeader className="flex-row items-center justify-between space-y-0">
        <CardTitle className="flex items-center gap-2 text-base">
          <ListOrdered className="size-4.5" /> Approve the order
        </CardTitle>
        <span className="text-muted-foreground text-sm tabular-nums">
          {approvals}/{active.length} approved
        </span>
      </CardHeader>
      <CardContent className="space-y-4">
        <p className="text-muted-foreground text-sm">
          Once every active member approves, the rotation locks and the first
          round opens for contributions.
        </p>

        <ol className="space-y-2">
          {[...active]
            .sort((a, b) => (a.order ?? 0) - (b.order ?? 0))
            .map((m) => {
              const v = votesByMembership.get(m.id);
              return (
                <li key={m.id} className="flex items-center gap-3 text-sm">
                  <span className="text-muted-foreground w-5 text-right tabular-nums">
                    {(m.order ?? 0) + 1}
                  </span>
                  <Avatar className="size-7">
                    <AvatarFallback className="bg-primary/10 text-primary text-[10px] font-medium">
                      {initials(m.user?.name ?? "?")}
                    </AvatarFallback>
                  </Avatar>
                  <span className="flex-1">{m.user?.name}</span>
                  {v ? (
                    <StatusPill status={v} />
                  ) : (
                    <span className="text-muted-foreground text-xs">
                      waiting…
                    </span>
                  )}
                </li>
              );
            })}
        </ol>

        {canVote && (
          <div className="flex gap-2 border-t pt-4">
            <Button
              className="flex-1"
              variant={myVote === "approve" ? "default" : "outline"}
              onClick={() => vote.mutate("approve")}
              disabled={vote.isPending}
            >
              {myVote === "approve" ? (
                <Check className="size-4" />
              ) : (
                <ThumbsUp className="size-4" />
              )}
              Approve
            </Button>
            <Button
              className="flex-1"
              variant={myVote === "decline" ? "destructive" : "outline"}
              onClick={() => vote.mutate("decline")}
              disabled={vote.isPending}
            >
              <ThumbsDown className="size-4" /> Decline
            </Button>
          </div>
        )}
      </CardContent>
    </Card>
  );
}
