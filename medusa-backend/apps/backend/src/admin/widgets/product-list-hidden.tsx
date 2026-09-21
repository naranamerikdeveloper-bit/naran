import { defineWidgetConfig } from "@medusajs/admin-sdk";
import { Container, Text } from "@medusajs/ui";
import { ExclamationCircle } from "@medusajs/icons";
import { useTranslation } from "react-i18next";
import { useEffect, useState } from "react";

// Product list banner: how many products are hidden from the store because
// they have no picture, with a shortcut to the Draft filter.
const ProductListHidden = () => {
  const { i18n } = useTranslation();
  const mn = !i18n.language || i18n.language.startsWith("mn");
  const [info, setInfo] = useState<{ count: number; sample: { id: string; title: string }[] } | null>(null);

  useEffect(() => {
    fetch("/admin/catalog/hidden-no-image", { credentials: "include" })
      .then(r => (r.ok ? r.json() : null))
      .then(setInfo)
      .catch(() => setInfo(null));
  }, []);

  if (!info?.count) return null;
  return (
    <Container className="border-ui-tag-orange-border bg-ui-tag-orange-bg flex items-start gap-3 px-6 py-4">
      <ExclamationCircle className="text-ui-tag-orange-icon mt-0.5 shrink-0" />
      <div className="min-w-0">
        <Text weight="plus" className="text-ui-tag-orange-text">
          {mn
            ? `${info.count} бараа зураггүй тул хэрэглэгчид харагдахгүй байна`
            : `${info.count} products are hidden from shoppers (no image)`}
        </Text>
        <Text size="small" className="text-ui-tag-orange-text mt-1">
          {mn
            ? "Тэдгээр нь Draft төлөвтэй. Зураг нэмэхэд автоматаар нийтлэгдэнэ — нэг нэгээр эсвэл олноор нь."
            : "They are kept as Draft. Open a product and add an image in Media — it is published automatically."}{" "}
          <a href="/app/images" className="underline font-medium">
            {mn ? "Зураг оруулах →" : "Add images →"}
          </a>
        </Text>
        <Text size="xsmall" className="text-ui-tag-orange-text mt-2 truncate opacity-80">
          {info.sample.map(p => p.title).join(" · ")}
          {info.count > info.sample.length ? " …" : ""}
        </Text>
      </div>
    </Container>
  );
};

export const config = defineWidgetConfig({
  zone: "product.list.before",
});

export default ProductListHidden;
