import Navbar from "@/components/shared/Navbar";
import Hero from "@/components/home/Hero";
import Features from "@/components/home/Features";
import Footer from "@/components/shared/Footer";

import { Download, Smartphone, ShieldCheck } from "lucide-react";
import { existsSync } from "node:fs";
import path from "node:path";

const APK_NAME = "ThikanaHub-v1.0.apk";

export default function Home() {
  const downloadEnabled =
    process.env.APP_DOWNLOAD_ENABLED === "true" &&
    existsSync(
      path.join(
        process.cwd(),
        "public",
        "downloads",
        APK_NAME
      )
    );

  return (
    <>
      <Navbar />

      <main>
        <Hero />

        {downloadEnabled && (
          <section
            id="download-app"
            className="bg-white px-4 py-12 sm:px-6 lg:px-8"
          >
            <div className="mx-auto max-w-6xl overflow-hidden rounded-3xl bg-slate-900 p-8 text-white sm:p-12">
              <div className="flex flex-col items-start justify-between gap-8 md:flex-row md:items-center">
                <div className="max-w-2xl">
                  <div className="mb-5 flex h-14 w-14 items-center justify-center rounded-2xl bg-emerald-600">
                    <Smartphone size={28} />
                  </div>

                  <p className="mb-2 text-sm font-semibold uppercase tracking-wider text-emerald-400">
                    Available for Android
                  </p>

                  <h2 className="text-3xl font-bold sm:text-4xl">
                    ThikanaHub in your pocket.
                  </h2>

                  <p className="mt-4 leading-relaxed text-slate-300">
                    Resolve, manage and securely share addresses
                    directly from your Android smartphone.
                  </p>

                  <div className="mt-5 flex flex-wrap gap-4 text-sm text-slate-300">
                    <span className="flex items-center gap-2">
                      <ShieldCheck
                        size={18}
                        className="text-emerald-400"
                      />
                      Digitally signed APK
                    </span>

                    <span>Version 1.0</span>
                    <span>Android 7.0+</span>
                  </div>
                </div>

                <div className="w-full shrink-0 md:w-auto">
                  <a
                    href={`/downloads/${APK_NAME}`}
                    download={APK_NAME}
                    className="flex items-center justify-center gap-3 rounded-xl bg-emerald-600 px-7 py-4 font-semibold text-white transition hover:bg-emerald-500"
                  >
                    <Download size={22} />
                    Download App
                  </a>

                  <p className="mt-3 text-center text-xs text-slate-400">
                    Free direct APK download
                  </p>
                </div>
              </div>
            </div>
          </section>
        )}

        <Features />
      </main>

      <Footer />
    </>
  );
}
