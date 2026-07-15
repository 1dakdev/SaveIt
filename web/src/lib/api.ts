// Typed client for the SanKofa API. All calls go to same-origin `/api/*`, which
// Next rewrites to the NestJS backend (see next.config.ts), so there's no CORS
// and auth headers pass straight through.

import { authHeaders } from "./auth-store";
import type {
  Circle,
  Contribution,
  Cycle,
  Dispute,
  Membership,
  Message,
  Payout,
  User,
  VoteValue,
} from "./types";

export class ApiError extends Error {
  constructor(
    public status: number,
    message: string,
    public body?: unknown,
  ) {
    super(message);
    this.name = "ApiError";
  }
}

async function request<T>(
  path: string,
  options: { method?: string; body?: unknown } = {},
): Promise<T> {
  const res = await fetch(`/api${path}`, {
    method: options.method ?? "GET",
    headers: {
      ...authHeaders(),
      ...(options.body ? { "Content-Type": "application/json" } : {}),
    },
    body: options.body ? JSON.stringify(options.body) : undefined,
    cache: "no-store",
  });

  const text = await res.text();
  const data = text ? safeJson(text) : null;

  if (!res.ok) {
    const message = extractMessage(data) ?? `Request failed (${res.status})`;
    throw new ApiError(res.status, message, data);
  }
  return data as T;
}

function safeJson(text: string): unknown {
  try {
    return JSON.parse(text);
  } catch {
    return text;
  }
}

function extractMessage(data: unknown): string | null {
  if (data && typeof data === "object" && "message" in data) {
    const m = (data as { message: unknown }).message;
    if (Array.isArray(m)) return m.join(", ");
    if (typeof m === "string") return m;
  }
  return null;
}

// ---- Endpoints -----------------------------------------------------------

export const api = {
  // Identity
  me: () => request<User>("/users/me"),
  createUser: (input: { name: string; email: string; phone?: string }) =>
    request<User>("/users", { method: "POST", body: input }),
  verifyKyc: (userId: string) =>
    request<User>(`/users/${userId}/verify-kyc`, { method: "POST" }),

  // Circles
  listCircles: () => request<Circle[]>("/circles"),
  getCircle: (id: string) => request<Circle>(`/circles/${id}`),
  createCircle: (input: {
    name: string;
    amount: number;
    frequency: "weekly" | "monthly";
  }) => request<Circle>("/circles", { method: "POST", body: input }),
  invite: (circleId: string, userId: string) =>
    request<Membership>(`/circles/${circleId}/invites`, {
      method: "POST",
      body: { userId },
    }),
  acceptInvite: (circleId: string) =>
    request<Membership>(`/circles/${circleId}/accept`, { method: "POST" }),

  // Rotation
  proposeOrder: (circleId: string, order?: string[]) =>
    request<Cycle>(`/circles/${circleId}/propose-order`, {
      method: "POST",
      body: order && order.length ? { order } : {},
    }),
  vote: (cycleId: string, value: VoteValue) =>
    request<{ voted: VoteValue; locked: boolean; cycle?: Cycle }>(
      `/cycles/${cycleId}/vote`,
      { method: "POST", body: { value } },
    ),
  requestSwap: (circleId: string, toMembershipId: string) =>
    request(`/circles/${circleId}/swaps`, {
      method: "POST",
      body: { toMembershipId },
    }),
  acceptSwap: (swapId: string) =>
    request(`/swaps/${swapId}/accept`, { method: "POST" }),
  declineSwap: (swapId: string) =>
    request(`/swaps/${swapId}/decline`, { method: "POST" }),

  // Cycles & periods
  getCycle: (cycleId: string) => request<Cycle>(`/cycles/${cycleId}`),
  markPaid: (periodId: string) =>
    request<Contribution>(`/periods/${periodId}/mark-paid`, { method: "POST" }),
  closePeriod: (periodId: string, force = false) =>
    request<Payout>(`/periods/${periodId}/close${force ? "?force=true" : ""}`, {
      method: "POST",
    }),
  confirmReceipt: (periodId: string) =>
    request<Payout>(`/periods/${periodId}/confirm-receipt`, { method: "POST" }),

  // Disputes
  openDispute: (input: { periodId: string; txRef?: string }) =>
    request<Dispute>("/disputes", { method: "POST", body: input }),
  resolveDispute: (disputeId: string, paid: boolean) =>
    request<Dispute>(
      `/disputes/${disputeId}/${paid ? "resolve-paid" : "resolve-unpaid"}`,
      { method: "POST" },
    ),

  // Chat
  listMessages: (circleId: string) =>
    request<Message[]>(`/circles/${circleId}/messages`),
  postMessage: (circleId: string, body: string) =>
    request<Message>(`/circles/${circleId}/messages`, {
      method: "POST",
      body: { body },
    }),
};
