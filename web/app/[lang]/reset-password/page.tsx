"use client";
import { LocaleLink as Link } from "@/components/LocaleLink";
import { Suspense, useState } from "react";
import { useSearchParams, useRouter } from "next/navigation";
import { useToast } from "@/lib/store";
import { useT, useLang } from "@/components/LangProvider";
import { api } from "@/lib/api";
import { EyeIcon, EyeOffIcon, CheckIcon, LockIcon } from "@/components/Icons";

function pwScore(pw: string): 0 | 1 | 2 | 3 {
  if (!pw) return 0;
  let s = 0;
  if (pw.length >= 8) s++;
  if (pw.length >= 12 || (/\d/.test(pw) && /[^A-Za-z0-9]/.test(pw))) s++;
  if (/[A-Z]/.test(pw) && /[a-z]/.test(pw) && /\d/.test(pw)) s++;
  return Math.min(3, s) as 0 | 1 | 2 | 3;
}

function ResetInner() {
  const t = useT();
  const lang = useLang();
  const router = useRouter();
  const params = useSearchParams();
  const showToast = useToast(s => s.show);

  const token = params.get("token") || "";
  const email = params.get("email") || "";

  const [pw, setPw] = useState("");
  const [confirm, setConfirm] = useState("");
  const [showPw, setShowPw] = useState(false);
  const [busy, setBusy] = useState(false);
  const [done, setDone] = useState(false);
  const [invalid, setInvalid] = useState(!token);
  const [errors, setErrors] = useState<{ pw?: string; confirm?: string }>({});

  const score = pwScore(pw);
  const strengthLabel = [t("auth.pwWeak"), t("auth.pwWeak"), t("auth.pwFair"), t("auth.pwStrong")][score];
  const strengthColor = ["#9aa0a6", "#ef4444", "#f59e0b", "#16a34a"][score];

  async function submit(e: React.FormEvent) {
    e.preventDefault();
    const er: typeof errors = {};
    if (pw.length < 8) er.pw = t("auth.min8");
    if (confirm !== pw) er.confirm = t("reset.mismatch");
    setErrors(er);
    if (Object.keys(er).length) return;

    setBusy(true);
    try {
      await api.auth.resetConfirm(token, pw);
      setDone(true);
    } catch (err: any) {
      setInvalid(true);
      showToast(err.message || t("reset.invalidDesc"));
    } finally {
      setBusy(false);
    }
  }

  return (
    <div className="min-h-screen grid place-items-center px-4 py-10 sm:py-14" style={{ background: "linear-gradient(160deg, #FFFFFF 0%, #FDF3EC 100%)" }}>
      <div className="relative w-full max-w-[440px] overflow-hidden rounded-[1.75rem] sm:rounded-[2.25rem] bg-white shadow-[0_40px_90px_-30px_rgba(143,75,64,.30)] ring-1 ring-black/5 px-7 sm:px-10 py-10 sm:py-12">
        <div className="flex items-center justify-center">
          <span className="grid h-11 w-11 place-items-center rounded-full text-white shadow-[0_10px_24px_-8px_rgba(174,98,85,.6)]"
            style={{ background: "linear-gradient(135deg, #D39486, #8F4B40)" }}>
            {done ? <CheckIcon width={22} height={22} /> : <LockIcon width={20} height={20} />}
          </span>
        </div>

        {done ? (
          <div className="mt-5 text-center">
            <h1 className="font-display text-[24px] tracking-tight">{t("reset.successTitle")}</h1>
            <p className="mt-2 text-[14px] leading-relaxed text-muted">{t("reset.successDesc")}</p>
            <button type="button" onClick={() => router.push(`/${lang}/auth`)}
              className="mt-7 w-full h-[50px] rounded-full text-white font-semibold uppercase tracking-[.12em] text-[13px] grid place-items-center transition active:scale-[.99]"
              style={{ background: "linear-gradient(95deg, #D39486 0%, #8F4B40 100%)" }}>
              {t("reset.goToSignIn")}
            </button>
          </div>
        ) : invalid ? (
          <div className="mt-5 text-center">
            <h1 className="font-display text-[24px] tracking-tight">{t("reset.invalidTitle")}</h1>
            <p className="mt-2 text-[14px] leading-relaxed text-muted">{t("reset.invalidDesc")}</p>
            <Link href="/auth"
              className="mt-7 inline-grid w-full h-[50px] place-items-center rounded-full text-white font-semibold uppercase tracking-[.12em] text-[13px] transition active:scale-[.99]"
              style={{ background: "linear-gradient(95deg, #D39486 0%, #8F4B40 100%)" }}>
              {t("reset.requestNew")}
            </Link>
          </div>
        ) : (
          <>
            <h1 className="mt-5 font-display text-[24px] tracking-tight text-center">{t("reset.title")}</h1>
            <p className="mt-1.5 text-[14px] text-muted text-center">{t("reset.desc")}</p>
            {email && <p className="mt-2 text-[13px] font-medium text-ink text-center break-all">{email}</p>}

            <form onSubmit={submit} noValidate className="mt-7 space-y-3.5">
              <Field
                label={t("reset.newPassword")} name="new-password" type={showPw ? "text" : "password"}
                autoComplete="new-password" value={pw} onChange={e => { setPw(e.target.value); setErrors(x => ({ ...x, pw: "" })); }}
                error={errors.pw}
                labelRight={pw ? (
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
              <Field
                label={t("reset.confirmPassword")} name="confirm-password" type={showPw ? "text" : "password"}
                autoComplete="new-password" value={confirm} onChange={e => { setConfirm(e.target.value); setErrors(x => ({ ...x, confirm: "" })); }}
                error={errors.confirm}
              />

              <button disabled={busy} type="submit"
                className="w-full h-[50px] rounded-full text-white font-semibold uppercase tracking-[.12em] text-[13px] grid place-items-center disabled:opacity-60 transition active:scale-[.99]"
                style={{ background: "linear-gradient(95deg, #D39486 0%, #8F4B40 100%)" }}>
                {busy ? t("reset.updating") : t("reset.submit")}
              </button>
            </form>
          </>
        )}
      </div>
    </div>
  );
}

export default function ResetPasswordPage() {
  return (
    <Suspense fallback={null}>
      <ResetInner />
    </Suspense>
  );
}

function Field({ label, error, right, labelRight, name, ...props }: {
  label: string; error?: string; right?: React.ReactNode; labelRight?: React.ReactNode;
} & React.InputHTMLAttributes<HTMLInputElement>) {
  return (
    <div>
      <div className={`rounded-2xl border px-4 py-2 bg-white transition focus-within:border-[#AE6255] focus-within:ring-4 focus-within:ring-[#AE6255]/10 ${error ? "border-red-400" : "border-line"}`}>
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
