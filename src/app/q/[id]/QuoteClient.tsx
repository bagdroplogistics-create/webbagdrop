"use client";
import { useParams } from "next/navigation";
import QuotePay from "./QuotePay";

export default function QuoteClient() {
  const { id } = useParams<{ id: string }>();
  if (!id) return null;
  return <QuotePay id={decodeURIComponent(id).toUpperCase()} />;
}
