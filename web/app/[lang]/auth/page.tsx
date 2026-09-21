"use client";
import { LocaleLink as Link } from "@/components/LocaleLink";
import { useState } from "react";
import { useRouter } from "next/navigation";
import { useAuth, useToast } from "@/lib/store";
import { useT, useLang } from "@/components/LangProvider";
import { api } from "@/lib/api";
import { EyeIcon, EyeOffIcon, ChevronLeft } from "@/components/Icons";

function pwScore(pw: string): 0 | 1 | 2 | 3 {
  if (!pw) return 0;
  let s = 0;
  if (pw.length >= 8) s++;
  if (pw.length >= 12 || (/\d/.test(pw) && /[^A-Za-z0-9]/.test(pw))) s++;
  if (/[A-Z]/.test(pw) && /[a-z]/.test(pw) && /\d/.test(pw)) s++;
  return Math.min(3, s) as 0 | 1 | 2 | 3;
}

const MailCheckIcon = ({ width = 24, height = 24 }: { width?: number; height?: number }) => (
  <svg width={width} height={height} viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round" aria-hidden>
    <path d="M21 10.5V7a2 2 0 0 0-2-2H5a2 2 0 0 0-2 2v10a2 2 0 0 0 2 2h8" />
    <path d="m3.5 7.5 8.5 6 8.5-6" />
    <path d="m16 17 2 2 4-4" />
  </svg>
);

