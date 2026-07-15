"use client";

import Link from "next/link";
import { useParams } from "next/navigation";
import { useQuery } from "@tanstack/react-query";
import { AlertCircle, ArrowLeft, Wallet } from "lucide-react";
import { api } from "@/lib/api";
import { qk } from "@/lib/query-keys";
import { useUserId } from "@/hooks/use-current-user";
import { formatMoney, titleCase } from "@/lib/format";
import { PageHeader } from "@/components/page-header";
import { StatusPill } from "@/components/status-pill";
import { Card, CardContent } from "@/components/ui/card";
import { Skeleton } from "@/components/ui/skeleton";
import { MembersPanel } from "@/components/circle/members-panel";
import { RotationPanel } from "@/components/circle/rotation-panel";
import { CyclePanel } from "@/components/circle/cycle-panel";
import { ChatPanel } from "@/components/circle/chat-panel";

export default function CircleDetailPage() {
  const { id } = useParams<{ id: string }>();
  const userId = useUserId();

  const circleQ = useQuery({
    queryKey: qk.circle(id),
    queryFn: () => api.getCircle(id),
  });

  const circle = circleQ.data;
  // The latest cycle drives the rotation/voting/period UI.
  const currentCycle = circle?.cycles?.length
    ? [...circle.cycles].sort((a, b) => b.index - a.index)[0]
    : undefined;

  const cycleQ = useQuery({
    queryKey: qk.cycle(currentCycle?.id ?? "none"),
    queryFn: () => api.getCycle(currentCycle!.id),
    enabled: !!currentCycle,
  });

  if (circleQ.isLoading) {
    return (
      <div className="space-y-6">
        <Skeleton className="h-9 w-64" />
        <div className="grid gap-6 lg:grid-cols-3">
          <Skeleton className="h-96 rounded-xl lg:col-span-2" />
          <Skeleton className="h-96 rounded-xl" />
        </div>
      </div>
    );
  }

  if (circleQ.isError || !circle) {
    return (
      <Card className="border-destructive/30">
        <CardContent className="flex flex-col items-center gap-3 py-14 text-center">
          <AlertCircle className="text-destructive size-8" />
          <div>
            <p className="font-semibold">Can&apos;t open this circle</p>
            <p className="text-muted-foreground text-sm">
              It may not exist, or you may not be a member.
            </p>
          </div>
          <Link href="/circles" className="text-primary text-sm font-medium">
            Back to circles
          </Link>
        </CardContent>
      </Card>
    );
  }

  const active = (circle.memberships ?? []).filter((m) => m.state === "active");
  const pot = circle.amount * Math.max(active.length, 1);

  return (
    <>
      <PageHeader
        title={
          <span className="flex flex-wrap items-center gap-3">
            {circle.name}
            <StatusPill status={circle.status} />
          </span>
        }
        description={
          <span className="flex flex-wrap items-center gap-x-4 gap-y-1">
            <span>
              {formatMoney(circle.amount)} · {titleCase(circle.frequency)}
            </span>
            <span className="flex items-center gap-1.5">
              <Wallet className="size-4" /> {formatMoney(pot)} pot · {active.length}{" "}
              active
            </span>
          </span>
        }
        back={
          <Link
            href="/circles"
            className="text-muted-foreground hover:text-foreground inline-flex items-center gap-1 text-sm"
          >
            <ArrowLeft className="size-4" /> Circles
          </Link>
        }
      />

      <div className="grid gap-6 lg:grid-cols-3">
        <div className="space-y-6 lg:col-span-2">
          <RotationPanel
            circle={circle}
            cycle={cycleQ.data}
            userId={userId}
          />
          <CyclePanel circle={circle} cycle={cycleQ.data} userId={userId} />
        </div>
        <div className="space-y-6">
          <MembersPanel circle={circle} userId={userId} />
          <ChatPanel circle={circle} userId={userId} />
        </div>
      </div>
    </>
  );
}
