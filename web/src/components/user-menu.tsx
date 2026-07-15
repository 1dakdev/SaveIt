"use client";

import { useRouter } from "next/navigation";
import { useQueryClient } from "@tanstack/react-query";
import { toast } from "sonner";
import { BadgeCheck, Copy, LogOut, ShieldQuestion } from "lucide-react";
import { api } from "@/lib/api";
import { useCurrentUser } from "@/hooks/use-current-user";
import { initials } from "@/lib/format";
import { Avatar, AvatarFallback } from "@/components/ui/avatar";
import { Button } from "@/components/ui/button";
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuLabel,
  DropdownMenuSeparator,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu";
import { StatusPill } from "@/components/status-pill";

export function UserMenu() {
  const router = useRouter();
  const qc = useQueryClient();
  const { user, signOut } = useCurrentUser();

  if (!user) return null;

  async function verify() {
    if (!user) return;
    try {
      await api.verifyKyc(user.id);
      await qc.invalidateQueries({ queryKey: ["me"] });
      toast.success("KYC verified (dev)");
    } catch {
      toast.error("Could not verify KYC");
    }
  }

  return (
    <DropdownMenu>
      <DropdownMenuTrigger
        render={<Button variant="ghost" className="h-9 gap-2 px-2" />}
      >
        <Avatar className="size-7">
          <AvatarFallback className="bg-primary/10 text-primary text-xs font-medium">
            {initials(user.name)}
          </AvatarFallback>
        </Avatar>
        <span className="hidden max-w-28 truncate text-sm font-medium sm:inline">
          {user.name}
        </span>
      </DropdownMenuTrigger>
      <DropdownMenuContent align="end" className="w-60">
        <DropdownMenuLabel className="flex flex-col gap-1">
          <span className="font-medium">{user.name}</span>
          <span className="text-muted-foreground text-xs font-normal">
            {user.email}
          </span>
          <div className="mt-1.5 flex items-center gap-2">
            <StatusPill status={user.kycStatus} />
            <span className="text-muted-foreground text-xs">
              rep {user.reputation}
            </span>
          </div>
        </DropdownMenuLabel>
        <DropdownMenuSeparator />
        <DropdownMenuItem
          onClick={() => {
            navigator.clipboard?.writeText(user.id);
            toast.success("User id copied");
          }}
        >
          <Copy className="size-4" /> Copy my id
        </DropdownMenuItem>
        {user.kycStatus !== "verified" ? (
          <DropdownMenuItem onClick={verify}>
            <BadgeCheck className="size-4" /> Verify KYC (dev)
          </DropdownMenuItem>
        ) : (
          <DropdownMenuItem disabled>
            <ShieldQuestion className="size-4" /> Identity verified
          </DropdownMenuItem>
        )}
        <DropdownMenuSeparator />
        <DropdownMenuItem
          variant="destructive"
          onClick={() => {
            signOut();
            qc.clear();
            router.push("/login");
          }}
        >
          <LogOut className="size-4" /> Switch account
        </DropdownMenuItem>
      </DropdownMenuContent>
    </DropdownMenu>
  );
}
