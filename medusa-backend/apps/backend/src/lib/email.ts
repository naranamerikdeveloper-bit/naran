// Transactional email from the Medusa backend via Resend's REST API (no extra
// dep). No RESEND_API_KEY → mock (logs), so fulfillment never breaks in dev.
const KEY = process.env.RESEND_API_KEY;
const FROM = process.env.EMAIL_FROM || "NARAN <onboarding@resend.dev>";

export type ShippedEmail = {
  id: string;
  email: string;
  items: { title: string; quantity: number }[];
};

export function renderShippedEmail(o: ShippedEmail): string {
  const rows = o.items.map(i =>
    `<tr><td style="padding:7px 0;color:#1B1533;font-size:14px">${i.title} <span style="color:#8B85A0">× ${i.quantity}</span></td></tr>`
  ).join("");
  return `
  <div style="font-family:Arial,Helvetica,sans-serif;background:#F4F2FB;padding:32px">
    <div style="max-width:520px;margin:0 auto;background:#fff;border-radius:18px;overflow:hidden;border:1px solid #ECE9F7">
      <div style="background:linear-gradient(120deg,#6E54EC,#A95EEA);padding:26px 28px">
        <span style="color:#fff;font-size:22px;font-weight:800;letter-spacing:2px">NARAN</span>
      </div>
      <div style="padding:28px">
        <h1 style="margin:0 0 6px;font-size:22px;color:#1B1533">Захиалга хүргэлтэд гарлаа 🚚</h1>
        <p style="margin:0 0 20px;color:#5C5670;font-size:14px;line-height:1.7">
          Таны <b>${o.id}</b> захиалга замдаа гарлаа. Удахгүй хүлээж авах болно.
        </p>
        <table style="width:100%;border-collapse:collapse;background:#F7F5FD;border-radius:12px;padding:4px 14px">${rows}</table>
        <p style="margin:24px 0 0;color:#8B85A0;font-size:12px">NARAN · Гоо сайхан, нэг дороос · Улаанбаатар, Монгол</p>
      </div>
    </div>
  </div>`;
}

export async function sendShippedEmail(o: ShippedEmail): Promise<void> {
  const html = renderShippedEmail(o);
  if (!KEY) {
    console.log(`[email mock] shipped ${o.id} → ${o.email} (RESEND_API_KEY тохируулбал бодитоор илгээнэ)`);
    return;
  }
  try {
    const res = await fetch("https://api.resend.com/emails", {
      signal: AbortSignal.timeout(10_000), // never hang a subscriber on Resend
      method: "POST",
      headers: { authorization: `Bearer ${KEY}`, "content-type": "application/json" },
      body: JSON.stringify({ from: FROM, to: o.email, subject: `NARAN захиалга ${o.id} хүргэлтэд гарлаа`, html }),
    });
    if (!res.ok) throw new Error(`Resend ${res.status}: ${await res.text()}`);
    console.log(`[email] shipped ${o.id} → ${o.email}`);
  } catch (e: any) {
    console.error("shipped email failed:", e.message);
  }
}

export type PasswordResetEmail = { email: string; url: string };

export function renderPasswordResetEmail(o: PasswordResetEmail): string {
  return `
  <div style="font-family:Arial,Helvetica,sans-serif;background:#FDF3EC;padding:32px">
    <div style="max-width:520px;margin:0 auto;background:#fff;border-radius:18px;overflow:hidden;border:1px solid #F3E2D5">
      <div style="background:linear-gradient(120deg,#FF7A2E,#E8550A);padding:26px 28px">
        <span style="color:#fff;font-size:22px;font-weight:800;letter-spacing:2px">NARAN</span>
      </div>
      <div style="padding:28px">
        <h1 style="margin:0 0 6px;font-size:22px;color:#0E0F10">Нууц үг сэргээх</h1>
        <p style="margin:0 0 20px;color:#5C5F63;font-size:14px;line-height:1.7">
          Та нууц үгээ сэргээх хүсэлт илгээсэн байна. Доорх товчийг дарж шинэ нууц
          үгээ тохируулна уу. Энэ холбоос <b>15 минутын</b> дараа хүчингүй болно.
        </p>
        <a href="${o.url}" style="display:inline-block;background:linear-gradient(95deg,#FF7A2E,#E8550A);color:#fff;text-decoration:none;font-weight:700;font-size:14px;padding:13px 30px;border-radius:999px">
          Нууц үг сэргээх
        </a>
        <p style="margin:22px 0 0;color:#8A8F93;font-size:12px;line-height:1.6">
          Товч ажиллахгүй бол энэ холбоосыг хөтөч рүүгээ хуулна уу:<br/>
          <span style="color:#5C5F63;word-break:break-all">${o.url}</span>
        </p>
        <p style="margin:20px 0 0;color:#8A8F93;font-size:12px">
          Хэрэв та энэ хүсэлтийг илгээгээгүй бол энэ имэйлийг үл тоомсорлоно уу.
        </p>
        <p style="margin:22px 0 0;color:#8A8F93;font-size:12px">NARAN · Гоо сайхан, нэг дороос · Улаанбаатар, Монгол</p>
      </div>
    </div>
  </div>`;
}

