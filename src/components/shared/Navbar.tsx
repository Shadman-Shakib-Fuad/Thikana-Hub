"use client";

import { useState } from "react";
import Link from "next/link";

import {
  MapPin,
  Menu,
  X,
  ArrowRight,
  LogIn,
  LayoutDashboard,
  LoaderCircle,
} from "lucide-react";

import { useAuth } from "@/context/AuthContext";

const navLinks = [
  { name: "Home", href: "/" },
  { name: "Features", href: "/#features" },
  { name: "How It Works", href: "/#how-it-works" },
  { name: "Security", href: "/#security" },
];

export default function Navbar() {

  const [isOpen, setIsOpen] = useState(false);

  const {
    user,
    status,
    isAuthenticated,
  } = useAuth();

  function closeMenu() {
    setIsOpen(false);
  }

  return (
    <header className="sticky top-0 z-50 border-b border-slate-200/80 bg-white/90 backdrop-blur-xl">

      <nav
        aria-label="Main navigation"
        className="mx-auto flex h-20 max-w-7xl items-center justify-between px-5 lg:px-8"
      >

        {/* Logo */}
        <Link
          href="/"
          onClick={closeMenu}
          className="flex items-center gap-3"
        >

          <div className="flex h-11 w-11 items-center justify-center rounded-2xl bg-emerald-700 text-white shadow-lg shadow-emerald-200">
            <MapPin size={25} />
          </div>

          <div>

            <p className="text-2xl font-extrabold tracking-tight text-slate-900">
              Thikana<span className="text-emerald-700">Hub</span>
            </p>

            <p className="text-[9px] font-semibold tracking-widest text-slate-500">
              INTELLIGENT ADDRESS PLATFORM
            </p>

          </div>

        </Link>

        {/* Desktop Navigation */}
        <div className="hidden items-center gap-7 lg:flex">

          {navLinks.map((link) => (
            <Link
              key={link.name}
              href={link.href}
              className="text-sm font-semibold text-slate-600 transition hover:text-emerald-700"
            >
              {link.name}
            </Link>
          ))}

        </div>

        {/* Desktop Authentication */}
        <div className="hidden items-center gap-3 lg:flex">

          {status === "loading" ? (

            <LoaderCircle
              size={22}
              className="animate-spin text-emerald-700"
            />

          ) : isAuthenticated ? (

            <Link
              href="/dashboard/"
              className="flex items-center gap-3 rounded-xl bg-emerald-700 px-5 py-3 text-sm font-bold text-white transition hover:bg-emerald-800"
            >

              <LayoutDashboard size={19} />

              <span>Dashboard</span>

            </Link>

          ) : (

            <>

              <Link
                href="/login/"
                className="flex items-center gap-2 rounded-xl px-4 py-3 text-sm font-semibold text-slate-700 transition hover:bg-slate-100"
              >
                <LogIn size={17} />
                Sign In
              </Link>

              <Link
                href="/register/"
                className="flex items-center gap-2 rounded-xl bg-emerald-700 px-5 py-3 text-sm font-bold text-white transition hover:bg-emerald-800"
              >
                Get Started
                <ArrowRight size={17} />
              </Link>

            </>

          )}

        </div>

        {/* Mobile Menu Button */}
        <button
          type="button"
          aria-label={isOpen ? "Close menu" : "Open menu"}
          aria-expanded={isOpen}
          aria-controls="mobile-navigation"
          onClick={() => setIsOpen(!isOpen)}
          className="rounded-xl border border-slate-200 p-3 lg:hidden"
        >

          {isOpen ? <X size={23} /> : <Menu size={23} />}

        </button>

      </nav>

      {/* Mobile Menu */}
      {isOpen && (

        <div
          id="mobile-navigation"
          className="border-t border-slate-200 bg-white p-5 lg:hidden"
        >

          {navLinks.map((link) => (
            <Link
              key={link.name}
              href={link.href}
              onClick={closeMenu}
              className="block rounded-xl px-4 py-3 font-medium text-slate-700 hover:bg-emerald-50"
            >
              {link.name}
            </Link>
          ))}

          <div className="mt-4 border-t border-slate-100 pt-4">

            {status === "loading" ? (

              <LoaderCircle
                size={23}
                className="mx-auto animate-spin text-emerald-700"
              />

            ) : isAuthenticated ? (

              <>

                <p className="mb-3 truncate text-sm font-semibold text-slate-600">
                  {user?.name}
                </p>

                <Link
                  href="/dashboard/"
                  onClick={closeMenu}
                  className="flex items-center justify-center gap-3 rounded-xl bg-emerald-700 p-4 font-bold text-white"
                >
                  <LayoutDashboard size={19} />
                  Dashboard
                </Link>

              </>

            ) : (

              <div className="grid grid-cols-2 gap-3">

                <Link
                  href="/login/"
                  onClick={closeMenu}
                  className="flex items-center justify-center gap-2 rounded-xl border border-slate-200 p-3 text-sm font-bold"
                >
                  <LogIn size={17} />
                  Sign In
                </Link>

                <Link
                  href="/register/"
                  onClick={closeMenu}
                  className="flex items-center justify-center gap-2 rounded-xl bg-emerald-700 p-3 text-sm font-bold text-white"
                >
                  Get Started
                  <ArrowRight size={17} />
                </Link>

              </div>

            )}

          </div>

        </div>

      )}

    </header>
  );
}