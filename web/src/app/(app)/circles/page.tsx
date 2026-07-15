"use client";

import Link from "next/link";
import { useQuery } from "@tanstack/react-query";
import { ArrowRight, Plus, Users, Wallet } from "lucide-react";
import { api } from "@/lib/api";
import { qk } from "@/lib/query-keys";
import { useUserId } from "@/hooks/use-current-user";
import { formatMoney, titleCase } from "@/lib/format";
import type { Circle } from "@/lib/types";
import { PageHeader } from "@/components/page-header";
import { StatusPill } from "@/components/status-pill";
import { Button } from "@/components/ui/button";
import { Card, CardContent } from "@/components/ui/card";
import { Skeleton } from "@/components/ui/skeleton";

export default function CirclesPage() {
  const userId = useUserId();
  const { data: circles, isLoading } = useQuery({
    queryKey: qk.circles,
    queryFn: api.listCircles,
  });

  return (
    <>
      <PageHeader
        title="Your circles"
        description="Savings circles you organize or belong to."
        action={
          <Button render={<Link href="/circles/new" />}>
            <Plus className="size-4" /> New circle
          </Button>
        }
      />

      {isLoading ? (
        <div className="grid gap-4 sm:grid-cols-2">
          {[0, 1, 2, 3].map((i) => (
            <Skeleton key={i} className="h-40 rounded-xl" />
          ))}
        </div>
      ) : !circles?.length ? (
        <EmptyState />
      ) : (
        <div className="grid gap-4 sm:grid-cols-2">
          {circles.map((c) => (
            <CircleCard key={c.id} circle={c} userId={userId} />
          ))}
        </div>
      )}
    </>
  );
}

function CircleCard({
  circle,
  userId,
}: {
  circle: Circle;
  userId: string | null;
}) {
  const members = circle.memberships ?? [];
  const active = members.filter((m) => m.state === "active");
  const mine = members.find((m) => m.userId === userId);
  const pot = circle.amount * Math.max(active.length, 1);

  return (
    <Link href={`/circles/${circle.id}`} className="group">
      <Card className="hover:border-primary/40 h-full transition-colors">
        <CardContent className="flex h-full flex-col gap-4">
          <div className="flex items-start justify-between gap-2">
            <div className="min-w-0">
              <h3 className="truncate text-base font-semibold">{circle.name}</h3>
              <p className="text-muted-foreground text-sm">
                {formatMoney(circle.amount)} · {titleCase(circle.frequency)}
              </p>
            </div>
            <StatusPill status={circle.status} />
          </div>

          <div className="mt-auto flex items-center justify-between">
            <div className="flex items-center gap-4 text-sm">
              <span className="text-muted-foreground flex items-center gap-1.5">
                <Users className="size-4" /> {active.length}
              </span>
              <span className="text-muted-foreground flex items-center gap-1.5">
                <Wallet className="size-4" /> {formatMoney(pot)} pot
              </span>
            </div>
            <div className="flex items-center gap-2">
              {mine && <StatusPill status={mine.role} />}
              <ArrowRight className="text-muted-foreground size-4 transition-transform group-hover:translate-x-0.5" />
            </div>
          </div>
        </CardContent>
      </Card>
    </Link>
  );
}

function EmptyState() {
  return (
    <Card className="border-dashed">
      <CardContent className="flex flex-col items-center gap-4 py-16 text-center">
        <div className="bg-primary/10 text-primary flex size-12 items-center justify-center rounded-full">
          <Users className="size-6" />
        </div>
        <div className="space-y-1">
          <h3 className="font-semibold">No circles yet</h3>
          <p className="text-muted-foreground mx-auto max-w-sm text-sm">
            Start a savings circle, invite people you trust, and take turns
            receiving the pot each round.
          </p>
        </div>
        <Button render={<Link href="/circles/new" />}>
          <Plus className="size-4" /> Create your first circle
        </Button>
      </CardContent>
    </Card>
  );
}
