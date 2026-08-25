export type SubscriptionPlan = "standard" | "premium" | "gold";
export type SubscriptionStatus =
  | "trial"
  | "active"
  | "past_due"
  | "canceled"
  | "cancelled"
  | "paused"
  | "pending"
  | "unpaid"
  | "expired"
  | null;

export type SubscriptionAccessInput = {
  plan: SubscriptionPlan;
  status: SubscriptionStatus;
  paymentConnected: boolean;
  currentPeriodEnd?: string | null;
};

export type SubscriptionAccess = {
  effectivePlan: SubscriptionPlan;
  paidAccess: boolean;
  premiumAccess: boolean;
  goldAccess: boolean;
  canManagePaidPlan: boolean;
  reason:
    | "standard"
    | "active"
    | "trial"
    | "payment_not_connected"
    | "past_due"
    | "canceled"
    | "paused"
    | "pending"
    | "expired"
    | "unknown";
};

export function evaluateSubscriptionAccess(input: SubscriptionAccessInput): SubscriptionAccess {
  const plan = input.plan || "standard";
  const status = input.status;
  const isPaidPlan = plan === "premium" || plan === "gold";

  if (!isPaidPlan) {
    return {
      effectivePlan: "standard",
      paidAccess: false,
      premiumAccess: false,
      goldAccess: false,
      canManagePaidPlan: false,
      reason: "standard",
    };
  }

  if (!input.paymentConnected) {
    return {
      effectivePlan: "standard",
      paidAccess: false,
      premiumAccess: false,
      goldAccess: false,
      canManagePaidPlan: false,
      reason: "payment_not_connected",
    };
  }

  if (status === "active" || status === "trial") {
    return {
      effectivePlan: plan,
      paidAccess: true,
      premiumAccess: true,
      goldAccess: plan === "gold",
      canManagePaidPlan: status === "active",
      reason: status,
    };
  }

  const reason =
    status === "past_due" || status === "unpaid"
      ? "past_due"
      : status === "canceled" || status === "cancelled"
        ? "canceled"
        : status === "paused"
          ? "paused"
          : status === "pending"
            ? "pending"
            : status === "expired"
              ? "expired"
              : "unknown";

  // V31 guvenlik politikasi:
  // Provider tarafinda ACTIVE/TRIAL disindaki ucretli durumlar premium yetki vermez.
  // Bu, basarisiz tahsilat veya iptal sonrasi istemci tarafinda eski plan bilgisinin
  // yanlislikla yetki acmasini engeller.
  return {
    effectivePlan: "standard",
    paidAccess: false,
    premiumAccess: false,
    goldAccess: false,
    canManagePaidPlan: false,
    reason,
  };
}