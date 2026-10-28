export interface NavItem {
  id: string;
  name: string;
  href: string;
  badge?: string;
  badgeVariant?: "teal" | "amber" | "rose" | "neutral";
  section: "operations" | "compliance" | "governance";
  description: string;
  phase: "active" | "phase2" | "phase3" | "phase4";
}

export const FDR_NAVIGATION_ITEMS: NavItem[] = [
  // Core Operations
  {
    id: "command-center",
    name: "Command Center",
    href: "/fdr",
    badge: "Live",
    badgeVariant: "teal",
    section: "operations",
    description: "Operational control overview, high-level portfolio metrics and pending queues",
    phase: "active",
  },
  {
    id: "fdr-register",
    name: "FDR Register",
    href: "/fdr?tab=register",
    badge: "Active",
    badgeVariant: "neutral",
    section: "operations",
    description: "Master ledger of all institutional fixed deposit receipts, bank liens, and principal sums",
    phase: "active",
  },
  {
    id: "forensic-workbench",
    name: "Forensic Workbench",
    href: "/fdr?tab=workbench",
    badge: "Live AI",
    badgeVariant: "teal",
    section: "operations",
    description: "Multi-source evidence comparison, forensic finding resolution, and audit review workspace",
    phase: "active",
  },
  {
    id: "document-intelligence",
    name: "Document Intelligence",
    href: "/fdr?tab=documents",
    badge: "OCR",
    badgeVariant: "teal",
    section: "operations",
    description: "Bank confirmation letters, tripartite agreements, and scanned receipt verification",
    phase: "active",
  },
  {
    id: "maturity-radar",
    name: "Maturity Radar",
    href: "/fdr?tab=maturity",
    badge: "14 Due",
    badgeVariant: "amber",
    section: "operations",
    description: "Early-warning tracking for 30/60/90-day expiry horizons and statutory lock-ins",
    phase: "active",
  },
  {
    id: "lifecycle-explorer",
    name: "Lifecycle Explorer",
    href: "/fdr?tab=lifecycle",
    section: "operations",
    description: "End-to-end timeline tracing from issuance, verification, tenure progression to encashment",
    phase: "active",
  },

  // Compliance & Action Queues
  {
    id: "renewal-replacement",
    name: "Renewal & Replacement",
    href: "/fdr?tab=renewals",
    badge: "5 Pending",
    badgeVariant: "amber",
    section: "compliance",
    description: "Tenure extensions, replacement certificates, and revised interest compounding terms",
    phase: "active",
  },
  {
    id: "release-requests",
    name: "Release Requests",
    href: "/fdr?tab=releases",
    badge: "2 Review",
    badgeVariant: "teal",
    section: "compliance",
    description: "Institutional security deposit refund dossiers post statutory lock-in clearance",
    phase: "active",
  },
  {
    id: "alerts-escalations",
    name: "Alerts & Escalations",
    href: "/fdr?tab=alerts",
    badge: "3 Critical",
    badgeVariant: "rose",
    section: "compliance",
    description: "Overdue renewals, broken lien markers, deficient sums, and non-compliance citations",
    phase: "active",
  },
  {
    id: "reports-statements",
    name: "Reports & Statements",
    href: "/fdr?tab=reports",
    section: "compliance",
    description: "Statutory statements, bank reconciliation digests, and official clearance certificates",
    phase: "active",
  },

  // Governance & Trust
  {
    id: "trust-guard",
    name: "FDR Trust Guard",
    href: "/fdr?tab=trust-guard",
    badge: "Audit AI",
    badgeVariant: "teal",
    section: "governance",
    description: "Bank branch verification, IFSC validation, lien confirmation checks and duplicate detection",
    phase: "active",
  },
  {
    id: "audit-explorer",
    name: "Audit Explorer",
    href: "/fdr?tab=audit",
    section: "governance",
    description: "Immutable cryptographically signed audit log of all officer decisions and status transitions",
    phase: "active",
  },
  {
    id: "user-role-admin",
    name: "User & Role Admin",
    href: "/fdr?tab=users",
    section: "governance",
    description: "Regulatory officer role authorizations, digital signature delegations and access controls",
    phase: "active",
  },
];
