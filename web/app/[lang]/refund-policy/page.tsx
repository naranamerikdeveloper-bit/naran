import type { Metadata } from "next";
import { LegalPage } from "@/components/Legal";
import { POLICY_UPDATED, ReturnsPart, ContactPart } from "@/components/NaranPolicy";

export const metadata: Metadata = {
  title: "Буцаах, солих журам — Наран Америк Бараа",
  description: "\"Наран Америк Бараа\" дэлгүүрийн бараа буцаах, солих, мөнгө буцаан олгох журам.",
};

export default function RefundPolicyPage() {
  return (
    <LegalPage title="Буцаах, солих журам" updated={POLICY_UPDATED}>
      <ReturnsPart />
      <ContactPart />
    </LegalPage>
  );
}
