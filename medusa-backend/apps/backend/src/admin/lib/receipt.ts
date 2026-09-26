import { toast } from "@medusajs/ui";

// Shared MNT formatter + plain sale receipt printer for the POS and the day
// report. NOT an official e-barimt — a simple store receipt.

export const tug = (n: number) => `₮${new Intl.NumberFormat("en-US").format(Math.round(n || 0))}`;
export const PAY_LABEL: Record<string, string> = { cash: "Бэлэн мөнгө", card: "Карт", qpay: "QPay", transfer: "Банк шилжүүлэг" };

export type Receipt = {
  items: { title: string; quantity: number; unit_price: number; amount: number }[];
  subtotal?: number; discount?: number;
  total: number; paymentMethod: string; customerName: string | null; at: string;
  no: string; paid?: boolean; cash?: number; change?: number;
};

const esc = (s: string) => String(s).replace(/[&<>"]/g, c => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;" }[c] as string));

/**
 * Print a sale receipt on a 72mm thermal roll.
 *
 * Long perfume names wrap badly in a four-column table, so each line gets its
 * own block: the product on one row, then "qty × unit price" with the line total
 * right-aligned underneath. Numbers are tabular so the column stays straight.
 * `logoUrl` is optional — the receipt falls back to the shop name in type.
 */
export function printReceipt(r: Receipt, logoUrl?: string) {
  const rows = r.items.map(it => `
    <div class="item">
      <div class="name">${esc(it.title)}</div>
      <div class="line"><span class="qty">${it.quantity} × ${tug(it.unit_price)}</span><span class="amt">${tug(it.amount)}</span></div>
    </div>`).join("");

  const discRows = r.discount && r.discount > 0
    ? `<div class="row"><span>Дүн</span><span>${tug(r.subtotal ?? r.total + r.discount)}</span></div>
       <div class="row"><span>Хямдрал</span><span>−${tug(r.discount)}</span></div>`
    : "";

  const cashRows = r.paymentMethod === "cash" && r.cash != null
    ? `<div class="row"><span>Авсан</span><span>${tug(r.cash)}</span></div>
       <div class="row"><span>Хариулт</span><span>${tug(r.change ?? 0)}</span></div>`
    : "";

  const head = logoUrl
    ? `<img class="logo" src="${esc(logoUrl)}" alt="Naran Amerik Baraa"/>`
    : `<div class="brand">НАРАН АМЕРИК БАРАА</div>`;

  const html = `<!doctype html><html><head><meta charset="utf-8"><title>${esc(r.no)}</title>
<style>
  *{box-sizing:border-box}
  body{width:72mm;margin:0 auto;padding:10px 8px;color:#000;
       font-family:-apple-system,"Segoe UI",Arial,sans-serif;font-size:12px;line-height:1.45}
  .head{text-align:center;margin-bottom:8px}
  .logo{max-width:46mm;height:auto;margin:0 auto 4px;display:block}
  .brand{font-size:15px;font-weight:700;letter-spacing:.5px}
  .contact{font-size:10px;color:#333;margin-top:2px}
  .rule{border-top:1px dashed #000;margin:8px 0}
  .rule.solid{border-top:2px solid #000}
  .row{display:flex;justify-content:space-between;gap:8px;margin:2px 0}
  .row span:last-child{font-variant-numeric:tabular-nums;white-space:nowrap}
  .muted{color:#333}
  .item{margin:6px 0}
  .item .name{font-weight:600;word-break:break-word}
  .item .line{display:flex;justify-content:space-between;gap:8px;color:#333;margin-top:1px}
  .item .qty,.item .amt{font-variant-numeric:tabular-nums;white-space:nowrap}
  .item .amt{font-weight:600;color:#000}
  .total{display:flex;justify-content:space-between;align-items:baseline;gap:8px;margin:6px 0}
  .total .lbl{font-size:13px;font-weight:700;letter-spacing:.5px}
  .total .val{font-size:18px;font-weight:700;font-variant-numeric:tabular-nums}
  .foot{text-align:center;font-size:10px;color:#333;margin-top:10px;line-height:1.6}
  @media print{@page{margin:0}}
</style></head><body>
  <div class="head">
    ${head}
    <div class="contact">Утас: 9882-4848 · naranamerikbaraa.mn</div>
  </div>

  <div class="rule"></div>
  <div class="row muted"><span>Баримт №</span><span>${esc(r.no)}</span></div>
  <div class="row muted"><span>Огноо</span><span>${new Date(r.at).toLocaleString("mn-MN")}</span></div>
  ${r.customerName ? `<div class="row muted"><span>Харилцагч</span><span>${esc(r.customerName)}</span></div>` : ""}

  <div class="rule"></div>
  ${rows}

  <div class="rule"></div>
  ${discRows}
  <div class="rule solid"></div>
  <div class="total"><span class="lbl">НИЙТ</span><span class="val">${tug(r.total)}</span></div>
  <div class="rule solid"></div>

  <div class="row"><span>Төлбөр</span><span>${PAY_LABEL[r.paymentMethod] || r.paymentMethod}</span></div>
  ${cashRows}

  <div class="foot">Худалдан авсанд баярлалаа!<br/>Дахин уулзацгаая ♡</div>
  <script>window.onload=function(){window.print();setTimeout(function(){window.close()},400)}</script>
</body></html>`;

  const w = window.open("", "_blank", "width=380,height=680");
  if (!w) { toast.error("Хэвлэх цонх нээгдсэнгүй (popup-ыг зөвшөөрнө үү)."); return; }
  w.document.write(html); w.document.close();
}
