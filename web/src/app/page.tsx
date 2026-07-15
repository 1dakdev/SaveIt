"use client";

import { useEffect } from "react";
import { useRouter } from "next/navigation";
import { useUserId } from "@/hooks/use-current-user";

export default function Index() {
  const router = useRouter();
  const userId = useUserId();

  useEffect(() => {
    router.replace(userId ? "/circles" : "/login");
  }, [userId, router]);

  return null;
}
