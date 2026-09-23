"use client";
import { useEffect, useRef, useState } from "react";
import { useRouter } from "next/navigation";
import { LocaleLink as Link } from "@/components/LocaleLink";
import { Logo } from "@/components/Logo";
import { useAuth, useToast } from "@/lib/store";
import { useT, useLang } from "@/components/LangProvider";
import { medusa } from "@/lib/medusa";

// Google redirects here with ?code=…&state=… . We hand those to Medusa, get a
// session, then send the shopper to their account. No secrets on the client.
export default function GoogleCallbackPage() {
  const router = useRouter();
  const t = useT();
  const lang = useLang();
  const setSession = useAuth(s => s.setSession);
  const showToast = useToast(s => s.show);
  const [error, setError] = useState(false);
  const done = useRef(false);

  useEffect(() => {
    if (done.current) return;
    done.current = true;
    (async () => {
      const qs = window.location.search;
      if (!/[?&]code=/.test(qs)) { setError(true); return; }
      try {
        const { token, user } = await medusa.auth.googleFinish(qs);
        setSession(user, token);
        showToast(t("auth.welcome"));
        router.replace(`/${lang}/account`);
      } catch {
        setError(true);
      }
    })();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  return (
    <div className="min-h-screen grid place-items-center px-4 mesh-light">
      <div className="w-full max-w-[400px] rounded-3xl bg-white border border-line shadow-lift p-8 text-center">
        <Logo className="h-10 mx-auto" />
        {error ? (
          <>
            <p className="mt-6 text-[15px] font-semibold text-ink">{t("auth.googleFailed")}</p>
            <p className="mt-1.5 text-[13px] text-muted">{t("auth.googleFailedHint")}</p>
            <Link href="/auth" className="btn btn-outline mt-6 inline-flex">{t("auth.backToSignIn")}</Link>
          </>
        ) : (
          <>
            <div className="mt-6 mx-auto w-9 h-9 rounded-full border-2 border-accent/25 border-t-accent animate-spin" />
            <p className="mt-4 text-[14px] text-muted">{t("auth.googleFinishing")}</p>
          </>
        )}
      </div>
    </div>
  );
}
