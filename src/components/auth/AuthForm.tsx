"use client";

import { useState, type FormEvent } from "react";
import Link from "next/link";
import {
  Mail,
  UserRound,
  ArrowRight,
  ShieldCheck,
  CheckCircle2,
  Circle,
  AlertCircle,
  Info,
} from "lucide-react";

import PasswordInput from "./PasswordInput";

interface AuthFormProps {
  mode: "login" | "register";
}

export default function AuthForm({ mode }: AuthFormProps) {

  const isRegister = mode === "register";

  const [name, setName] = useState("");
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [confirmPassword, setConfirmPassword] = useState("");

  const [error, setError] = useState("");
  const [message, setMessage] = useState("");

  // Basic Password Strength Indicators
  const passwordChecks = [
    {
      label: "At least 12 characters",
      passed: password.length >= 12,
    },
    {
      label: "Uppercase and lowercase letters",
      passed: /[A-Z]/.test(password) && /[a-z]/.test(password),
    },
    {
      label: "At least one number",
      passed: /[0-9]/.test(password),
    },
    {
      label: "At least one special character",
      passed: /[^A-Za-z0-9\s]/.test(password),
    },
  ];

  const strength = passwordChecks.filter(
    (check) => check.passed
  ).length;

  const strengthLabels = [
    "Very weak",
    "Weak",
    "Fair",
    "Good",
    "Strong pattern",
  ];

  const strengthColors = [
    "bg-red-500",
    "bg-orange-500",
    "bg-yellow-500",
    "bg-emerald-400",
    "bg-emerald-600",
  ];

  function clearFeedback() {
    setError("");
    setMessage("");
  }

  function handleSubmit(event: FormEvent<HTMLFormElement>) {

    event.preventDefault();

    clearFeedback();

    if (isRegister && name.trim().length < 2) {
      setError("Please enter your full name.");
      return;
    }

    if (!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email.trim())) {
      setError("Please enter a valid email address.");
      return;
    }

    if (!password) {
      setError("Please enter your password.");
      return;
    }

    if (isRegister && password.length < 12) {
      setError("Password must contain at least 12 characters.");
      return;
    }

    if (isRegister && password !== confirmPassword) {
      setError("Passwords do not match.");
      return;
    }

    // Backend integration will be implemented in the next phase.
    setMessage(
      "Form validation passed. Authentication will be available after backend integration. No account or session has been created."
    );

    setPassword("");
    setConfirmPassword("");
  }

  return (
    <div>

      {/* Heading */}
      <div className="mb-8">

        <div className="mb-5 inline-flex rounded-2xl bg-emerald-50 p-4 text-emerald-700">
          <ShieldCheck size={30} />
        </div>

        <h2 className="text-4xl font-extrabold tracking-tight text-slate-900">
          {isRegister ? "Create your account" : "Welcome back"}
        </h2>

        <p className="mt-3 leading-7 text-slate-500">
          {isRegister
            ? "Start your journey towards smarter address resolution."
            : "Sign in to access your ThikanaHub workspace."}
        </p>

      </div>

      {/* Authentication Form */}
      <form
        onSubmit={handleSubmit}
        onChange={clearFeedback}
        method="post"
        className="space-y-5"
      >

        {/* Name Field */}
        {isRegister && (
          <div className="space-y-2">

            <label
              htmlFor="fullName"
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
                id="fullName"
                name="fullName"
                type="text"
                value={name}
                onChange={(event) => setName(event.target.value)}
                placeholder="Enter your full name"
                autoComplete="name"
                minLength={2}
                maxLength={100}
                required
                className="h-14 w-full rounded-xl border border-slate-200 bg-slate-50 pl-12 pr-4 text-sm outline-none transition focus:border-emerald-500 focus:bg-white focus:ring-4 focus:ring-emerald-500/10"
              />

            </div>

          </div>
        )}

        {/* Email Field */}
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
              name="email"
              type="email"
              value={email}
              onChange={(event) => setEmail(event.target.value)}
              placeholder="example@email.com"
              autoComplete="email"
              maxLength={254}
              required
              className="h-14 w-full rounded-xl border border-slate-200 bg-slate-50 pl-12 pr-4 text-sm outline-none transition focus:border-emerald-500 focus:bg-white focus:ring-4 focus:ring-emerald-500/10"
            />

          </div>

        </div>

        {/* Password */}
        <PasswordInput
          id="password"
          label="Password"
          value={password}
          onChange={setPassword}
          minLength={isRegister ? 12 : undefined}
          autoComplete={
            isRegister ? "new-password" : "current-password"
          }
        />

        {/* Password Strength */}
        {isRegister && password.length > 0 && (
          <div className="rounded-xl border border-slate-200 bg-slate-50 p-4">

            <div className="mb-3 flex items-center justify-between">

              <span className="text-xs font-semibold text-slate-600">
                Password strength estimate
              </span>

              <span className="text-xs font-bold text-slate-700">
                {strengthLabels[strength]}
              </span>

            </div>

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

                  {check.passed ? (
                    <CheckCircle2 size={15} />
                  ) : (
                    <Circle size={15} />
                  )}

                  {check.label}

                </div>
              ))}

            </div>

            <p className="mt-3 text-xs leading-5 text-slate-500">
              Use a long, unique password or passphrase.
              These indicators are guidelines, not a security guarantee.
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

            {confirmPassword.length > 0 && (
              <p
                className={`flex items-center gap-2 text-xs font-medium ${
                  password === confirmPassword
                    ? "text-emerald-700"
                    : "text-red-600"
                }`}
              >
                {password === confirmPassword ? (
                  <>
                    <CheckCircle2 size={15} />
                    Passwords match
                  </>
                ) : (
                  <>
                    <AlertCircle size={15} />
                    Passwords do not match
                  </>
                )}
              </p>
            )}
          </>
        )}

        {/* Account Type Information */}
        {isRegister && (
          <div className="flex gap-3 rounded-xl border border-emerald-200 bg-emerald-50 p-4">

            <ShieldCheck
              size={20}
              className="shrink-0 text-emerald-700"
            />

            <div>
              <p className="text-sm font-semibold text-emerald-800">
                Merchant Account
              </p>

              <p className="mt-1 text-xs leading-5 text-emerald-700">
                Public registration is intended for merchants.
                Privileged roles require authorized approval.
              </p>
            </div>

          </div>
        )}

        {/* Error Message */}
        {error && (
          <div
            role="alert"
            className="flex items-start gap-3 rounded-xl border border-red-200 bg-red-50 p-4 text-sm text-red-700"
          >
            <AlertCircle size={19} className="shrink-0" />
            {error}
          </div>
        )}

        {/* Information Message */}
        {message && (
          <div
            role="status"
            className="flex items-start gap-3 rounded-xl border border-blue-200 bg-blue-50 p-4 text-sm leading-6 text-blue-700"
          >
            <Info size={19} className="shrink-0" />
            {message}
          </div>
        )}

        {/* Submit Button */}
        <button
          type="submit"
          className="group flex h-14 w-full items-center justify-center gap-3 rounded-xl bg-emerald-700 font-bold text-white shadow-lg shadow-emerald-700/20 transition hover:bg-emerald-800"
        >
          {isRegister ? "Create Account" : "Sign In"}

          <ArrowRight
            size={20}
            className="transition-transform group-hover:translate-x-1"
          />
        </button>

      </form>

      {/* Page Switching */}
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

      {/* Development Notice */}
      <div className="mt-8 flex items-start justify-center gap-2 border-t border-slate-100 pt-6 text-xs text-slate-400">

        <Info size={15} className="shrink-0" />

        Authentication preview. Use test credentials only.

      </div>

    </div>
  );
}