export default function AuthPage() {
  const router = useRouter();
  const t = useT();
  const lang = useLang();
  const setSession = useAuth(s => s.setSession);
  const showToast = useToast(s => s.show);
  const [mode, setMode] = useState<"login" | "register" | "forgot">("login");
  const [busy, setBusy] = useState(false);
  const [showPw, setShowPw] = useState(false);
  const [sent, setSent] = useState(false);
  const [form, setForm] = useState({ name: "", email: "", password: "" });
  const [errors, setErrors] = useState<Record<string, string>>({});
  const [formError, setFormError] = useState("");
  const isReg = mode === "register";
  const isForgot = mode === "forgot";

  const update = (k: keyof typeof form) => (e: React.ChangeEvent<HTMLInputElement>) => {
    setForm(f => ({ ...f, [k]: e.target.value }));
    setErrors(er => ({ ...er, [k]: "" }));
  };

  function validate() {
    const er: Record<string, string> = {};
    if (isReg && !form.name.trim()) er.name = t("common.required");
    if (!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(form.email)) er.email = t("auth.invalidEmail");
    if (!isForgot && form.password.length < (isReg ? 8 : 1)) er.password = isReg ? t("auth.min8") : t("common.required");
    setErrors(er);
    return Object.keys(er).length === 0;
  }

  async function submit(e: React.FormEvent) {
    e.preventDefault();
    if (!validate()) return;
    setFormError("");
    setBusy(true);
    try {
      if (isForgot) {
        // Always resolves (no info leak); show the confirmation regardless.
        await api.auth.resetRequest(form.email);
        setSent(true);
        setBusy(false);
        return;
      }
      let result;
      if (isReg) {
        const parts = form.name.trim().split(/\s+/);
        const firstName = parts[0];
        const lastName = parts.slice(1).join(" ") || firstName;
        result = await api.auth.signup({ firstName, lastName, email: form.email, password: form.password });
      } else {
        result = await api.auth.login(form.email, form.password);
      }
      setSession(result.user, result.token);
      showToast(`${t("auth.welcomeName")}, ${result.user.firstName}!`);
      router.push(`/${lang}/account`);
    } catch (err: any) {
      const msg = err.message || t("toast.authFailed");
      showToast(msg);
      setFormError(msg);
      setBusy(false);
    }
  }

  const goForgot = () => { setMode("forgot"); setSent(false); setErrors({}); setFormError(""); };
  const backToLogin = () => { setMode("login"); setSent(false); setErrors({}); setFormError(""); };

  const score = pwScore(form.password);
  const strengthLabel = [t("auth.pwWeak"), t("auth.pwWeak"), t("auth.pwFair"), t("auth.pwStrong")][score];
  const strengthColor = ["#9aa0a6", "#ef4444", "#f59e0b", "#16a34a"][score];

  const toggle = () => { setMode(isReg ? "login" : "register"); setErrors({}); setFormError(""); };

  return (
    <div className="min-h-screen grid place-items-center px-4 py-8 sm:py-12" style={{ background: "linear-gradient(160deg, #FFFFFF 0%, #FDF3EC 100%)" }}>
      <div className="relative w-full max-w-[960px] overflow-hidden rounded-[1.75rem] sm:rounded-[2.25rem] bg-white shadow-[0_40px_90px_-30px_rgba(211,90,76,.30)] ring-1 ring-black/5 lg:grid lg:grid-cols-2 lg:min-h-[580px]">

        {/* ============ PROMO (desktop) ============ */}
        <div className="relative hidden lg:flex flex-col items-center justify-center px-12 py-14 text-center text-white"
          style={{ background: "linear-gradient(150deg, #EF8E80 0%, #D35A4C 100%)" }}>
          <div className="relative z-10 max-w-[300px]">
            <h2 className="font-display text-[32px] leading-tight">{isReg ? t("auth.backPromo") : t("auth.newHere")}</h2>
            <p className="mt-4 text-[14px] leading-relaxed text-white/80">{isReg ? t("auth.backPromoDesc") : t("auth.newHereDesc")}</p>
            <button type="button" onClick={toggle}
              className="mt-9 h-11 rounded-full border-2 border-white/80 px-10 text-[13px] font-semibold uppercase tracking-[.12em] transition hover:bg-white hover:text-[#D35A4C]">
              {isReg ? t("auth.signIn") : t("auth.signUp")}
            </button>
          </div>
          {/* curved divider bulging into the form panel */}
          <svg className="absolute top-0 right-0 h-full w-[70px] translate-x-[99%]" viewBox="0 0 70 100" preserveAspectRatio="none" aria-hidden style={{ fill: "#D35A4C" }}>
            <path d="M0 0 C 48 20, 48 80, 0 100 Z" />
          </svg>
        </div>

        {/* ============ FORM ============ */}
        <div className="relative flex flex-col justify-center px-7 sm:px-10 lg:px-14 py-10 lg:py-12">
          {/* Mobile top: back + brand + switch */}
          <div className="lg:hidden mb-7 flex items-center justify-between">
            <Link href="/" aria-label={t("bc.home")} className="grid h-9 w-9 -ml-1 place-items-center rounded-full text-ink/70 hover:bg-surface-2 transition">
              <ChevronLeft width={20} height={20} />
            </Link>
            <span className="font-display text-[22px] tracking-[.04em]">NARAN</span>
            <button type="button" onClick={toggle} className="text-[13px] font-medium text-accent hover:underline">
              {isReg ? t("auth.signIn") : t("auth.signUp")}
            </button>
          </div>

          <h1 className="font-display text-[28px] tracking-tight text-center lg:text-left">{isForgot ? t("auth.forgotTitle") : isReg ? t("auth.signUp") : t("auth.signIn")}</h1>
          <p className="mt-1.5 text-[14px] text-muted text-center lg:text-left">{isForgot ? t("auth.forgotDesc") : isReg ? t("auth.freeForever") : t("auth.enterDetails")}</p>

          {isForgot && sent ? (
            <div className="mt-8 flex flex-col items-center text-center lg:items-start lg:text-left">
              <span className="grid h-12 w-12 place-items-center rounded-full bg-accent-soft text-accent">
                <MailCheckIcon width={24} height={24} />
              </span>
              <h2 className="mt-4 font-display text-[20px] tracking-tight">{t("auth.resetSentTitle")}</h2>
              <p className="mt-2 text-[14px] leading-relaxed text-muted max-w-[340px]">{t("auth.resetSentDesc")}</p>
              <p className="mt-3 text-[13px] font-medium text-ink break-all">{form.email}</p>
              <button type="button" onClick={backToLogin}
                className="mt-7 inline-flex items-center gap-1.5 text-[13px] font-semibold text-accent hover:underline">
                <ChevronLeft width={16} height={16} /> {t("auth.backToSignIn")}
              </button>
            </div>
          ) : (
          <form onSubmit={submit} noValidate className="mt-7 space-y-3.5">
            <FloatingField label={t("co.email")} name="email" type="email" inputMode="email" autoComplete="email"
              value={form.email} onChange={update("email")} error={errors.email}/>

            {isReg && (
              <FloatingField label={t("auth.yourName")} name="name" autoComplete="name"
                value={form.name} onChange={update("name")} error={errors.name}/>
            )}

            {!isForgot && (
            <FloatingField
              label={t("auth.password")} name="password" type={showPw ? "text" : "password"}
              autoComplete={isReg ? "new-password" : "current-password"}
              value={form.password} onChange={update("password")} error={errors.password}
              labelRight={isReg && form.password ? (
                <span className="flex items-center gap-2">
                  <span className="flex gap-1" aria-hidden>
                    {[1, 2, 3].map(i => <span key={i} className="h-[3px] w-4 rounded-full" style={{ background: i <= score ? strengthColor : "#E3E3E6" }}/>)}
                  </span>
                  <span className="text-[11px] font-semibold" style={{ color: strengthColor }}>{strengthLabel}</span>
                </span>
              ) : undefined}
              right={
                <button type="button" onClick={() => setShowPw(v => !v)} aria-label={showPw ? t("auth.hidePw") : t("auth.showPw")}
                  className="grid place-items-center w-9 h-9 -mr-1 rounded-full text-subtle hover:text-ink transition-colors">
                  {showPw ? <EyeOffIcon width={18} height={18}/> : <EyeIcon width={18} height={18}/>}
                </button>
              }
            />
            )}

            {!isReg && !isForgot && (
              <div className="text-right -mt-1">
                <button type="button" onClick={goForgot}
                  className="text-[12px] text-muted hover:text-accent transition-colors">{t("auth.forgot")}</button>
              </div>
            )}

            {formError && (
              <div role="alert" className="flex items-start gap-2.5 rounded-xl border border-red-200 bg-red-50 px-4 py-3 text-[13px] text-red-700">
                <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.9" strokeLinecap="round" className="mt-0.5 shrink-0" aria-hidden><circle cx="12" cy="12" r="9"/><path d="M12 8v5M12 16h.01"/></svg>
                <span>{formError}</span>
              </div>
            )}
            <button disabled={busy} type="submit"
              className="w-full h-[52px] rounded-full text-white font-semibold uppercase tracking-[.12em] text-[13px] grid place-items-center disabled:opacity-60 transition active:scale-[.99] shadow-[0_12px_28px_-8px_rgba(110,84,236,.6)]"
              style={{ background: "linear-gradient(95deg, #EF8E80 0%, #D35A4C 100%)" }}>
              {busy ? t("common.pleaseWait") : isForgot ? t("auth.sendResetLink") : isReg ? t("auth.signUp") : t("auth.signIn")}
            </button>

            {isForgot && (
              <div className="pt-2 text-center">
                <button type="button" onClick={backToLogin}
                  className="inline-flex items-center gap-1.5 text-[13px] font-medium text-muted hover:text-accent transition-colors">
                  <ChevronLeft width={16} height={16} /> {t("auth.backToSignIn")}
                </button>
              </div>
            )}
          </form>
          )}
        </div>
      </div>
    </div>
  );
}

function FloatingField({ label, error, right, labelRight, name, ...props }: {
  label: string; error?: string; right?: React.ReactNode; labelRight?: React.ReactNode;
} & React.InputHTMLAttributes<HTMLInputElement>) {
  return (
    <div>
      <div className={`rounded-2xl border px-4 py-2 bg-white transition focus-within:border-[#E76F61] focus-within:ring-4 focus-within:ring-[#E76F61]/10 ${error ? "border-red-400" : "border-line"}`}>
        <div className="flex items-center justify-between">
          <label htmlFor={name} className="block text-[11px] font-medium text-subtle">{label}</label>
          {labelRight}
        </div>
        <div className="flex items-center">
          <input id={name} name={name} {...props}
            aria-invalid={!!error} aria-describedby={error ? `${name}-err` : undefined}
            className="flex-1 min-w-0 bg-transparent outline-none focus-visible:outline-none border-0 p-0 text-[15px] text-ink placeholder:text-subtle"/>
          {right}
        </div>
      </div>
      {error && <span id={`${name}-err`} role="alert" className="text-[11px] text-red-500 mt-1 block px-1">{error}</span>}
    </div>
  );
}
