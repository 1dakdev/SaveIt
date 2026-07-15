"use client";

import { useEffect, useRef, useState } from "react";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { toast } from "sonner";
import { MessageCircle, SendHorizonal } from "lucide-react";
import { api, ApiError } from "@/lib/api";
import { qk } from "@/lib/query-keys";
import type { Circle } from "@/lib/types";
import { formatDateTime, initials } from "@/lib/format";
import { cn } from "@/lib/utils";
import { Avatar, AvatarFallback } from "@/components/ui/avatar";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Input } from "@/components/ui/input";

export function ChatPanel({
  circle,
  userId,
}: {
  circle: Circle;
  userId: string | null;
}) {
  const qc = useQueryClient();
  const [draft, setDraft] = useState("");
  const scrollRef = useRef<HTMLDivElement>(null);

  const nameByUserId = new Map(
    (circle.memberships ?? [])
      .filter((m) => m.user)
      .map((m) => [m.userId, m.user!.name]),
  );
  const mine = (circle.memberships ?? []).find((m) => m.userId === userId);
  const canPost = mine?.state === "active";

  const { data: messages } = useQuery({
    queryKey: qk.messages(circle.id),
    queryFn: () => api.listMessages(circle.id),
    refetchInterval: 5000,
  });

  useEffect(() => {
    scrollRef.current?.scrollTo({ top: scrollRef.current.scrollHeight });
  }, [messages]);

  const send = useMutation({
    mutationFn: () => api.postMessage(circle.id, draft.trim()),
    onSuccess: async () => {
      setDraft("");
      await qc.invalidateQueries({ queryKey: qk.messages(circle.id) });
    },
    onError: (e) =>
      toast.error(e instanceof ApiError ? e.message : "Could not send"),
  });

  return (
    <Card className="flex max-h-[32rem] flex-col">
      <CardHeader>
        <CardTitle className="flex items-center gap-2 text-base">
          <MessageCircle className="size-4.5" /> Circle chat
        </CardTitle>
      </CardHeader>
      <CardContent className="flex min-h-0 flex-1 flex-col gap-3">
        <div ref={scrollRef} className="min-h-40 flex-1 space-y-3 overflow-y-auto">
          {!messages?.length ? (
            <p className="text-muted-foreground py-8 text-center text-sm">
              No messages yet. Say hello 👋
            </p>
          ) : (
            messages.map((m) => {
              if (m.kind === "system") {
                return (
                  <p
                    key={m.id}
                    className="text-muted-foreground bg-muted/50 mx-auto w-fit rounded-full px-3 py-1 text-center text-xs"
                  >
                    {m.body}
                  </p>
                );
              }
              const isMe = m.authorId === userId;
              const name = m.authorId
                ? (nameByUserId.get(m.authorId) ?? "Member")
                : "System";
              return (
                <div
                  key={m.id}
                  className={cn("flex gap-2", isMe && "flex-row-reverse")}
                >
                  <Avatar className="size-7 shrink-0">
                    <AvatarFallback className="bg-primary/10 text-primary text-[10px] font-medium">
                      {initials(name)}
                    </AvatarFallback>
                  </Avatar>
                  <div
                    className={cn(
                      "max-w-[80%] space-y-0.5",
                      isMe && "items-end text-right",
                    )}
                  >
                    <div
                      className={cn(
                        "inline-block rounded-2xl px-3 py-1.5 text-sm",
                        isMe
                          ? "bg-primary text-primary-foreground rounded-br-sm"
                          : "bg-muted rounded-bl-sm",
                      )}
                    >
                      {m.body}
                    </div>
                    <div className="text-muted-foreground text-[10px]">
                      {isMe ? "You" : name} · {formatDateTime(m.createdAt)}
                    </div>
                  </div>
                </div>
              );
            })
          )}
        </div>

        {canPost && (
          <form
            className="flex gap-2 border-t pt-3"
            onSubmit={(e) => {
              e.preventDefault();
              if (draft.trim()) send.mutate();
            }}
          >
            <Input
              placeholder="Message the circle…"
              value={draft}
              onChange={(e) => setDraft(e.target.value)}
            />
            <Button
              type="submit"
              size="icon"
              disabled={!draft.trim() || send.isPending}
              aria-label="Send"
            >
              <SendHorizonal className="size-4" />
            </Button>
          </form>
        )}
      </CardContent>
    </Card>
  );
}
