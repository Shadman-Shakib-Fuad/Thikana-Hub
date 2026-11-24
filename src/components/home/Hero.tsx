import {
  ArrowRight,
  ArrowDown,
  MapPin,
  ShieldCheck,
  ScanSearch,
  Globe2,
  CheckCircle2,
  Sparkles,
  Languages,
  Fingerprint,
} from "lucide-react";

export default function Hero() {
  return (
    <section className="relative isolate overflow-hidden bg-slate-50">

      {/* Background Effects */}
      <div
        aria-hidden="true"
        className="pointer-events-none absolute -right-40 -top-40 -z-10 h-[500px] w-[500px] rounded-full bg-emerald-200/40 blur-[120px]"
      />

      <div
        aria-hidden="true"
        className="pointer-events-none absolute -bottom-40 -left-40 -z-10 h-[450px] w-[450px] rounded-full bg-teal-200/30 blur-[120px]"
      />

      <div className="mx-auto grid max-w-7xl items-center gap-16 px-5 py-20 lg:grid-cols-2 lg:px-8 lg:py-28">

        {/* Hero Content */}
        <div>

          <div className="mb-7 inline-flex items-center gap-2 rounded-full border border-emerald-200 bg-white px-4 py-2 text-sm font-semibold text-emerald-700 shadow-sm">
            <Sparkles size={16} />
            Intelligent Address Resolution
          </div>

          <h1 className="text-5xl font-extrabold leading-[1.12] tracking-tight text-slate-900 sm:text-6xl xl:text-7xl">
            Every Address.
            <span className="mt-2 block bg-gradient-to-r from-emerald-700 to-teal-500 bg-clip-text text-transparent">
              A Clear Destination.
            </span>
          </h1>

          <p className="mt-7 max-w-xl text-lg leading-8 text-slate-600">
            Transform incomplete, complex, and multilingual
            addresses into meaningful locality suggestions
            through intelligent matching technology.
          </p>

          <p
            lang="bn"
            className="mt-4 text-xl font-semibold text-emerald-700"
          >
            সঠিক ঠিকানা, সহজ সমাধান।
          </p>

          {/* Action Buttons */}
          <div className="mt-9 flex flex-wrap gap-4">

            <a
              href="#preview"
              className="group flex items-center gap-3 rounded-xl bg-emerald-700 px-7 py-4 font-semibold text-white shadow-xl shadow-emerald-200 transition hover:-translate-y-1 hover:bg-emerald-800"
            >
              Explore Address Resolution
              <ArrowRight
                size={20}
                className="transition-transform group-hover:translate-x-1"
              />
            </a>

            <a
              href="#how-it-works"
              className="rounded-xl border border-slate-200 bg-white px-7 py-4 font-semibold text-slate-700 transition hover:border-emerald-400"
            >
              How It Works
            </a>

          </div>

          {/* Core Highlights */}
          <div className="mt-10 flex flex-wrap gap-5 text-sm font-medium text-slate-600">

            <span className="flex items-center gap-2">
              <ShieldCheck size={19} className="text-emerald-600" />
              Privacy-first design
            </span>

            <span className="flex items-center gap-2">
              <Languages size={19} className="text-emerald-600" />
              Multilingual
            </span>

            <span className="flex items-center gap-2">
              <Globe2 size={19} className="text-emerald-600" />
              Built for Bangladesh
            </span>

          </div>

        </div>

        {/* Address Resolution Preview */}
        <div id="preview" className="relative scroll-mt-28">

          <div
            aria-hidden="true"
            className="absolute -inset-3 rounded-[36px] bg-gradient-to-br from-emerald-100 to-teal-100 blur-lg"
          />

          <div className="relative rounded-[30px] border border-white bg-white p-6 shadow-2xl shadow-emerald-900/10 sm:p-8">

            {/* Card Header */}
            <div className="flex flex-wrap items-center justify-between gap-4 border-b border-slate-100 pb-6">

              <div className="flex items-center gap-3">

                <div className="rounded-2xl bg-emerald-100 p-4 text-emerald-700">
                  <ScanSearch size={27} />
                </div>

                <div>
                  <h2 className="text-xl font-bold text-slate-900">
                    Address Resolution
                  </h2>

                  <p className="mt-1 text-sm text-slate-500">
                    Interactive platform preview
                  </p>
                </div>

              </div>

              <span className="rounded-full bg-emerald-50 px-3 py-1.5 text-xs font-bold text-emerald-700">
                DEMO
              </span>

            </div>

            {/* Original Address */}
            <div className="mt-6">

              <p className="mb-3 text-xs font-bold uppercase tracking-widest text-slate-500">
                Original Address
              </p>

              <div className="flex items-center gap-3 rounded-2xl border border-slate-200 bg-slate-50 p-5">
                <MapPin className="shrink-0 text-slate-400" size={22} />

                <p className="font-semibold text-slate-700">
                  কাজীপাড়া, Mirpur, Dhaka
                </p>
              </div>

            </div>

            {/* Processing Indicator */}
            <div className="flex items-center justify-center gap-3 py-6 text-emerald-700">

              <div className="h-px flex-1 bg-emerald-100" />

              <div className="rounded-full bg-emerald-50 p-3">
                <ArrowDown size={20} />
              </div>

              <div className="h-px flex-1 bg-emerald-100" />

            </div>

            {/* Result Card */}
            <div className="rounded-2xl border border-emerald-200 bg-emerald-50 p-6">

              <div className="flex items-center gap-2 text-sm font-semibold text-emerald-700">
                <CheckCircle2 size={19} />
                Example Suggested Locality
              </div>

              <h3 className="mt-4 text-2xl font-extrabold text-slate-900">
                Kazipara, Mirpur
              </h3>

              <p className="mt-2 text-slate-600">
                Dhaka, Bangladesh
              </p>

              <div className="mt-5 flex items-center gap-2 border-t border-emerald-200 pt-4 text-sm font-medium text-emerald-800">
                <Fingerprint size={19} />
                User confirmation required
              </div>

            </div>

            <p className="mt-5 text-xs leading-relaxed text-slate-500">
              This is an illustrative example. Live matching
              will be enabled after backend integration.
            </p>

          </div>

        </div>

      </div>

    </section>
  );
}