// Domain types mirroring the NestJS/Prisma backend (src/../prisma/schema.prisma).
// Kept in one place so the UI has a single source of truth for API shapes.

export type KycStatus = "unverified" | "pending" | "verified" | "rejected";
export type Frequency = "weekly" | "monthly";
export type TrustType = "invite_only" | "vetted";
export type CircleStatus = "forming" | "active" | "complete" | "wound_down";
export type MemberRole = "organizer" | "member";
export type MemberState = "invited" | "active" | "left" | "suspended";
export type CycleStatus = "proposed" | "active" | "complete";
export type PeriodState = "upcoming" | "collecting" | "closed" | "paid_out";
export type ContributionStatus = "pending" | "paid" | "missed";
export type PayoutStatus = "pending" | "released" | "confirmed";
export type VoteValue = "approve" | "decline";
export type SwapStatus = "requested" | "accepted" | "declined";
export type DisputeStatus =
  | "open"
  | "resolved_paid"
  | "resolved_unpaid"
  | "expired";
export type MessageKind = "member" | "system";

export interface User {
  id: string;
  authSubject: string | null;
  name: string;
  email: string;
  phone: string | null;
  kycStatus: KycStatus;
  reputation: number;
  createdAt: string;
  updatedAt: string;
}

export interface Membership {
  id: string;
  userId: string;
  circleId: string;
  role: MemberRole;
  order: number | null;
  state: MemberState;
  termsAcceptedAt: string | null;
  createdAt: string;
  updatedAt: string;
  user?: Pick<User, "id" | "name">;
}

export interface Circle {
  id: string;
  name: string;
  amount: number; // minor units (cents)
  frequency: Frequency;
  trustType: TrustType;
  status: CircleStatus;
  creatorId: string;
  createdAt: string;
  updatedAt: string;
  memberships?: Membership[];
  cycles?: Cycle[];
}

export interface Vote {
  id: string;
  membershipId: string;
  cycleId: string;
  userId: string;
  value: VoteValue;
  createdAt: string;
}

export interface Contribution {
  id: string;
  periodId: string;
  memberId: string;
  amount: number;
  status: ContributionStatus;
  paidAt: string | null;
}

export interface Payout {
  id: string;
  periodId: string;
  recipientId: string;
  amount: number;
  status: PayoutStatus;
  confirmedAt: string | null;
}

export interface Period {
  id: string;
  cycleId: string;
  index: number;
  recipientId: string; // Membership.id
  dueDate: string;
  state: PeriodState;
  contributions?: Contribution[];
  payout?: Payout | null;
}

export interface Cycle {
  id: string;
  circleId: string;
  index: number;
  status: CycleStatus;
  startDate: string | null;
  lockedAt: string | null;
  periods?: Period[];
  votes?: Vote[];
}

export interface Dispute {
  id: string;
  openedBy: string;
  periodId: string;
  txRef: string | null;
  status: DisputeStatus;
  openedAt: string;
  resolvesAt: string;
  resolvedAt: string | null;
}

export interface Message {
  id: string;
  circleId: string;
  authorId: string | null;
  body: string;
  kind: MessageKind;
  createdAt: string;
}
