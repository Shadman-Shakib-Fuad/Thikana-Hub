import BrandLogo from "@/components/branding/BrandLogo";
import type { ReactNode } from "react";
import Link from "next/link";
import {
  ShieldCheck,
  Languages,
  ScanSearch,
  ArrowLeft,
  Sparkles,
  Globe2,
} from "lucide-react";

const highlights = [
  {
    icon: ShieldCheck,
    title: "Privacy-first architecture",
    description: "Designed to protect your sensitive address information.",
  },
  {
    icon: Languages,
    title: "Multilingual intelligence",
    description: "Bangla, English and mixed-language address support.",
  },
  {
    icon: ScanSearch,
    title: "Intelligent address resolution",
    description: "Turn complex addresses into meaningful suggestions.",
  },
];

export default function AuthLayout({
  children,
}: {
  children: ReactNode;
}) {
  return (
    <main className="grid min-h-screen bg-white lg:grid-cols-2">

      {/* Left Branding Section */}
      <section className="relative hidden flex-col justify-between overflow-hidden bg-slate-950 p-12 text-white lg:flex xl:p-16">

        {/* Background Effects */}
        <div
          aria-hidden="true"
          className="absolute -right-32 -top-32 h-96 w-96 rounded-full bg-emerald-500/20 blur-[120px]"
        />

        <div
          aria-hidden="true"
          className="absolute -bottom-32 -left-32 h-96 w-96 rounded-full bg-teal-500/20 blur-[120px]"
        />

        {/* Logo */}
        <Link href="/" className="relative flex items-center gap-3">

          <BrandLogo variant="icon" decorative />

          <div>
            <p className="text-3xl font-extrabold tracking-tight">
              Thikana<span className="text-emerald-400">Hub</span>
            </p>

            <p className="text-xs tracking-widest text-slate-400">
              INTELLIGENT ADDRESS PLATFORM
            </p>
          </div>

        </Link>

        {/* Branding Content */}
        <div className="relative my-16">

          <div className="mb-6 inline-flex items-center gap-2 rounded-full border border-emerald-500/20 bg-emerald-500/10 px-4 py-2 text-sm text-emerald-400">
            <Sparkles size={16} />
            The future of address resolution
          </div>

          <h1 className="text-5xl font-extrabold leading-tight tracking-tight xl:text-6xl">
            Smarter Addresses.
            <span className="mt-2 block text-emerald-400">
              Safer Connections.
            </span>
          </h1>

          <p className="mt-6 max-w-lg text-lg leading-8 text-slate-400">
            Discover a smarter way to resolve, manage and
            protect addresses across Bangladesh.
          </p>

          <div className="mt-10 space-y-6">

            {highlights.map((item) => (
              <div key={item.title} className="flex gap-4">

                <div className="flex h-12 w-12 shrink-0 items-center justify-center rounded-xl border border-emerald-500/20 bg-emerald-500/10 text-emerald-400">
                  <item.icon size={23} />
                </div>

                <div>
                  <h2 className="font-semibold text-white">
                    {item.title}
                  </h2>

                  <p className="mt-1 text-sm leading-6 text-slate-400">
                    {item.description}
                  </p>
                </div>

              </div>
            ))}

          </div>

        </div>

        {/* Bottom Branding */}
        <div className="relative flex flex-wrap items-center justify-between gap-4 border-t border-white/10 pt-6 text-sm text-slate-400">

          <p>© {new Date().getFullYear()} ThikanaHub</p>

          <p className="flex items-center gap-2">
            <Globe2 size={17} className="text-emerald-400" />
            Built for Bangladesh
          </p>

        </div>

      </section>

      {/* Right Form Section */}
      <section className="flex flex-col px-5 py-7 sm:px-12 lg:px-16">

        <Link
          href="/"
          className="inline-flex w-fit items-center gap-2 text-sm font-semibold text-slate-500 transition hover:text-emerald-700"
        >
          <ArrowLeft size={18} />
          Back to Home
        </Link>

        <div className="flex flex-1 items-center justify-center py-10">

          <div className="w-full max-w-md">

            {/* Mobile Logo */}
            <Link
              href="/"
              className="mb-8 flex items-center gap-3 lg:hidden"
            >
              <BrandLogo variant="full" priority />
            </Link>

            {children}

          </div>

        </div>

        <p
          lang="bn"
          className="text-center text-sm font-medium text-slate-400"
        >
          সঠিক ঠিকানা, সহজ সমাধান।
        </p>

      </section>

    </main>
  );
}