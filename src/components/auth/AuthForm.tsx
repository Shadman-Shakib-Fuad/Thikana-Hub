"use client";

import { useState, type FormEvent } from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";

import {
  Mail,
  UserRound,
  ArrowRight,
  ShieldCheck,
  CheckCircle2,
  Circle,
  AlertCircle,
  LoaderCircle,
} from "lucide-react";

import { useAuth } from "@/context/AuthContext";
import PasswordInput from "./PasswordInput";

interface AuthFormProps {
  mode: "login" | "register";
}

export default function AuthForm({
  mode,
}: AuthFormProps) {

  const router = useRouter();

  const {
    login,
    register,
    status,
    isAuthenticated,
  } = useAuth();

  const isRegister = mode === "register";

  const [name, setName] = useState("");
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");

  const [confirmPassword, setConfirmPassword] =
    useState("");

  const [error, setError] = useState("");
  const [registered, setRegistered] = useState(false);
  const [loading, setLoading] = useState(false);

  const passwordChecks = [
    {
      label: "At least 15 characters",
      passed: password.length >= 15,
    },
    {
      label: "Uppercase and lowercase letters",
      passed: /[A-Z]/.test(password) && /[a-z]/.test(password),
    },
    {
      label: "Includes a number",
      passed: /[0-9]/.test(password),
    },
    {
      label: "Includes a special character",
      passed: /[^A-Za-z0-9\s]/.test(password),
    },
  ];

  const strength = passwordChecks.filter(
    (check) => check.passed
  ).length;

  const strengthColors = [
    "bg-slate-200",
    "bg-red-500",
    "bg-orange-500",
    "bg-yellow-500",
    "bg-emerald-600",
  ];

  const inputClass =
    "h-14 w-full rounded-xl border border-slate-200 bg-slate-50 pl-12 pr-4 text-sm text-slate-900 outline-none transition focus:border-emerald-500 focus:bg-white focus:ring-4 focus:ring-emerald-500/10";

  async function handleSubmit(
    event: FormEvent<HTMLFormElement>
  ) {

    event.preventDefault();

    if (loading || status === "loading") return;

    setError("");

    if (isRegister && name.trim().length < 2) {
      setError("Please enter your full name.");
      return;
    }

    if (!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email.trim())) {
      setError("Please enter a valid email address.");
      return;
    }

    if (isRegister && password.length < 15) {
      setError("Password must contain at least 15 characters.");
      return;
    }

    if (isRegister && password !== confirmPassword) {
      setError("Passwords do not match.");
      return;
    }

    setLoading(true);

    try {

      if (isRegister) {

        await register({
          name: name.trim(),
          email: email.trim(),
          password,
        });

        setPassword("");
        setConfirmPassword("");
        setRegistered(true);

      } else {

        await login({
          email: email.trim(),
          password,
        });

        setPassword("");

        router.replace("/dashboard/");

      }

    } catch (error) {

      setError(
        error instanceof Error
          ? error.message
          : "Something went wrong. Please try again."
      );

    } finally {

      setLoading(false);

    }
  }

  // Already signed in
  if (isAuthenticated) {
    return (
      <div className="space-y-6 text-center">

        <CheckCircle2
          size={56}
          className="mx-auto text-emerald-700"
        />

        <h2 className="text-3xl font-extrabold text-slate-900">
          You are already signed in
        </h2>

        <Link
          href="/dashboard/"
          className="flex items-center justify-center gap-2 rounded-xl bg-emerald-700 p-4 font-bold text-white"
        >
          Open Dashboard
          <ArrowRight size={19} />
        </Link>

      </div>
    );
  }

  // Registration success
  if (registered) {
    return (
      <div className="space-y-5 text-center">

        <div className="mx-auto flex h-20 w-20 items-center justify-center rounded-full bg-emerald-100 text-emerald-700">

          <CheckCircle2 size={42} />

        </div>

        <h2 className="text-3xl font-extrabold text-slate-900">
          Account Created!
        </h2>

        <p className="leading-7 text-slate-500">
          Your ThikanaHub merchant account has been
          successfully created. Sign in to continue.
        </p>

        <Link
          href="/login/"
          className="flex items-center justify-center gap-3 rounded-xl bg-emerald-700 p-4 font-bold text-white transition hover:bg-emerald-800"
        >
          Continue to Sign In
          <ArrowRight size={19} />
        </Link>

      </div>
    );
  }

  return (
    <div>

      {/* Heading */}
      <div className="mb-8">

        <div className="mb-5 inline-flex rounded-2xl bg-emerald-50 p-4 text-emerald-700">
          <ShieldCheck size={30} />
        </div>

        <h2 className="text-4xl font-extrabold tracking-tight text-slate-900">
          {isRegister
            ? "Create your account"
            : "Welcome back"}
        </h2>

        <p className="mt-3 leading-7 text-slate-500">
          {isRegister
            ? "Start your journey towards smarter address resolution."
            : "Sign in to access your ThikanaHub workspace."}
        </p>

      </div>

      <form
        method="post"
        onSubmit={handleSubmit}
        onChange={() => setError("")}
      >

        <fieldset
          disabled={loading || status === "loading"}
          className="space-y-5 disabled:opacity-70"
        >

          {/* Full Name */}
          {isRegister && (
            <div className="space-y-2">

              <label
                htmlFor="name"
                className="text-sm font-semibold text-slate-700"
              >
                Full Name
              </label>

              <div className="relative">

                <UserRound
                  size={19}
                  className="absolute left-4 top-1/2 -translate-y-1/2 text-slate-400"
                />

                <input
                  id="name"
                  type="text"
                  value={name}
                  onChange={(e) => setName(e.target.value)}
                  placeholder="Enter your full name"
                  autoComplete="name"
                  minLength={2}
                  maxLength={100}
                  required
                  className={inputClass}
                />

              </div>

            </div>
          )}

          {/* Email */}
          <div className="space-y-2">

            <label
              htmlFor="email"
              className="text-sm font-semibold text-slate-700"
            >
              Email Address
            </label>

            <div className="relative">

              <Mail
                size={19}
                className="absolute left-4 top-1/2 -translate-y-1/2 text-slate-400"
              />

              <input
                id="email"
                type="email"
                value={email}
                onChange={(e) => setEmail(e.target.value)}
                placeholder="example@email.com"
                autoComplete="email"
                maxLength={254}
                required
                className={inputClass}
              />

            </div>

          </div>

          {/* Password */}
          <PasswordInput
            id="password"
            label="Password"
            value={password}
            onChange={setPassword}
            minLength={isRegister ? 15 : undefined}
            autoComplete={
              isRegister ? "new-password" : "current-password"
            }
          />

          {/* Password Strength */}
          {isRegister && password.length > 0 && (
            <div className="rounded-xl border border-slate-200 bg-slate-50 p-4">

              <p className="mb-3 text-xs font-bold text-slate-600">
                Password guidelines
              </p>

              <div className="flex gap-1.5">

                {[1, 2, 3, 4].map((level) => (
                  <div
                    key={level}
                    className={`h-1.5 flex-1 rounded-full transition-colors ${
                      strength >= level
                        ? strengthColors[strength]
                        : "bg-slate-200"
                    }`}
                  />
                ))}

              </div>

              <div className="mt-4 space-y-2">

                {passwordChecks.map((check) => (
                  <div
                    key={check.label}
                    className={`flex items-center gap-2 text-xs ${
                      check.passed
                        ? "text-emerald-700"
                        : "text-slate-500"
                    }`}
                  >

                    {check.passed
                      ? <CheckCircle2 size={15} />
                      : <Circle size={15} />}

                    {check.label}

                  </div>
                ))}

              </div>

              <p className="mt-3 text-xs leading-5 text-slate-500">
                Use a long, unique password or passphrase.
              </p>

            </div>
          )}

          {/* Confirm Password */}
          {isRegister && (
            <>

              <PasswordInput
                id="confirmPassword"
                label="Confirm Password"
                value={confirmPassword}
                onChange={setConfirmPassword}
                placeholder="Re-enter your password"
                autoComplete="new-password"
              />

              {confirmPassword && (
                <p className={`text-xs font-semibold ${
                  password === confirmPassword
                    ? "text-emerald-700"
                    : "text-red-600"
                }`}>
                  {password === confirmPassword
                    ? "Passwords match"
                    : "Passwords do not match"}
                </p>
              )}

              <div className="flex gap-3 rounded-xl border border-emerald-200 bg-emerald-50 p-4">

                <ShieldCheck
                  size={20}
                  className="shrink-0 text-emerald-700"
                />

                <div>

                  <p className="text-sm font-bold text-emerald-800">
                    Merchant Account
                  </p>

                  <p className="mt-1 text-xs leading-5 text-emerald-700">
                    Privileged roles require authorized approval.
                  </p>

                </div>

              </div>

            </>
          )}

          {/* API Error */}
          {error && (
            <div
              role="alert"
              className="flex items-start gap-3 rounded-xl border border-red-200 bg-red-50 p-4 text-sm text-red-700"
            >
              <AlertCircle size={19} className="shrink-0" />
              {error}
            </div>
          )}

          {/* Submit */}
          <button
            type="submit"
            disabled={loading || status === "loading"}
            className="flex h-14 w-full items-center justify-center gap-3 rounded-xl bg-emerald-700 font-bold text-white shadow-lg shadow-emerald-700/20 transition hover:bg-emerald-800 disabled:cursor-not-allowed disabled:opacity-70"
          >

            {loading || status === "loading" ? (
              <>
                <LoaderCircle
                  size={21}
                  className="animate-spin"
                />

                {status === "loading"
                  ? "Checking session..."
                  : "Please wait..."}
              </>
            ) : (
              <>
                {isRegister
                  ? "Create Account"
                  : "Sign In"}

                <ArrowRight size={20} />
              </>
            )}

          </button>

        </fieldset>

      </form>

      {/* Login / Registration Switch */}
      <p className="mt-7 text-center text-sm text-slate-500">

        {isRegister
          ? "Already have an account?"
          : "Don't have an account?"}{" "}

        <Link
          href={isRegister ? "/login/" : "/register/"}
          className="font-bold text-emerald-700 hover:underline"
        >
          {isRegister ? "Sign In" : "Create Account"}
        </Link>

      </p>

    </div>
  );
}