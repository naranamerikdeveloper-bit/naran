import type { Metadata } from "next";
import { LegalPage } from "@/components/Legal";
import { POLICY_UPDATED, PrivacyPart, ContactPart } from "@/components/NaranPolicy";

export const metadata: Metadata = {
  title: "Нууцлалын бодлого — Наран Америк Бараа",
  description: "\"Наран Америк Бараа\" хэрхэн таны хувийн мэдээллийг цуглуулж, ашиглаж, хамгаалдаг тухай.",
};

export default function PrivacyPage() {
  return (
    <LegalPage title="Нууцлалын бодлого" updated={POLICY_UPDATED}>
      <PrivacyPart />
      <ContactPart />
    </LegalPage>
  );
}
