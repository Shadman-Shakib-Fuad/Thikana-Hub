import Image from "next/image";
import Link from "next/link";

type BrandLogoProps = {
  variant?: "icon" | "full";
  href?: string;
  className?: string;
  priority?: boolean;
  decorative?: boolean;
};

export default function BrandLogo({
  variant = "full",
  href,
  className = "",
  priority = false,
  decorative = false,
}: BrandLogoProps) {
  const isIcon = variant === "icon";
  const logo = (
    <Image
      src={isIcon ? "/branding/thikanahub-icon.png" : "/branding/thikanahub-logo.png"}
      alt={decorative ? "" : "ThikanaHub"}
      width={isIcon ? 1024 : 1200}
      height={isIcon ? 1024 : 400}
      priority={priority}
      unoptimized
      className={"shrink-0 object-contain " + (isIcon ? "h-10 w-10 " : "h-12 w-auto max-w-full ") + className}
    />
  );
  return href ? (
    <Link href={href} aria-label="ThikanaHub" className="inline-flex shrink-0 items-center">
      {logo}
    </Link>
  ) : logo;
}
