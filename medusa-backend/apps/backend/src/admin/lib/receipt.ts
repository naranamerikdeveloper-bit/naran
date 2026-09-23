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

export function printReceipt(r: Receipt) {
  const rows = r.items.map(it =>
    `<tr><td>${esc(it.title)}</td><td class="c">${it.quantity}</td><td class="r">${tug(it.unit_price)}</td><td class="r">${tug(it.amount)}</td></tr>`
  ).join("");
  const discRows = r.discount && r.discount > 0
    ? `<div class="row"><span>Дүн</span><span>${tug(r.subtotal ?? r.total + r.discount)}</span></div><div class="row"><span>Хямдрал</span><span>−${tug(r.discount)}</span></div>`
    : "";
  const cashRows = r.paymentMethod === "cash" && r.cash != null
    ? `<div class="row"><span>Авсан</span><span>${tug(r.cash)}</span></div><div class="row"><span>Хариулт</span><span>${tug(r.change ?? 0)}</span></div>`
    : "";
  const html = `<!doctype html><html><head><meta charset="utf-8"><title>${esc(r.no)}</title>
<style>
  *{font-family:ui-monospace,"Courier New",monospace;box-sizing:border-box}
  body{width:72mm;margin:0 auto;padding:8px 6px;color:#000;font-size:12px}
  h1{font-size:15px;text-align:center;margin:2px 0}
  .sub{text-align:center;font-size:10px;margin-bottom:6px}
  hr{border:none;border-top:1px dashed #000;margin:6px 0}
  table{width:100%;border-collapse:collapse}
  td{padding:2px 0;vertical-align:top}
  .c{text-align:center}.r{text-align:right}
  .row{display:flex;justify-content:space-between;margin:1px 0}
  .tot{font-size:14px;font-weight:bold}
  .foot{text-align:center;font-size:10px;margin-top:8px}
  @media print{@page{margin:0}}
</style></head><body>
  <h1>НАРАН АМЕРИК БАРАА</h1>
  <div class="sub">Утас: 9882-4848<br/>Баримт (албан бус)</div>
  <hr/>
  <div class="row"><span>Дугаар</span><span>${esc(r.no)}</span></div>
  <div class="row"><span>Огноо</span><span>${new Date(r.at).toLocaleString("mn-MN")}</span></div>
  ${r.customerName ? `<div class="row"><span>Харилцагч</span><span>${esc(r.customerName)}</span></div>` : ""}
  <hr/>
  <table><tr><td>Бараа</td><td class="c">Тоо</td><td class="r">Үнэ</td><td class="r">Дүн</td></tr>${rows}</table>
  <hr/>
  ${discRows}
  <div class="row tot"><span>НИЙТ</span><span>${tug(r.total)}</span></div>
  <div class="row"><span>Төлбөр</span><span>${PAY_LABEL[r.paymentMethod] || r.paymentMethod}</span></div>
  ${cashRows}
  <div class="foot">Худалдан авсанд баярлалаа!<br/>naranamerikbaraa.mn</div>
  <script>window.onload=function(){window.print();setTimeout(function(){window.close()},300)}</script>
</body></html>`;
  const w = window.open("", "_blank", "width=380,height=640");
  if (!w) { toast.error("Хэвлэх цонх нээгдсэнгүй (popup-ыг зөвшөөрнө үү)."); return; }
  w.document.write(html); w.document.close();
}
