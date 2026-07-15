export const qk = {
  me: ["me"] as const,
  circles: ["circles"] as const,
  circle: (id: string) => ["circle", id] as const,
  cycle: (id: string) => ["cycle", id] as const,
  messages: (circleId: string) => ["messages", circleId] as const,
};
