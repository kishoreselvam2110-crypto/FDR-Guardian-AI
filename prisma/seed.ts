import { PrismaClient } from "@prisma/client";

const prisma = new PrismaClient();

async function main() {
  console.log("🌱 Starting FDR Guardian database seed...");

  // 1. Create System Admin & Officer Users
  const officerUser = await prisma.user.upsert({
    where: { email: "officer@regulatory.gov.in" },
    update: {},
    create: {
      email: "officer@regulatory.gov.in",
      password_hash: "argon2id$mock_hash_for_officer_demo_only",
      role: "scrutiny_officer",
    },
  });

  const applicantUser = await prisma.user.upsert({
    where: { email: "trustee@vidya.edu.in" },
    update: {},
    create: {
      email: "trustee@vidya.edu.in",
      password_hash: "argon2id$mock_hash_for_applicant_demo_only",
      role: "applicant",
    },
  });

  // 2. Create Institutions
  const apexInst = await prisma.institution.upsert({
    where: { id: "inst-synth-001" },
    update: {},
    create: {
      id: "inst-synth-001",
      userId: applicantUser.id,
      name: "Apex Institute of Technology [Synthetic]",
      trustName: "Vidya Educational Trust [Synthetic]",
      landAreaAcres: 12.5,
    },
  });

  const bharatInst = await prisma.institution.upsert({
    where: { id: "inst-synth-002" },
    update: {},
    create: {
      id: "inst-synth-002",
      userId: applicantUser.id,
      name: "Bharat College of Research [Synthetic]",
      trustName: "Bharat Rural Education Society [Synthetic]",
      landAreaAcres: 6.8,
    },
  });

  // 3. Seed FDR Instruments
  const now = new Date();
  const fdr1Mat = new Date(now);
  fdr1Mat.setDate(now.getDate() + 14); // Maturing in 14 days

  const fdr1Issue = new Date(now);
  fdr1Issue.setDate(now.getDate() - (365 * 5 - 14));

  const fdr1 = await prisma.fdrInstrument.upsert({
    where: { fdrNumber: "FDR-2021-SBI-88210" },
    update: {},
    create: {
      id: "fdr-synth-101",
      institutionId: apexInst.id,
      fdrNumber: "FDR-2021-SBI-88210",
      bankName: "State Bank of India",
      branchName: "Industrial Finance Branch, Bengaluru",
      ifscCode: "SBIN0004132",
      amount: 3500000.0,
      issueDate: fdr1Issue,
      maturityDate: fdr1Mat,
      tenureMonths: 60,
      interestRate: 7.1,
      jointHolderName: "Regional Officer (AICTE / State Board)",
      isLienMarked: true,
      lienConfirmedAt: fdr1Issue,
      verificationState: "VERIFIED",
      administrativeState: "PLEDGED_ACTIVE",
      renewalState: "RENEWAL_REQUESTED",
    },
  });

  // Seed Document & Extraction
  const doc1 = await prisma.fdrDocument.create({
    data: {
      fdrId: fdr1.id,
      documentType: "FDR_CERTIFICATE_SCAN",
      fileName: "SBI_FDR_88210_Original_Scan.pdf",
      fileUrl: "/documents/sbi-fdr-88210.pdf",
      fileSizeBytes: 1420500,
      mimeType: "application/pdf",
      isVerified: true,
      verifiedAt: now,
      extractions: {
        create: {
          extractedFdrNumber: "FDR-2021-SBI-88210",
          extractedAmount: 3500000.0,
          extractedBankName: "State Bank of India",
          extractedIfsc: "SBIN0004132",
          extractedMaturityDate: fdr1Mat,
          confidenceScore: 0.98,
        },
      },
    },
  });

  // Seed Persistent Alert
  await prisma.fdrAlert.create({
    data: {
      fdrId: fdr1.id,
      institutionId: apexInst.id,
      alertType: "MATURITY_CRITICAL_30D",
      severity: "CRITICAL",
      title: "Maturity Breach In 14 Days",
      description: "Fixed Deposit Receipt enters critical 14-day expiry horizon. Renewal or replacement certificate required.",
      isResolved: false,
    },
  });

  // Seed Audit Log
  await prisma.fdrAuditLog.create({
    data: {
      fdrId: fdr1.id,
      institutionId: apexInst.id,
      actorId: officerUser.id,
      actorName: "Dr. R. Ramanathan",
      actorRole: "Regulatory Scrutiny Officer",
      action: "FDR_RECORD_INITIALIZED",
      entityType: "FDR_INSTRUMENT",
      entityId: fdr1.id,
      detailsJson: JSON.stringify({ fdrNumber: fdr1.fdrNumber, amount: 3500000 }),
    },
  });

  console.log("✅ FDR Guardian seed completed successfully.");
}

main()
  .catch((e) => {
    console.error("❌ Seed error:", e);
    process.exit(1);
  })
  .finally(async () => {
    await prisma.$disconnect();
  });
