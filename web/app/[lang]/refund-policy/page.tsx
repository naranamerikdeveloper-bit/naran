import type { Metadata } from "next";
import { alternatesFor } from "@/lib/seo";
import { LegalPage } from "@/components/Legal";
import { POLICY_UPDATED, ReturnsPart, ContactPart } from "@/components/NaranPolicy";

export function generateMetadata({ params }: { params: { lang: string } }): Metadata {
  return {
    title: "Буцаах, солих журам — Наран Америк Бараа",
    description: "\"Наран Америк Бараа\" дэлгүүрийн бараа буцаах, солих, мөнгө буцаан олгох журам.",
    alternates: alternatesFor(params.lang, "refund-policy"),
  };
}

export default function RefundPolicyPage() {
  return (
    <LegalPage title="Буцаах, солих журам" updated={POLICY_UPDATED}>
      <ReturnsPart />
      <ContactPart />
    </LegalPage>
  );
}
