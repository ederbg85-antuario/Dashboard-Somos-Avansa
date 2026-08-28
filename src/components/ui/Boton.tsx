import Link from "next/link";
import type { ComponentProps, ReactNode } from "react";

type Tono = "coral" | "oscuro" | "claro" | "fantasma" | "peligro";
type Tamano = "sm" | "md";

const TONOS: Record<Tono, string> = {
  coral:    "bg-coral text-white hover:bg-coral-700 shadow-tarjeta",
  oscuro:   "bg-deep text-white hover:bg-deep-700 shadow-tarjeta",
  claro:    "bg-white text-ink shadow-tarjeta hover:bg-mist hover:shadow-elevada",
  fantasma: "text-slate hover:bg-mist hover:text-ink",
  peligro:  "bg-white text-coral shadow-tarjeta hover:bg-coral-50 hover:shadow-elevada",
};

const TAMANOS: Record<Tamano, string> = {
  sm: "h-8 gap-1.5 px-3 text-[0.78rem]",
  md: "h-10 gap-2 px-4 text-[0.85rem]",
};

const base =
  "inline-flex items-center justify-center rounded-xl font-semibold transition " +
  "disabled:cursor-not-allowed disabled:opacity-50";

export function Boton({
  tono = "coral", tamano = "md", className = "", ...props
}: ComponentProps<"button"> & { tono?: Tono; tamano?: Tamano }) {
  return (
    <button
      {...props}
      className={`${base} ${TAMANOS[tamano]} ${TONOS[tono]} ${className}`}
    />
  );
}

export function BotonEnlace({
  tono = "claro", tamano = "md", className = "", children, ...props
}: ComponentProps<typeof Link> & { tono?: Tono; tamano?: Tamano; children: ReactNode }) {
  return (
    <Link {...props} className={`${base} ${TAMANOS[tamano]} ${TONOS[tono]} ${className}`}>
      {children}
    </Link>
  );
}