// --- Staff invite -----------------------------------------------------------
export type InviteEmail = { email: string; url: string; code: string; roleLabel?: string };

export function renderInviteEmail(o: InviteEmail): string {
  return `
  <div style="font-family:Arial,Helvetica,sans-serif;background:#FDF3EC;padding:32px">
    <div style="max-width:520px;margin:0 auto;background:#fff;border-radius:18px;overflow:hidden;border:1px solid #F3E2D5">
      <div style="background:linear-gradient(120deg,#FF7A2E,#E8550A);padding:26px 28px">
        <span style="color:#fff;font-size:22px;font-weight:800;letter-spacing:2px">NARAN</span>
      </div>
      <div style="padding:28px">
        <h1 style="margin:0 0 6px;font-size:22px;color:#0E0F10">Танд урилга ирлээ</h1>
        <p style="margin:0 0 20px;color:#5C5F63;font-size:14px;line-height:1.7">
          Та <b>NARAN</b>-ы удирдлагын системд${o.roleLabel ? ` <b>${o.roleLabel}</b> эрхээр` : ""}
          нэмэгдлээ. Доорх товчийг дарж <b>өөрийн нууц үгээ</b> тохируулснаар бүртгэл идэвхжинэ.
        </p>
        <a href="${o.url}" style="display:inline-block;background:linear-gradient(95deg,#FF7A2E,#E8550A);color:#fff;text-decoration:none;font-weight:700;font-size:14px;padding:13px 30px;border-radius:999px">
          Бүртгэлээ идэвхжүүлэх
        </a>
        <p style="margin:24px 0 6px;color:#5C5F63;font-size:13px">Товч ажиллахгүй бол урилгын кодыг ашиглана уу:</p>
        <div style="background:#FDF3EC;border:1px dashed #E8550A;border-radius:10px;padding:12px 14px;font-family:monospace;font-size:12px;color:#0E0F10;word-break:break-all">${o.code}</div>
        <p style="margin:18px 0 0;color:#8A8F93;font-size:12px;line-height:1.6">
          Эсвэл энэ холбоосыг хөтөч рүүгээ хуулна уу:<br/>
          <span style="color:#5C5F63;word-break:break-all">${o.url}</span>
        </p>
        <p style="margin:20px 0 0;color:#8A8F93;font-size:12px">
          Хэрэв та энэ урилгыг хүлээгээгүй бол энэ имэйлийг үл тоомсорлоно уу.
        </p>
        <p style="margin:22px 0 0;color:#8A8F93;font-size:12px">NARAN · Гоо сайхан, нэг дороос · Улаанбаатар, Монгол</p>
      </div>
    </div>
  </div>`;
}

export async function sendInviteEmail(o: InviteEmail): Promise<void> {
  const html = renderInviteEmail(o);
  if (!KEY) {
    console.log(`[email mock] staff invite → ${o.email}\n  invite link: ${o.url}`);
    return;
  }
  try {
    const res = await fetch("https://api.resend.com/emails", {
      signal: AbortSignal.timeout(10_000),
      method: "POST",
      headers: { authorization: `Bearer ${KEY}`, "content-type": "application/json" },
      body: JSON.stringify({ from: FROM, to: o.email, subject: "NARAN — ажилтны урилга", html }),
    });
    if (!res.ok) throw new Error(`Resend ${res.status}: ${await res.text()}`);
    console.log(`[email] staff invite → ${o.email}`);
  } catch (e: any) {
    console.error("invite email failed:", e.message);
  }
}

export async function sendPasswordResetEmail(o: PasswordResetEmail): Promise<void> {
  const html = renderPasswordResetEmail(o);
  if (!KEY) {
    // Dev/demo: no email provider configured — log the reset link so it's usable.
    console.log(`[email mock] password reset → ${o.email}\n  reset link: ${o.url}`);
    return;
  }
  try {
    const res = await fetch("https://api.resend.com/emails", {
      signal: AbortSignal.timeout(10_000), // never hang a subscriber on Resend
      method: "POST",
      headers: { authorization: `Bearer ${KEY}`, "content-type": "application/json" },
      body: JSON.stringify({ from: FROM, to: o.email, subject: "NARAN — нууц үг сэргээх", html }),
    });
    if (!res.ok) throw new Error(`Resend ${res.status}: ${await res.text()}`);
    console.log(`[email] password reset → ${o.email}`);
  } catch (e: any) {
    console.error("password reset email failed:", e.message);
  }
}
