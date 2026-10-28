import { Metadata } from "next";
import { Suspense } from "react";
import { FdrControlRoom } from "./FdrControlRoom";
import { LoadingState } from "@/components/ui/LoadingState";
import { ToastProvider } from "@/components/ui/Toast";
import { getCommandCenterData } from "@/lib/fdr/service";

export const metadata: Metadata = {
  title: "Control Room | FDR Guardian AI",
  description: "Regulatory Operations Console for Security Deposit & FDR Intelligence (SIH26265)",
};

export default async function FdrPage({
  searchParams,
}: {
  searchParams: Promise<{ [key: string]: string | string[] | undefined }>;
}) {
  const resolvedParams = await searchParams;
  const institutionId =
    typeof resolvedParams.institutionId === "string" ? resolvedParams.institutionId : undefined;

  const initialData = await getCommandCenterData(institutionId);

  return (
    <Suspense fallback={<LoadingState message="Connecting to FDR Guardian Control Room..." />}>
      <ToastProvider>
        <FdrControlRoom initialData={initialData} />
      </ToastProvider>
    </Suspense>
  );
}
