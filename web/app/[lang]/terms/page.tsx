import type { Metadata } from "next";
import { LegalPage } from "@/components/Legal";
import {
  POLICY_UPDATED, PolicyHighlights, PolicyNav,
  TermsPart, PrivacyPart, ReturnsPart, ContactPart,
} from "@/components/NaranPolicy";

export const metadata: Metadata = {
  title: "Үйлчилгээний нөхцөл болон журам — Наран Америк Бараа",
  description: "\"Наран Америк Бараа\" цахим худалдааны системийн үйлчилгээний нөхцөл, нууцлалын бодлого, буцаах солих журам.",
};

export default function TermsPage() {
  return (
    <LegalPage title="Үйлчилгээний нөхцөл болон журам" updated={POLICY_UPDATED}>
      <p>&quot;Наран Америк Бараа&quot; цахим худалдааны систем</p>
      <PolicyNav />
      <PolicyHighlights />
      <TermsPart />
      <PrivacyPart />
      <ReturnsPart />
      <ContactPart />
    </LegalPage>
  );
}
