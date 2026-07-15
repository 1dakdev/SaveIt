"use client";

import { useState } from "react";
import { useMutation } from "@tanstack/react-query";
import { toast } from "sonner";
import { Check, Loader2, UserPlus } from "lucide-react";
import { api, ApiError } from "@/lib/api";
import { initials } from "@/lib/format";
import type { Circle } from "@/lib/types";
import { useCircleRefresh } from "./use-refresh";
import { Avatar, AvatarFallback } from "@/components/ui/avatar";
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

export function MembersPanel({
  circle,
  userId,
}: {
  circle: Circle;
  userId: string | null;
}) {
  const refresh = useCircleRefresh(circle.id);
  const members = [...(circle.memberships ?? [])].sort(
    (a, b) => (a.order ?? 99) - (b.order ?? 99),
  );
  const mine = members.find((m) => m.userId === userId);
  const isOrganizer = mine?.role === "organizer" && mine.state === "active";
  const canInvite = isOrganizer && circle.status === "forming";
  const amInvited = mine?.state === "invited";

  const accept = useMutation({
    mutationFn: () => api.acceptInvite(circle.id),
    onSuccess: async () => {
      await refresh();
      toast.success("You joined the circle");
    },
    onError: (e) =>
      toast.error(e instanceof ApiError ? e.message : "Could not accept"),
  });

  return (
    <Card>
      <CardHeader className="flex-row items-center justify-between space-y-0">
        <CardTitle className="text-base">Members ({members.length})</CardTitle>
        {canInvite && <InviteDialog circleId={circle.id} onDone={refresh} />}
      </CardHeader>
      <CardContent className="space-y-3">
        {amInvited && (
          <div className="border-info/40 bg-info/5 flex items-center justify-between gap-2 rounded-lg border p-3">
            <p className="text-sm font-medium">You&apos;re invited to join</p>
            <Button
              size="sm"
              onClick={() => accept.mutate()}
              disabled={accept.isPending}
            >
              {accept.isPending ? (
                <Loader2 className="size-4 animate-spin" />
              ) : (
                <Check className="size-4" />
              )}
              Accept
            </Button>
          </div>
        )}

        <ul className="space-y-2">
          {members.map((m) => (
            <li key={m.id} className="flex items-center gap-3">
              <div className="relative">
                <Avatar className="size-9">
                  <AvatarFallback className="bg-primary/10 text-primary text-xs font-medium">
                    {initials(m.user?.name ?? "?")}
                  </AvatarFallback>
                </Avatar>
                {m.order !== null && (
                  <span className="bg-primary text-primary-foreground absolute -right-1 -bottom-1 flex size-4.5 items-center justify-center rounded-full text-[10px] font-semibold ring-2 ring-[var(--card)]">
                    {m.order + 1}
                  </span>
                )}
              </div>
              <div className="min-w-0 flex-1">
                <div className="flex items-center gap-1.5 text-sm font-medium">
                  <span className="truncate">{m.user?.name ?? "Unknown"}</span>
                  {m.userId === userId && (
                    <span className="text-muted-foreground text-xs">(you)</span>
                  )}
                </div>
                <div className="mt-0.5 flex items-center gap-1.5">
                  <StatusPill status={m.role} />
                  {m.state !== "active" && <StatusPill status={m.state} />}
                </div>
              </div>
            </li>
          ))}
        </ul>
      </CardContent>
    </Card>
  );
}

function InviteDialog({
  circleId,
  onDone,
}: {
  circleId: string;
  onDone: () => Promise<unknown>;
}) {
  const [open, setOpen] = useState(false);
  const [uid, setUid] = useState("");

  const invite = useMutation({
    mutationFn: () => api.invite(circleId, uid.trim()),
    onSuccess: async () => {
      await onDone();
      toast.success("Invitation sent");
      setUid("");
      setOpen(false);
    },
    onError: (e) =>
      toast.error(e instanceof ApiError ? e.message : "Could not invite"),
  });

  return (
    <Dialog open={open} onOpenChange={setOpen}>
      <DialogTrigger render={<Button size="sm" variant="outline" />}>
        <UserPlus className="size-4" /> Invite
      </DialogTrigger>
      <DialogContent>
        <DialogHeader>
          <DialogTitle>Invite a member</DialogTitle>
          <DialogDescription>
            Enter the person&apos;s user id. They can copy it from their account
            menu (top right → “Copy my id”).
          </DialogDescription>
        </DialogHeader>
        <form
          id="invite-form"
          onSubmit={(e) => {
            e.preventDefault();
            invite.mutate();
          }}
        >
          <div className="space-y-1.5">
            <Label htmlFor="uid">User id</Label>
            <Input
              id="uid"
              placeholder="cuid…"
              value={uid}
              onChange={(e) => setUid(e.target.value)}
            />
          </div>
        </form>
        <DialogFooter>
          <Button
            type="submit"
            form="invite-form"
            disabled={!uid.trim() || invite.isPending}
          >
            {invite.isPending && <Loader2 className="size-4 animate-spin" />}
            Send invite
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
