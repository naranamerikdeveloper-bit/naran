import type { Metadata } from "next";
import { alternatesFor } from "@/lib/seo";
import { LegalPage } from "@/components/Legal";
import { POLICY_UPDATED, PrivacyPart, ContactPart } from "@/components/NaranPolicy";

export function generateMetadata({ params }: { params: { lang: string } }): Metadata {
  return {
    title: "Нууцлалын бодлого — Наран Америк Бараа",
    description: "\"Наран Америк Бараа\" хэрхэн таны хувийн мэдээллийг цуглуулж, ашиглаж, хамгаалдаг тухай.",
    alternates: alternatesFor(params.lang, "privacy"),
  };
}

export default function PrivacyPage() {
  return (
    <LegalPage title="Нууцлалын бодлого" updated={POLICY_UPDATED}>
      <PrivacyPart />
      <ContactPart />
    </LegalPage>
  );
}
