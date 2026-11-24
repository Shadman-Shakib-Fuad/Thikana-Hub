import {
  MapPin,
  ArrowRight,
  ShieldCheck,
  Languages,
  ScanSearch,
  CheckCircle2,
  Fingerprint,
  Globe2,
} from "lucide-react";

const features = [
  {
    icon: Languages,
    title: "Multilingual Intelligence",
    description:
      "Resolve addresses written in Bangla, English, and mixed-language formats.",
  },
  {
    icon: ScanSearch,
    title: "Intelligent Matching",
    description:
      "Discover relevant locality suggestions from incomplete or differently written addresses.",
  },
  {
    icon: ShieldCheck,
    title: "Privacy First",
    description:
      "Designed around encrypted storage, controlled access, and secure address sharing.",
  },
];

export default function Home() {
  return (
    <main className="min-h-screen bg-background">

      {/* Navigation */}
      <header className="border-b border-border bg-white">
        <nav className="mx-auto flex max-w-7xl items-center justify-between px-6 py-5">

          <a href="#" className="flex items-center gap-3">
            <div className="rounded-xl bg-primary p-3 text-white">
              <MapPin size={25} />
            </div>

            <div>
              <h1 className="text-2xl font-bold tracking-tight">
                Thikana<span className="text-primary">Hub</span>
              </h1>
              <p className="text-xs text-muted">
                Intelligent Address Platform
              </p>
            </div>
          </a>

          <a
            href="#features"
            className="rounded-lg bg-primary px-5 py-3 text-sm font-semibold text-white transition hover:bg-emerald-800"
          >
            Explore
          </a>

        </nav>
      </header>

      {/* Hero Section */}
      <section className="mx-auto grid max-w-7xl items-center gap-12 px-6 py-20 lg:grid-cols-2 lg:py-28">

        <div>

          <div className="mb-6 inline-flex items-center gap-2 rounded-full border border-emerald-200 bg-emerald-50 px-4 py-2 text-sm font-medium text-primary">
            <Globe2 size={16} />
            Built for Bangladesh
          </div>

          <h2 className="text-5xl font-bold leading-tight tracking-tight md:text-6xl">
            Every Address.
            <br />
            <span className="text-primary">
              A Clear Destination.
            </span>
          </h2>

          <p className="mt-6 max-w-xl text-lg leading-relaxed text-muted">
            Transform complex, incomplete, and multilingual
            addresses into structured locality suggestions
            with ThikanaHub.
          </p>

          <p className="mt-4 text-lg font-medium text-primary">
            সঠিক ঠিকানা, সহজ সমাধান।
          </p>

          <div className="mt-8 flex flex-wrap gap-4">

            <a
              href="#preview"
              className="flex items-center gap-2 rounded-xl bg-primary px-6 py-4 font-semibold text-white transition hover:bg-emerald-800"
            >
              Discover ThikanaHub
              <ArrowRight size={19} />
            </a>

            <a
              href="#features"
              className="rounded-xl border border-border bg-white px-6 py-4 font-semibold transition hover:border-primary"
            >
              Learn More
            </a>

          </div>

        </div>

        {/* Address Preview */}
        <div
          id="preview"
          className="rounded-3xl border border-border bg-white p-6 shadow-xl shadow-slate-200/60 md:p-8"
        >

          <div className="mb-6 flex items-center gap-3">

            <div className="rounded-xl bg-emerald-100 p-3 text-primary">
              <ScanSearch size={26} />
            </div>

            <div>
              <h3 className="text-xl font-bold">
                Address Resolution
              </h3>
              <p className="text-sm text-muted">
                Illustrative example
              </p>
            </div>

          </div>

          <div className="rounded-xl border border-border bg-background p-5">

            <p className="mb-2 text-xs font-semibold uppercase tracking-wider text-muted">
              Original Address
            </p>

            <p className="font-medium">
              কাজীপাড়া, Mirpur, Dhaka
            </p>

          </div>

          <div className="flex justify-center py-5">
            <ArrowRight
              className="rotate-90 text-primary"
              size={26}
            />
          </div>

          <div className="rounded-xl border border-emerald-200 bg-emerald-50 p-5">

            <div className="mb-3 flex items-center gap-2 font-semibold text-primary">
              <CheckCircle2 size={20} />
              Example Suggested Locality
            </div>

            <h4 className="text-xl font-bold">
              Kazipara, Mirpur
            </h4>

            <p className="mt-1 text-sm text-muted">
              Dhaka, Bangladesh
            </p>

            <div className="mt-4 border-t border-emerald-200 pt-4">

              <div className="flex items-center gap-2 text-sm font-medium text-primary">
                <Fingerprint size={18} />
                Confirmation required
              </div>

            </div>

          </div>

          <p className="mt-4 text-xs leading-relaxed text-muted">
            Demonstration only. Live address matching will
            be available after backend integration.
          </p>

        </div>

      </section>

      {/* Features Section */}
      <section
        id="features"
        className="border-y border-border bg-white py-20"
      >

        <div className="mx-auto max-w-7xl px-6">

          <div className="mb-12 text-center">

            <p className="font-semibold uppercase tracking-widest text-primary">
              Our Core Technology
            </p>

            <h2 className="mt-3 text-3xl font-bold md:text-4xl">
              Designed for smarter address resolution
            </h2>

            <p className="mt-4 text-muted">
              The core capabilities planned for ThikanaHub.
            </p>

          </div>

          <div className="grid gap-6 md:grid-cols-3">

            {features.map((feature) => (
              <article
                key={feature.title}
                className="rounded-2xl border border-border bg-background p-7 transition hover:-translate-y-1 hover:shadow-lg"
              >

                <div className="mb-5 inline-flex rounded-xl bg-emerald-100 p-4 text-primary">
                  <feature.icon size={28} />
                </div>

                <h3 className="mb-3 text-xl font-bold">
                  {feature.title}
                </h3>

                <p className="leading-relaxed text-muted">
                  {feature.description}
                </p>

              </article>
            ))}

          </div>

        </div>

      </section>

      {/* Footer */}
      <footer className="px-6 py-8 text-center">

        <p className="font-bold">
          Thikana<span className="text-primary">Hub</span>
        </p>

        <p className="mt-2 text-sm text-muted">
          Intelligent Address Resolution for Bangladesh
        </p>

        <p className="mt-4 text-xs text-muted">
          © {new Date().getFullYear()} ThikanaHub.
          All rights reserved.
        </p>

      </footer>

    </main>
  );
}