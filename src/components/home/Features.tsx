import {
  Languages,
  ScanSearch,
  ShieldCheck,
  Database,
  Smartphone,
  UsersRound,
  MapPin,
  CheckCircle2,
  ArrowRight,
  LockKeyhole,
  Fingerprint,
  FileCheck2,
} from "lucide-react";

const features = [
  {
    icon: Languages,
    title: "Multilingual Address Support",
    description:
      "Resolve Bangla, English, Banglish and mixed-language addresses.",
  },
  {
    icon: ScanSearch,
    title: "Intelligent Address Matching",
    description:
      "Identify relevant localities using normalization, fuzzy matching and intelligent ranking.",
  },
  {
    icon: ShieldCheck,
    title: "Advanced Cryptography",
    description:
      "Protect private address information using authenticated AES-GCM encryption.",
  },
  {
    icon: Database,
    title: "Separate Audit Database",
    description:
      "Maintain protected records of important application and security activities.",
  },
  {
    icon: UsersRound,
    title: "Role-Based Access",
    description:
      "Dedicated experiences for merchants, reviewers, data managers and administrators.",
  },
  {
    icon: Smartphone,
    title: "Web & Android Application",
    description:
      "A unified responsive platform with an installable Capacitor.js Android application.",
  },
];

const steps = [
  {
    number: "01",
    icon: MapPin,
    title: "Enter Your Address",
    description:
      "Submit an address in Bangla, English or a mixed-language format.",
  },
  {
    number: "02",
    icon: ScanSearch,
    title: "Intelligent Processing",
    description:
      "Normalize the input and identify relevant locality candidates.",
  },
  {
    number: "03",
    icon: CheckCircle2,
    title: "Confirm the Result",
    description:
      "Review the suggestions and confirm the correct locality.",
  },
];

const securityFeatures = [
  {
    icon: LockKeyhole,
    title: "Encrypted Storage",
    description: "AES-256-GCM encryption for private address fields.",
  },
  {
    icon: Fingerprint,
    title: "Controlled Access",
    description: "Authentication, authorization and session protection.",
  },
  {
    icon: FileCheck2,
    title: "Security Audit",
    description: "Separately protected records of important security events.",
  },
];

export default function Features() {
  return (
    <>
      {/* Features */}
      <section
        id="features"
        className="scroll-mt-24 border-y border-slate-100 bg-white py-24"
      >

        <div className="mx-auto max-w-7xl px-5 lg:px-8">

          <div className="mx-auto mb-14 max-w-3xl text-center">

            <p className="text-sm font-bold uppercase tracking-[0.2em] text-emerald-700">
              Platform Capabilities
            </p>

            <h2 className="mt-4 text-4xl font-extrabold tracking-tight text-slate-900 md:text-5xl">
              Powerful technology.
              <br />
              Simple experience.
            </h2>

            <p className="mt-5 text-lg leading-8 text-slate-500">
              Discover the core capabilities being developed
              for the ThikanaHub platform.
            </p>

          </div>

          <div className="grid gap-6 sm:grid-cols-2 lg:grid-cols-3">

            {features.map((feature) => (
              <article
                key={feature.title}
                className="group rounded-3xl border border-slate-200 bg-white p-8 transition-all duration-300 hover:-translate-y-2 hover:border-emerald-300 hover:shadow-xl hover:shadow-emerald-900/5"
              >

                <div className="mb-6 inline-flex rounded-2xl bg-emerald-50 p-4 text-emerald-700 transition-colors group-hover:bg-emerald-700 group-hover:text-white">
                  <feature.icon size={29} />
                </div>

                <h3 className="text-xl font-bold text-slate-900">
                  {feature.title}
                </h3>

                <p className="mt-3 leading-7 text-slate-500">
                  {feature.description}
                </p>

              </article>
            ))}

          </div>

        </div>

      </section>

      {/* How It Works */}
      <section
        id="how-it-works"
        className="scroll-mt-24 bg-slate-50 py-24"
      >

        <div className="mx-auto max-w-7xl px-5 lg:px-8">

          <div className="mb-14 text-center">

            <p className="text-sm font-bold uppercase tracking-widest text-emerald-700">
              Simple Workflow
            </p>

            <h2 className="mt-4 text-4xl font-extrabold tracking-tight text-slate-900">
              How ThikanaHub Works
            </h2>

            <p className="mt-4 text-slate-500">
              From unstructured addresses to meaningful locality suggestions.
            </p>

          </div>

          <div className="grid gap-7 md:grid-cols-3">

            {steps.map((step) => (
              <article
                key={step.number}
                className="relative overflow-hidden rounded-3xl border border-slate-200 bg-white p-8"
              >

                <span className="absolute right-5 top-3 text-7xl font-extrabold text-slate-100">
                  {step.number}
                </span>

                <div className="relative">

                  <div className="mb-6 inline-flex rounded-2xl bg-emerald-100 p-4 text-emerald-700">
                    <step.icon size={30} />
                  </div>

                  <h3 className="text-xl font-bold text-slate-900">
                    {step.title}
                  </h3>

                  <p className="mt-3 leading-7 text-slate-500">
                    {step.description}
                  </p>

                </div>

              </article>
            ))}

          </div>

        </div>

      </section>

      {/* Security Section */}
      <section
        id="security"
        className="scroll-mt-24 bg-white py-20"
      >

        <div className="mx-auto max-w-7xl px-5 lg:px-8">

          <div className="relative overflow-hidden rounded-[32px] bg-slate-950 p-8 text-white md:p-14">

            <div
              aria-hidden="true"
              className="pointer-events-none absolute -right-20 -top-20 h-80 w-80 rounded-full bg-emerald-500/20 blur-[100px]"
            />

            <div className="relative">

              <ShieldCheck
                size={45}
                className="mb-6 text-emerald-400"
              />

              <p className="text-sm font-bold uppercase tracking-widest text-emerald-400">
                Security By Design
              </p>

              <h2 className="mt-4 max-w-3xl text-4xl font-extrabold tracking-tight md:text-5xl">
                Your address.
                <br />
                Your privacy.
              </h2>

              <p className="mt-5 max-w-2xl leading-8 text-slate-300">
                ThikanaHub is being designed with cryptography,
                controlled access and protected audit records
                at the core of its architecture.
              </p>

              <div className="mt-10 grid gap-5 md:grid-cols-3">

                {securityFeatures.map((feature) => (
                  <article
                    key={feature.title}
                    className="rounded-2xl border border-white/10 bg-white/5 p-6"
                  >

                    <feature.icon
                      size={27}
                      className="mb-5 text-emerald-400"
                    />

                    <h3 className="text-lg font-bold">
                      {feature.title}
                    </h3>

                    <p className="mt-3 text-sm leading-7 text-slate-300">
                      {feature.description}
                    </p>

                  </article>
                ))}

              </div>

              <a
                href="#preview"
                className="mt-10 inline-flex items-center gap-3 rounded-xl bg-emerald-500 px-6 py-4 font-bold text-slate-950 transition hover:bg-emerald-400"
              >
                Explore Platform
                <ArrowRight size={19} />
              </a>

            </div>

          </div>

        </div>

      </section>
    </>
  );
}