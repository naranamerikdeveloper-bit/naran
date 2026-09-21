import { defineWidgetConfig } from "@medusajs/admin-sdk";
import type { DetailWidgetProps, AdminProduct } from "@medusajs/framework/types";
import { Container, Text } from "@medusajs/ui";
import { ExclamationCircle } from "@medusajs/icons";
import { useTranslation } from "react-i18next";

// Product page banner: a product without a picture is hidden from shoppers
// (parked as draft by lib/image-visibility). Tell the admin why, and that
// adding an image in the Media section publishes it automatically.
const ProductImageWarning = ({ data }: DetailWidgetProps<AdminProduct>) => {
  const { i18n } = useTranslation();
  const mn = !i18n.language || i18n.language.startsWith("mn");
  const noImage = !data?.thumbnail && !(data?.images || []).some(i => i?.url);
  const hiddenByRule = (data?.metadata as any)?.hidden_reason === "no_image";
  if (!noImage && !hiddenByRule) return null;

  return (
    <Container className="border-ui-tag-orange-border bg-ui-tag-orange-bg flex items-start gap-3 px-6 py-4">
      <ExclamationCircle className="text-ui-tag-orange-icon mt-0.5 shrink-0" />
      <div>
        <Text weight="plus" className="text-ui-tag-orange-text">
          {mn ? "Зураггүй тул хэрэглэгчид харагдахгүй байна" : "Hidden from shoppers — no image"}
        </Text>
        <Text size="small" className="text-ui-tag-orange-text mt-1">
          {mn
            ? "Энэ бараа дэлгүүр, хайлтад гарахгүй (Draft). Доорх Media хэсэгт зураг нэмэхэд автоматаар нийтлэгдэж, хэрэглэгчдэд харагдана."
            : "This product is kept as Draft, so it is not in the store or search. Add an image in Media below and it is published automatically."}
        </Text>
      </div>
    </Container>
  );
};

export const config = defineWidgetConfig({
  zone: "product.details.before",
});

export default ProductImageWarning;
