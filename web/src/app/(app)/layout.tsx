"use client";

import { useEffect } from "react";
import { useRouter } from "next/navigation";
import { Loader2 } from "lucide-react";
import { useUserId } from "@/hooks/use-current-user";
import { AppShell } from "@/components/app-shell";

export default function AppLayout({ children }: { children: React.ReactNode }) {
  const router = useRouter();
  const userId = useUserId();

  useEffect(() => {
    if (userId === null) router.replace("/login");
  }, [userId, router]);

  if (!userId) {
    return (
      <div className="flex min-h-dvh items-center justify-center">
        <Loader2 className="text-muted-foreground size-6 animate-spin" />
      </div>
    );
  }

  return <AppShell>{children}</AppShell>;
}
