"use client";

import React, { useState, useTransition, useMemo } from "react";
import {
  updateApplicationScrutiny,
  ScrutinyInspectionPayload,
} from "./actions";
import {
  calculateFacultyStudentRatio,
  validateBuiltUpArea,
  Facility,
} from "@/lib/compliance";

export interface DashboardFacility extends Facility {
  id: string;
}

export interface DashboardFaculty {
  id: string;
  panNumber: string;
  fullName: string;
  cadre: string;
  qualification: string;
}

export interface DashboardInstitution {
  id: string;
  name: string;
  trustName: string;
  landAreaAcres: number;
  contactEmail: string;
  category: string;
  totalIntake: number;
  facilities: DashboardFacility[];
  faculties: DashboardFaculty[];
}

export interface DashboardApplication {
  id: string;
  institutionId: string;
  currentStatus: "submitted" | "under_scrutiny" | "verified" | "deficient";
  terChargesPaid: boolean;
  submissionDate: string;
  institution: DashboardInstitution;
  inspectionNotes?: {
    profile: { status: "verified" | "deficient" | "pending"; remarks: string };
    infrastructure: { status: "verified" | "deficient" | "pending"; remarks: string };
    facultyFSR: { status: "verified" | "deficient" | "pending"; remarks: string };
    terCharges: { status: "verified" | "deficient" | "pending"; remarks: string };
    overallRemarks: string;
  };
}

const SEED_APPLICATIONS: DashboardApplication[] = [
  {
    id: "app-2026-001",
    institutionId: "inst-001",
    currentStatus: "submitted",
    terChargesPaid: true,
    submissionDate: "2026-10-25T14:30:00Z",
    institution: {
      id: "inst-001",
      name: "Apex Institute of Science & Technology",
      trustName: "Shri Vidya Educational Trust",
      landAreaAcres: 12.5,
      contactEmail: "admin@apexinstitute.edu.in",
      category: "Engineering & Technology",
      totalIntake: 240,
      facilities: [
        { id: "f-1", roomType: "Classroom", areaSqM: 200, seatingCapacity: 60, isBarrierFree: true },
        { id: "f-2", roomType: "Classroom", areaSqM: 200, seatingCapacity: 60, isBarrierFree: true },
        { id: "f-3", roomType: "Laboratory", areaSqM: 250, seatingCapacity: 35, isBarrierFree: true },
        { id: "f-4", roomType: "Seminar Hall", areaSqM: 180, seatingCapacity: 150, isBarrierFree: false },
        { id: "f-5", roomType: "Admin Office", areaSqM: 90, seatingCapacity: 15, isBarrierFree: true },
        { id: "f-6", roomType: "Faculty Room", areaSqM: 140, seatingCapacity: 25, isBarrierFree: true },
      ],
      faculties: [
        { id: "fm-1", panNumber: "ABCDE1234F", fullName: "Dr. R. Ramanathan", cadre: "Professor", qualification: "Ph.D" },
        { id: "fm-2", panNumber: "BCDEF2345G", fullName: "Dr. S. Kulkarni", cadre: "Professor", qualification: "Ph.D" },
        { id: "fm-3", panNumber: "CDEFG3456H", fullName: "A. Sengupta", cadre: "Associate Professor", qualification: "M.Tech" },
        { id: "fm-4", panNumber: "DEFGH4567J", fullName: "M. Jayaraman", cadre: "Associate Professor", qualification: "Ph.D" },
        { id: "fm-5", panNumber: "EFGHI5678K", fullName: "P. Deshmukh", cadre: "Assistant Professor", qualification: "M.Tech" },
        { id: "fm-6", panNumber: "FGHIJ6789L", fullName: "V. Sharma", cadre: "Assistant Professor", qualification: "M.Tech" },
        { id: "fm-7", panNumber: "GHIJK7890M", fullName: "K. Narayanan", cadre: "Assistant Professor", qualification: "M.Tech" },
        { id: "fm-8", panNumber: "HIJKL8901N", fullName: "R. Agarwal", cadre: "Assistant Professor", qualification: "M.Tech" },
        { id: "fm-9", panNumber: "IJKLM9012P", fullName: "N. Banerjee", cadre: "Assistant Professor", qualification: "M.Tech" },
        { id: "fm-10", panNumber: "JKLMN0123Q", fullName: "T. Swaminathan", cadre: "Assistant Professor", qualification: "M.Tech" },
        { id: "fm-11", panNumber: "KLMNO1234R", fullName: "H. Patel", cadre: "Assistant Professor", qualification: "M.Tech" },
        { id: "fm-12", panNumber: "LMNOP2345S", fullName: "S. Venkatesh", cadre: "Assistant Professor", qualification: "Ph.D" },
      ],
    },
    inspectionNotes: {
      profile: { status: "pending", remarks: "" },
      infrastructure: { status: "pending", remarks: "" },
      facultyFSR: { status: "pending", remarks: "" },
      terCharges: { status: "verified", remarks: "Receipt verified through payment gateway." },
      overallRemarks: "",
    },
  },
  {
    id: "app-2026-002",
    institutionId: "inst-002",
    currentStatus: "under_scrutiny",
    terChargesPaid: true,
    submissionDate: "2026-10-24T10:15:00Z",
    institution: {
      id: "inst-002",
      name: "Bharat College of Engineering & Research",
      trustName: "Bharat Rural Education Society",
      landAreaAcres: 6.8,
      contactEmail: "principal@bharatcollege.ac.in",
      category: "Engineering & Technology",
      totalIntake: 300,
      facilities: [
        { id: "f-21", roomType: "Classroom", areaSqM: 180, seatingCapacity: 60, isBarrierFree: true },
        { id: "f-22", roomType: "Classroom", areaSqM: 180, seatingCapacity: 60, isBarrierFree: true },
        { id: "f-23", roomType: "Laboratory", areaSqM: 200, seatingCapacity: 30, isBarrierFree: false },
        { id: "f-24", roomType: "Admin Office", areaSqM: 80, seatingCapacity: 10, isBarrierFree: true },
        { id: "f-25", roomType: "Faculty Room", areaSqM: 90, seatingCapacity: 15, isBarrierFree: true },
      ],
      faculties: [
        { id: "fm-21", panNumber: "MNPQR1234A", fullName: "Dr. K. Joshi", cadre: "Professor", qualification: "Ph.D" },
        { id: "fm-22", panNumber: "NPQRS2345B", fullName: "S. Rao", cadre: "Assistant Professor", qualification: "M.Tech" },
        { id: "fm-23", panNumber: "PQRST3456C", fullName: "A. Verma", cadre: "Assistant Professor", qualification: "M.Tech" },
        { id: "fm-24", panNumber: "QRSTU4567D", fullName: "D. Roy", cadre: "Assistant Professor", qualification: "M.Tech" },
        { id: "fm-25", panNumber: "RSTUV5678E", fullName: "N. Gupta", cadre: "Assistant Professor", qualification: "M.Tech" },
      ],
    },
    inspectionNotes: {
      profile: { status: "verified", remarks: "Land title and revenue deed verified." },
      infrastructure: { status: "deficient", remarks: "Total built-up area is 730 sq.m, below the 1000 sq.m threshold." },
      facultyFSR: { status: "deficient", remarks: "5 faculty for 300 intake gives 1:60 ratio, severely violating 1:20 norm." },
      terCharges: { status: "verified", remarks: "Fee paid in full." },
      overallRemarks: "Application flagged with infrastructure and faculty deficiencies.",
    },
  },
  {
    id: "app-2026-003",
    institutionId: "inst-003",
    currentStatus: "verified",
    terChargesPaid: true,
    submissionDate: "2026-10-22T09:00:00Z",
    institution: {
      id: "inst-003",
      name: "National Academy of Technology",
      trustName: "National Foundation for Education",
      landAreaAcres: 15.0,
      contactEmail: "dean@nat.org.in",
      category: "Management & Tech",
      totalIntake: 180,
      facilities: [
        { id: "f-31", roomType: "Classroom", areaSqM: 250, seatingCapacity: 70, isBarrierFree: true },
        { id: "f-32", roomType: "Classroom", areaSqM: 250, seatingCapacity: 70, isBarrierFree: true },
        { id: "f-33", roomType: "Laboratory", areaSqM: 300, seatingCapacity: 45, isBarrierFree: true },
        { id: "f-34", roomType: "Seminar Hall", areaSqM: 220, seatingCapacity: 200, isBarrierFree: true },
        { id: "f-35", roomType: "Admin Office", areaSqM: 100, seatingCapacity: 20, isBarrierFree: true },
        { id: "f-36", roomType: "Faculty Room", areaSqM: 150, seatingCapacity: 30, isBarrierFree: true },
      ],
      faculties: [
        { id: "fm-31", panNumber: "STUVW1234F", fullName: "Dr. A. Mehra", cadre: "Professor", qualification: "Ph.D" },
        { id: "fm-32", panNumber: "TUVWX2345G", fullName: "Dr. G. Sundaram", cadre: "Professor", qualification: "Ph.D" },
        { id: "fm-33", panNumber: "UVWXY3456H", fullName: "R. Kapoor", cadre: "Associate Professor", qualification: "Ph.D" },
        { id: "fm-34", panNumber: "VWXYZ4567J", fullName: "V. Nair", cadre: "Assistant Professor", qualification: "M.Tech" },
        { id: "fm-35", panNumber: "WXYZA5678K", fullName: "T. Chawla", cadre: "Assistant Professor", qualification: "M.Tech" },
        { id: "fm-36", panNumber: "XYZAB6789L", fullName: "P. Mukherjee", cadre: "Assistant Professor", qualification: "M.Tech" },
        { id: "fm-37", panNumber: "YZABC7890M", fullName: "B. Pillai", cadre: "Assistant Professor", qualification: "M.Tech" },
        { id: "fm-38", panNumber: "ZABCD8901N", fullName: "M. Bhatia", cadre: "Assistant Professor", qualification: "M.Tech" },
        { id: "fm-39", panNumber: "ABCDE9012P", fullName: "L. Fernandez", cadre: "Assistant Professor", qualification: "M.Tech" },
        { id: "fm-310", panNumber: "BCDEF0123Q", fullName: "S. Trivedi", cadre: "Assistant Professor", qualification: "M.Tech" },
      ],
    },
    inspectionNotes: {
      profile: { status: "verified", remarks: "All documents in order." },
      infrastructure: { status: "verified", remarks: "1270 sq.m valid built-up area exceeds threshold." },
      facultyFSR: { status: "verified", remarks: "10 faculty for 180 intake satisfies 1:18 ratio (compliant)." },
      terCharges: { status: "verified", remarks: "Verified." },
      overallRemarks: "All norms cleared. Recommended for letter of approval.",
    },
  },
];

export function DashboardClient() {
  const [applications, setApplications] = useState<DashboardApplication[]>(SEED_APPLICATIONS);
  const [selectedAppId, setSelectedAppId] = useState<string>(SEED_APPLICATIONS[0].id);
  const [statusFilter, setStatusFilter] = useState<string>("all");
  const [dataGridTab, setDataGridTab] = useState<"facilities" | "faculty" | "norms">("facilities");
  const [toastMessage, setToastMessage] = useState<{ text: string; type: "success" | "error" } | null>(null);
  const [isPending, startTransition] = useTransition();

  const selectedApp = applications.find((app) => app.id === selectedAppId) || applications[0];

  // Officer Scrutiny form state for currently selected application
  const [profileStatus, setProfileStatus] = useState<"verified" | "deficient" | "pending">(
    selectedApp.inspectionNotes?.profile.status || "pending"
  );
  const [profileRemarks, setProfileRemarks] = useState<string>(
    selectedApp.inspectionNotes?.profile.remarks || ""
  );

  const [infraStatus, setInfraStatus] = useState<"verified" | "deficient" | "pending">(
    selectedApp.inspectionNotes?.infrastructure.status || "pending"
  );
  const [infraRemarks, setInfraRemarks] = useState<string>(
    selectedApp.inspectionNotes?.infrastructure.remarks || ""
  );

  const [facultyStatus, setFacultyStatus] = useState<"verified" | "deficient" | "pending">(
    selectedApp.inspectionNotes?.facultyFSR.status || "pending"
  );
  const [facultyRemarks, setFacultyRemarks] = useState<string>(
    selectedApp.inspectionNotes?.facultyFSR.remarks || ""
  );

  const [terStatus, setTerStatus] = useState<"verified" | "deficient" | "pending">(
    selectedApp.inspectionNotes?.terCharges.status || "verified"
  );
  const [terRemarks, setTerRemarks] = useState<string>(
    selectedApp.inspectionNotes?.terCharges.remarks || ""
  );

  const [overallStatus, setOverallStatus] = useState<"submitted" | "under_scrutiny" | "verified" | "deficient">(
    selectedApp.currentStatus
  );
  const [overallRemarks, setOverallRemarks] = useState<string>(
    selectedApp.inspectionNotes?.overallRemarks || ""
  );

  // Sync state when selectedApp changes
  const handleSelectApp = (app: DashboardApplication) => {
    setSelectedAppId(app.id);
    setProfileStatus(app.inspectionNotes?.profile.status || "pending");
    setProfileRemarks(app.inspectionNotes?.profile.remarks || "");
    setInfraStatus(app.inspectionNotes?.infrastructure.status || "pending");
    setInfraRemarks(app.inspectionNotes?.infrastructure.remarks || "");
    setFacultyStatus(app.inspectionNotes?.facultyFSR.status || "pending");
    setFacultyRemarks(app.inspectionNotes?.facultyFSR.remarks || "");
    setTerStatus(app.inspectionNotes?.terCharges.status || "verified");
    setTerRemarks(app.inspectionNotes?.terCharges.remarks || "");
    setOverallStatus(app.currentStatus);
    setOverallRemarks(app.inspectionNotes?.overallRemarks || "");
  };

  // Live calculations for selected institution
  const fsrNorm = useMemo(() => {
    return calculateFacultyStudentRatio(
      selectedApp.institution.totalIntake,
      selectedApp.institution.faculties.length
    );
  }, [selectedApp]);

  const areaNorm = useMemo(() => {
    return validateBuiltUpArea(selectedApp.institution.facilities, 1000);
  }, [selectedApp]);

  // Statistics
  const stats = useMemo(() => {
    const total = applications.length;
    const submitted = applications.filter((a) => a.currentStatus === "submitted").length;
    const scrutiny = applications.filter((a) => a.currentStatus === "under_scrutiny").length;
    const verified = applications.filter((a) => a.currentStatus === "verified").length;
    const deficient = applications.filter((a) => a.currentStatus === "deficient").length;
    return { total, submitted, scrutiny, verified, deficient };
  }, [applications]);

  // Filtered applications
  const filteredApps = useMemo(() => {
    if (statusFilter === "all") return applications;
    return applications.filter((app) => app.currentStatus === statusFilter);
  }, [applications, statusFilter]);

  // Submit scrutiny assessment action
  const handleSaveScrutiny = () => {
    const payload: ScrutinyInspectionPayload = {
      applicationId: selectedApp.id,
      status: overallStatus,
      inspectionItems: {
        institutionalProfile: { status: profileStatus, remarks: profileRemarks },
        infrastructure: { status: infraStatus, remarks: infraRemarks },
        facultyFSR: { status: facultyStatus, remarks: facultyRemarks },
        terCharges: { status: terStatus, remarks: terRemarks },
      },
      overallRemarks,
    };

    startTransition(async () => {
      const response = await updateApplicationScrutiny(payload);
      if (response.success) {
        // Update local state
        setApplications((prev) =>
          prev.map((app) =>
            app.id === selectedApp.id
              ? {
                  ...app,
                  currentStatus: overallStatus,
                  inspectionNotes: {
                    profile: { status: profileStatus, remarks: profileRemarks },
                    infrastructure: { status: infraStatus, remarks: infraRemarks },
                    facultyFSR: { status: facultyStatus, remarks: facultyRemarks },
                    terCharges: { status: terStatus, remarks: terRemarks },
                    overallRemarks,
                  },
                }
              : app
          )
        );

        setToastMessage({
          text: `Application ${selectedApp.id} updated to '${overallStatus.toUpperCase()}' in database.`,
          type: "success",
        });

        setTimeout(() => setToastMessage(null), 4000);
      } else {
        setToastMessage({
          text: "Failed to update application database model.",
          type: "error",
        });
      }
    });
  };

  const getStatusBadge = (status: string) => {
    switch (status) {
      case "verified":
        return "bg-emerald-50 text-emerald-700 border-emerald-200 dark:bg-emerald-950/50 dark:text-emerald-300 dark:border-emerald-800";
      case "deficient":
        return "bg-rose-50 text-rose-700 border-rose-200 dark:bg-rose-950/50 dark:text-rose-300 dark:border-rose-800";
      case "under_scrutiny":
        return "bg-amber-50 text-amber-700 border-amber-200 dark:bg-amber-950/50 dark:text-amber-300 dark:border-amber-800";
      default:
        return "bg-slate-100 text-slate-700 border-slate-200 dark:bg-slate-800 dark:text-slate-300 dark:border-slate-700";
    }
  };

  return (
    <div className="space-y-6">
      {/* Toast Alert */}
      {toastMessage && (
        <div
          className={`p-4 rounded-xl border flex items-center justify-between text-xs font-semibold shadow-md transition-all ${
            toastMessage.type === "success"
              ? "bg-emerald-500/10 border-emerald-500/30 text-emerald-800 dark:text-emerald-200"
              : "bg-rose-500/10 border-rose-500/30 text-rose-800 dark:text-rose-200"
          }`}
        >
          <div className="flex items-center gap-2">
            <span className="text-base">{toastMessage.type === "success" ? "✓" : "!"}</span>
            <span>{toastMessage.text}</span>
          </div>
          <button
            onClick={() => setToastMessage(null)}
            className="text-slate-400 hover:text-slate-600"
          >
            ✕
          </button>
        </div>
      )}

      {/* KPI Metrics Ribbon */}
      <div className="grid grid-cols-2 sm:grid-cols-5 gap-3">
        <div
          onClick={() => setStatusFilter("all")}
          className={`cursor-pointer p-4 rounded-xl border transition-all ${
            statusFilter === "all"
              ? "bg-teal-50/50 border-teal-300 dark:bg-teal-950/30 dark:border-teal-800 ring-2 ring-teal-600/20"
              : "bg-white dark:bg-slate-900 border-slate-200 dark:border-slate-800 hover:border-slate-300"
          }`}
        >
          <span className="text-[11px] font-semibold text-slate-500 uppercase tracking-wider block">
            All Applications
          </span>
          <span className="text-2xl font-black text-slate-900 dark:text-slate-100 mt-1 block">
            {stats.total}
          </span>
        </div>

        <div
          onClick={() => setStatusFilter("submitted")}
          className={`cursor-pointer p-4 rounded-xl border transition-all ${
            statusFilter === "submitted"
              ? "bg-slate-100 border-slate-400 dark:bg-slate-800 dark:border-slate-600 ring-2 ring-slate-500/20"
              : "bg-white dark:bg-slate-900 border-slate-200 dark:border-slate-800 hover:border-slate-300"
          }`}
        >
          <span className="text-[11px] font-semibold text-slate-500 uppercase tracking-wider block">
            New Submissions
          </span>
          <span className="text-2xl font-black text-slate-700 dark:text-slate-300 mt-1 block">
            {stats.submitted}
          </span>
        </div>

        <div
          onClick={() => setStatusFilter("under_scrutiny")}
          className={`cursor-pointer p-4 rounded-xl border transition-all ${
            statusFilter === "under_scrutiny"
              ? "bg-amber-50 border-amber-400 dark:bg-amber-950/40 dark:border-amber-600 ring-2 ring-amber-500/20"
              : "bg-white dark:bg-slate-900 border-slate-200 dark:border-slate-800 hover:border-slate-300"
          }`}
        >
          <span className="text-[11px] font-semibold text-amber-600 dark:text-amber-400 uppercase tracking-wider block">
            Under Scrutiny
          </span>
          <span className="text-2xl font-black text-amber-700 dark:text-amber-300 mt-1 block">
            {stats.scrutiny}
          </span>
        </div>

        <div
          onClick={() => setStatusFilter("verified")}
          className={`cursor-pointer p-4 rounded-xl border transition-all ${
            statusFilter === "verified"
              ? "bg-emerald-50 border-emerald-400 dark:bg-emerald-950/40 dark:border-emerald-600 ring-2 ring-emerald-500/20"
              : "bg-white dark:bg-slate-900 border-slate-200 dark:border-slate-800 hover:border-slate-300"
          }`}
        >
          <span className="text-[11px] font-semibold text-emerald-600 dark:text-emerald-400 uppercase tracking-wider block">
            Verified
          </span>
          <span className="text-2xl font-black text-emerald-700 dark:text-emerald-300 mt-1 block">
            {stats.verified}
          </span>
        </div>

        <div
          onClick={() => setStatusFilter("deficient")}
          className={`cursor-pointer p-4 rounded-xl border transition-all ${
            statusFilter === "deficient"
              ? "bg-rose-50 border-rose-400 dark:bg-rose-950/40 dark:border-rose-600 ring-2 ring-rose-500/20"
              : "bg-white dark:bg-slate-900 border-slate-200 dark:border-slate-800 hover:border-slate-300"
          }`}
        >
          <span className="text-[11px] font-semibold text-rose-600 dark:text-rose-400 uppercase tracking-wider block">
            Deficient
          </span>
          <span className="text-2xl font-black text-rose-700 dark:text-rose-300 mt-1 block">
            {stats.deficient}
          </span>
        </div>
      </div>

      {/* Applications Quick-Select List */}
      <div className="bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-800 rounded-2xl p-4 shadow-sm">
        <div className="flex items-center justify-between mb-3">
          <h3 className="text-xs font-bold uppercase tracking-wider text-slate-500">
            Incoming Applications Queue ({filteredApps.length})
          </h3>
          <span className="text-[11px] text-slate-400">
            Select an application to open split-screen inspection
          </span>
        </div>

        <div className="grid grid-cols-1 md:grid-cols-3 gap-3">
          {filteredApps.map((app) => {
            const isSelected = app.id === selectedApp.id;
            return (
              <div
                key={app.id}
                onClick={() => handleSelectApp(app)}
                className={`cursor-pointer p-3.5 rounded-xl border text-left transition-all ${
                  isSelected
                    ? "border-teal-700 bg-teal-50/40 dark:bg-teal-950/30 ring-2 ring-teal-600/20"
                    : "border-slate-200 dark:border-slate-800 hover:border-slate-300 dark:hover:border-slate-700 bg-white dark:bg-slate-900"
                }`}
              >
                <div className="flex items-center justify-between mb-1.5">
                  <span className="font-mono text-xs font-bold text-slate-700 dark:text-slate-300">
                    {app.id}
                  </span>
                  <span
                    className={`text-[10px] font-bold px-2 py-0.5 rounded-full uppercase border ${getStatusBadge(
                      app.currentStatus
                    )}`}
                  >
                    {app.currentStatus.replace("_", " ")}
                  </span>
                </div>
                <h4 className="text-xs font-bold text-slate-900 dark:text-slate-100 truncate">
                  {app.institution.name}
                </h4>
                <div className="flex items-center justify-between text-[11px] text-slate-500 dark:text-slate-400 mt-2">
                  <span>Intake: {app.institution.totalIntake}</span>
                  <span>{new Date(app.submissionDate).toLocaleDateString()}</span>
                </div>
              </div>
            );
          })}
        </div>
      </div>

      {/* SPLIT-SCREEN INSPECTION INTERFACE */}
      <div className="grid grid-cols-1 lg:grid-cols-12 gap-6 items-start">
        {/* LEFT PANEL: Submitted Data Grid (7 Cols) */}
        <div className="lg:col-span-7 bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-800 rounded-2xl p-6 shadow-sm space-y-6">
          {/* Header & Meta */}
          <div className="border-b border-slate-200 dark:border-slate-800 pb-4">
            <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-2">
              <div>
                <span className="text-[10px] font-mono uppercase bg-slate-100 dark:bg-slate-800 px-2 py-0.5 rounded text-slate-600 dark:text-slate-400">
                  Application Dossier: {selectedApp.id}
                </span>
                <h2 className="text-xl font-black text-slate-900 dark:text-slate-50 mt-1">
                  {selectedApp.institution.name}
                </h2>
                <p className="text-xs text-slate-500 dark:text-slate-400 mt-0.5">
                  Trust: {selectedApp.institution.trustName} • Land: {selectedApp.institution.landAreaAcres} Acres
                </p>
              </div>

              <div className="flex flex-col items-end gap-1">
                <span
                  className={`text-[11px] font-bold px-3 py-1 rounded-full uppercase border ${getStatusBadge(
                    selectedApp.currentStatus
                  )}`}
                >
                  {selectedApp.currentStatus.replace("_", " ")}
                </span>
                <span className="text-[11px] text-slate-400">
                  TER Charges:{" "}
                  <strong className={selectedApp.terChargesPaid ? "text-emerald-600" : "text-rose-600"}>
                    {selectedApp.terChargesPaid ? "Paid ✓" : "Pending ✗"}
                  </strong>
                </span>
              </div>
            </div>
          </div>

          {/* Sub-Tabs: Facilities vs Faculty vs Calculated Norms */}
          <div className="flex items-center gap-2 border-b border-slate-200 dark:border-slate-800 pb-2">
            <button
              onClick={() => setDataGridTab("facilities")}
              className={`px-3 py-1.5 text-xs font-semibold rounded-lg transition-colors ${
                dataGridTab === "facilities"
                  ? "bg-slate-900 text-white dark:bg-slate-100 dark:text-slate-900"
                  : "text-slate-600 dark:text-slate-400 hover:bg-slate-100 dark:hover:bg-slate-800"
              }`}
            >
              Infrastructure Grid ({selectedApp.institution.facilities.length})
            </button>
            <button
              onClick={() => setDataGridTab("faculty")}
              className={`px-3 py-1.5 text-xs font-semibold rounded-lg transition-colors ${
                dataGridTab === "faculty"
                  ? "bg-slate-900 text-white dark:bg-slate-100 dark:text-slate-900"
                  : "text-slate-600 dark:text-slate-400 hover:bg-slate-100 dark:hover:bg-slate-800"
              }`}
            >
              Faculty Roster ({selectedApp.institution.faculties.length})
            </button>
            <button
              onClick={() => setDataGridTab("norms")}
              className={`px-3 py-1.5 text-xs font-semibold rounded-lg transition-colors ${
                dataGridTab === "norms"
                  ? "bg-slate-900 text-white dark:bg-slate-100 dark:text-slate-900"
                  : "text-slate-600 dark:text-slate-400 hover:bg-slate-100 dark:hover:bg-slate-800"
              }`}
            >
              Engine Norms Evaluation
            </button>
          </div>

          {/* TAB 1: Facilities Data Grid */}
          {dataGridTab === "facilities" && (
            <div className="overflow-x-auto">
              <table className="w-full text-left text-xs">
                <thead>
                  <tr className="border-b border-slate-200 dark:border-slate-800 text-slate-500">
                    <th className="pb-2 font-semibold">#</th>
                    <th className="pb-2 font-semibold">Room Type</th>
                    <th className="pb-2 font-semibold text-right">Area (sq.m)</th>
                    <th className="pb-2 font-semibold text-right">Seating</th>
                    <th className="pb-2 font-semibold text-center">Barrier-Free</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-slate-100 dark:divide-slate-800/60">
                  {selectedApp.institution.facilities.map((fac, idx) => (
                    <tr key={fac.id} className="hover:bg-slate-50/50 dark:hover:bg-slate-800/30">
                      <td className="py-2.5 font-mono text-slate-400">{idx + 1}</td>
                      <td className="py-2.5 font-semibold text-slate-800 dark:text-slate-200">
                        {fac.roomType}
                      </td>
                      <td className="py-2.5 font-mono text-right text-slate-700 dark:text-slate-300">
                        {fac.areaSqM}
                      </td>
                      <td className="py-2.5 font-mono text-right text-slate-700 dark:text-slate-300">
                        {fac.seatingCapacity ?? "-"}
                      </td>
                      <td className="py-2.5 text-center">
                        <span
                          className={`text-[10px] px-2 py-0.5 rounded-full font-bold ${
                            fac.isBarrierFree
                              ? "bg-emerald-100 text-emerald-700 dark:bg-emerald-950/60 dark:text-emerald-300"
                              : "bg-slate-100 text-slate-500 dark:bg-slate-800 dark:text-slate-400"
                          }`}
                        >
                          {fac.isBarrierFree ? "Yes" : "No"}
                        </span>
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>

              <div className="mt-4 p-3 rounded-xl bg-slate-50 dark:bg-slate-800/40 border border-slate-200 dark:border-slate-800 text-xs flex justify-between items-center">
                <span className="text-slate-500">Total Valid Built-Up Area:</span>
                <span className="font-bold text-sm text-slate-900 dark:text-slate-100">
                  {areaNorm.totalValidArea} sq.m{" "}
                  <span
                    className={`text-xs ml-1 font-semibold ${
                      areaNorm.isCompliant ? "text-emerald-600" : "text-rose-600"
                    }`}
                  >
                    ({areaNorm.isCompliant ? "Compliant" : "Deficient"})
                  </span>
                </span>
              </div>
            </div>
          )}

          {/* TAB 2: Faculty Roster Grid */}
          {dataGridTab === "faculty" && (
            <div className="overflow-x-auto">
              <table className="w-full text-left text-xs">
                <thead>
                  <tr className="border-b border-slate-200 dark:border-slate-800 text-slate-500">
                    <th className="pb-2 font-semibold">#</th>
                    <th className="pb-2 font-semibold">Faculty Name</th>
                    <th className="pb-2 font-semibold font-mono">PAN Number</th>
                    <th className="pb-2 font-semibold">Cadre</th>
                    <th className="pb-2 font-semibold">Qualification</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-slate-100 dark:divide-slate-800/60">
                  {selectedApp.institution.faculties.map((f, idx) => (
                    <tr key={f.id} className="hover:bg-slate-50/50 dark:hover:bg-slate-800/30">
                      <td className="py-2.5 font-mono text-slate-400">{idx + 1}</td>
                      <td className="py-2.5 font-semibold text-slate-800 dark:text-slate-200">
                        {f.fullName}
                      </td>
                      <td className="py-2.5 font-mono text-slate-600 dark:text-slate-400">
                        {f.panNumber}
                      </td>
                      <td className="py-2.5 text-slate-700 dark:text-slate-300">
                        {f.cadre}
                      </td>
                      <td className="py-2.5 text-slate-600 dark:text-slate-400">
                        {f.qualification}
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>

              <div className="mt-4 p-3 rounded-xl bg-slate-50 dark:bg-slate-800/40 border border-slate-200 dark:border-slate-800 text-xs flex justify-between items-center">
                <span className="text-slate-500">
                  FSR Ratio (Intake: {selectedApp.institution.totalIntake} / Faculty: {selectedApp.institution.faculties.length}):
                </span>
                <span className="font-bold text-sm text-slate-900 dark:text-slate-100">
                  1 : {fsrNorm.studentToFacultyRatio ?? "-"}{" "}
                  <span
                    className={`text-xs ml-1 font-semibold ${
                      fsrNorm.isCompliant ? "text-emerald-600" : "text-rose-600"
                    }`}
                  >
                    ({fsrNorm.isCompliant ? "Compliant" : "Deficient"})
                  </span>
                </span>
              </div>
            </div>
          )}

          {/* TAB 3: Calculated Norms Evaluation */}
          {dataGridTab === "norms" && (
            <div className="space-y-4 text-xs">
              <div className="p-4 rounded-xl border border-slate-200 dark:border-slate-800 bg-slate-50/50 dark:bg-slate-800/40 space-y-2">
                <div className="flex justify-between items-center">
                  <h4 className="font-bold text-slate-900 dark:text-slate-100">
                    Faculty-Student Ratio Assessment
                  </h4>
                  <span
                    className={`font-bold px-2 py-0.5 rounded text-[10px] uppercase ${
                      fsrNorm.isCompliant ? "bg-emerald-100 text-emerald-700" : "bg-rose-100 text-rose-700"
                    }`}
                  >
                    {fsrNorm.isCompliant ? "Norm Satisfied" : "Deficient FSR"}
                  </span>
                </div>
                <p className="text-slate-500">
                  Mandatory threshold: 1:20 (0.05). Current institution ratio: {fsrNorm.ratio} (1:{fsrNorm.studentToFacultyRatio}).
                </p>
                <div className="grid grid-cols-3 gap-2 pt-2 border-t border-slate-200 dark:border-slate-700">
                  <div>
                    <span className="text-slate-400 block">Total Intake:</span>
                    <strong className="text-slate-800 dark:text-slate-200">{selectedApp.institution.totalIntake}</strong>
                  </div>
                  <div>
                    <span className="text-slate-400 block">Current Faculty:</span>
                    <strong className="text-slate-800 dark:text-slate-200">{selectedApp.institution.faculties.length}</strong>
                  </div>
                  <div>
                    <span className="text-slate-400 block">Min. Required:</span>
                    <strong className="text-teal-700 dark:text-teal-400">
                      {Math.ceil(selectedApp.institution.totalIntake * 0.05)} members
                    </strong>
                  </div>
                </div>
              </div>

              <div className="p-4 rounded-xl border border-slate-200 dark:border-slate-800 bg-slate-50/50 dark:bg-slate-800/40 space-y-2">
                <div className="flex justify-between items-center">
                  <h4 className="font-bold text-slate-900 dark:text-slate-100">
                    Built-Up Area Assessment
                  </h4>
                  <span
                    className={`font-bold px-2 py-0.5 rounded text-[10px] uppercase ${
                      areaNorm.isCompliant ? "bg-emerald-100 text-emerald-700" : "bg-rose-100 text-rose-700"
                    }`}
                  >
                    {areaNorm.isCompliant ? "Norm Satisfied" : "Deficient Area"}
                  </span>
                </div>
                <p className="text-slate-500">
                  Threshold: 1,000 sq.m. Total instructional & administrative area: {areaNorm.totalValidArea} sq.m.
                </p>
                <div className="grid grid-cols-3 gap-2 pt-2 border-t border-slate-200 dark:border-slate-700">
                  <div>
                    <span className="text-slate-400 block">Instructional:</span>
                    <strong className="text-slate-800 dark:text-slate-200">{areaNorm.totalInstructionalArea} sq.m</strong>
                  </div>
                  <div>
                    <span className="text-slate-400 block">Administrative:</span>
                    <strong className="text-slate-800 dark:text-slate-200">{areaNorm.totalAdministrativeArea} sq.m</strong>
                  </div>
                  <div>
                    <span className="text-slate-400 block">Margin:</span>
                    <strong className={areaNorm.deficitOrSurplus >= 0 ? "text-emerald-600" : "text-rose-600"}>
                      {areaNorm.deficitOrSurplus >= 0 ? `+${areaNorm.deficitOrSurplus}` : areaNorm.deficitOrSurplus} sq.m
                    </strong>
                  </div>
                </div>
              </div>
            </div>
          )}
        </div>

        {/* RIGHT PANEL: Officer Scrutiny & Assessment Station (5 Cols) */}
        <div className="lg:col-span-5 bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-800 rounded-2xl p-6 shadow-sm space-y-5 lg:sticky lg:top-6">
          <div className="border-b border-slate-200 dark:border-slate-800 pb-3">
            <div className="flex items-center justify-between">
              <h3 className="text-base font-bold text-slate-900 dark:text-slate-50">
                Scrutiny Officer Inspection Station
              </h3>
              <span className="text-[10px] font-mono uppercase bg-teal-50 dark:bg-teal-950/60 text-teal-800 dark:text-teal-300 px-2 py-0.5 rounded font-bold">
                DB Connected
              </span>
            </div>
            <p className="text-xs text-slate-500 dark:text-slate-400 mt-1">
              Mark checklist criteria as &apos;Verified&apos; or &apos;Deficient&apos; and record remarks for institutional compliance.
            </p>
          </div>

          <div className="space-y-4">
            {/* Checklist Item 1: Profile & Land */}
            <div className="p-3.5 rounded-xl border border-slate-200 dark:border-slate-800 bg-slate-50/50 dark:bg-slate-800/40 space-y-2">
              <div className="flex items-center justify-between">
                <span className="text-xs font-bold text-slate-800 dark:text-slate-200">
                  1. Institutional Profile & Land Norms
                </span>
                <div className="flex gap-1">
                  <button
                    type="button"
                    onClick={() => setProfileStatus("verified")}
                    className={`px-2.5 py-1 text-[11px] font-bold rounded ${
                      profileStatus === "verified"
                        ? "bg-emerald-600 text-white shadow-sm"
                        : "bg-slate-200 dark:bg-slate-700 text-slate-700 dark:text-slate-300 hover:bg-slate-300"
                    }`}
                  >
                    Verified
                  </button>
                  <button
                    type="button"
                    onClick={() => setProfileStatus("deficient")}
                    className={`px-2.5 py-1 text-[11px] font-bold rounded ${
                      profileStatus === "deficient"
                        ? "bg-rose-600 text-white shadow-sm"
                        : "bg-slate-200 dark:bg-slate-700 text-slate-700 dark:text-slate-300 hover:bg-slate-300"
                    }`}
                  >
                    Deficient
                  </button>
                </div>
              </div>
              <input
                type="text"
                placeholder="Officer remarks on land documents / society deed..."
                value={profileRemarks}
                onChange={(e) => setProfileRemarks(e.target.value)}
                className="w-full px-2.5 py-1.5 text-xs rounded border border-slate-300 dark:border-slate-700 bg-white dark:bg-slate-900 text-slate-800 dark:text-slate-200 outline-none focus:ring-1 focus:ring-teal-600"
              />
            </div>

            {/* Checklist Item 2: Infrastructure & Built-Up Area */}
            <div className="p-3.5 rounded-xl border border-slate-200 dark:border-slate-800 bg-slate-50/50 dark:bg-slate-800/40 space-y-2">
              <div className="flex items-center justify-between">
                <span className="text-xs font-bold text-slate-800 dark:text-slate-200">
                  2. Built-Up Area & Infrastructure
                </span>
                <div className="flex gap-1">
                  <button
                    type="button"
                    onClick={() => setInfraStatus("verified")}
                    className={`px-2.5 py-1 text-[11px] font-bold rounded ${
                      infraStatus === "verified"
                        ? "bg-emerald-600 text-white shadow-sm"
                        : "bg-slate-200 dark:bg-slate-700 text-slate-700 dark:text-slate-300 hover:bg-slate-300"
                    }`}
                  >
                    Verified
                  </button>
                  <button
                    type="button"
                    onClick={() => setInfraStatus("deficient")}
                    className={`px-2.5 py-1 text-[11px] font-bold rounded ${
                      infraStatus === "deficient"
                        ? "bg-rose-600 text-white shadow-sm"
                        : "bg-slate-200 dark:bg-slate-700 text-slate-700 dark:text-slate-300 hover:bg-slate-300"
                    }`}
                  >
                    Deficient
                  </button>
                </div>
              </div>
              <input
                type="text"
                placeholder="Officer remarks on laboratories, barrier-free access..."
                value={infraRemarks}
                onChange={(e) => setInfraRemarks(e.target.value)}
                className="w-full px-2.5 py-1.5 text-xs rounded border border-slate-300 dark:border-slate-700 bg-white dark:bg-slate-900 text-slate-800 dark:text-slate-200 outline-none focus:ring-1 focus:ring-teal-600"
              />
            </div>

            {/* Checklist Item 3: Faculty Roster & FSR Ratio */}
            <div className="p-3.5 rounded-xl border border-slate-200 dark:border-slate-800 bg-slate-50/50 dark:bg-slate-800/40 space-y-2">
              <div className="flex items-center justify-between">
                <span className="text-xs font-bold text-slate-800 dark:text-slate-200">
                  3. Faculty Cadre & 1:20 FSR Norm
                </span>
                <div className="flex gap-1">
                  <button
                    type="button"
                    onClick={() => setFacultyStatus("verified")}
                    className={`px-2.5 py-1 text-[11px] font-bold rounded ${
                      facultyStatus === "verified"
                        ? "bg-emerald-600 text-white shadow-sm"
                        : "bg-slate-200 dark:bg-slate-700 text-slate-700 dark:text-slate-300 hover:bg-slate-300"
                    }`}
                  >
                    Verified
                  </button>
                  <button
                    type="button"
                    onClick={() => setFacultyStatus("deficient")}
                    className={`px-2.5 py-1 text-[11px] font-bold rounded ${
                      facultyStatus === "deficient"
                        ? "bg-rose-600 text-white shadow-sm"
                        : "bg-slate-200 dark:bg-slate-700 text-slate-700 dark:text-slate-300 hover:bg-slate-300"
                    }`}
                  >
                    Deficient
                  </button>
                </div>
              </div>
              <input
                type="text"
                placeholder="Officer remarks on faculty credentials & cadre..."
                value={facultyRemarks}
                onChange={(e) => setFacultyRemarks(e.target.value)}
                className="w-full px-2.5 py-1.5 text-xs rounded border border-slate-300 dark:border-slate-700 bg-white dark:bg-slate-900 text-slate-800 dark:text-slate-200 outline-none focus:ring-1 focus:ring-teal-600"
              />
            </div>

            {/* Checklist Item 4: Statutory Affiliation Fees */}
            <div className="p-3.5 rounded-xl border border-slate-200 dark:border-slate-800 bg-slate-50/50 dark:bg-slate-800/40 space-y-2">
              <div className="flex items-center justify-between">
                <span className="text-xs font-bold text-slate-800 dark:text-slate-200">
                  4. Statutory TER Charges & Fees
                </span>
                <div className="flex gap-1">
                  <button
                    type="button"
                    onClick={() => setTerStatus("verified")}
                    className={`px-2.5 py-1 text-[11px] font-bold rounded ${
                      terStatus === "verified"
                        ? "bg-emerald-600 text-white shadow-sm"
                        : "bg-slate-200 dark:bg-slate-700 text-slate-700 dark:text-slate-300 hover:bg-slate-300"
                    }`}
                  >
                    Verified
                  </button>
                  <button
                    type="button"
                    onClick={() => setTerStatus("deficient")}
                    className={`px-2.5 py-1 text-[11px] font-bold rounded ${
                      terStatus === "deficient"
                        ? "bg-rose-600 text-white shadow-sm"
                        : "bg-slate-200 dark:bg-slate-700 text-slate-700 dark:text-slate-300 hover:bg-slate-300"
                    }`}
                  >
                    Deficient
                  </button>
                </div>
              </div>
              <input
                type="text"
                placeholder="Payment clearance remarks..."
                value={terRemarks}
                onChange={(e) => setTerRemarks(e.target.value)}
                className="w-full px-2.5 py-1.5 text-xs rounded border border-slate-300 dark:border-slate-700 bg-white dark:bg-slate-900 text-slate-800 dark:text-slate-200 outline-none focus:ring-1 focus:ring-teal-600"
              />
            </div>

            {/* Final Overall Assessment */}
            <div className="pt-2 border-t border-slate-200 dark:border-slate-800 space-y-3">
              <div>
                <label className="block text-xs font-bold text-slate-800 dark:text-slate-200 mb-1">
                  Target Application State (Prisma Model Update)
                </label>
                <select
                  value={overallStatus}
                  onChange={(e) =>
                    setOverallStatus(e.target.value as "submitted" | "under_scrutiny" | "verified" | "deficient")
                  }
                  className="w-full px-3 py-2 text-xs font-bold rounded-lg border border-slate-300 dark:border-slate-700 bg-white dark:bg-slate-800 text-slate-900 dark:text-slate-100"
                >
                  <option value="under_scrutiny">UNDER_SCRUTINY (Inspection In Progress)</option>
                  <option value="verified">VERIFIED (All Norms Approved)</option>
                  <option value="deficient">DEFICIENT (Deficiencies Memo Issued)</option>
                  <option value="submitted">SUBMITTED (Pending Officer Assignment)</option>
                </select>
              </div>

              <div>
                <label className="block text-xs font-bold text-slate-800 dark:text-slate-200 mb-1">
                  Overall Scrutiny Summary & Deficiency Memo
                </label>
                <textarea
                  rows={3}
                  placeholder="Summarize the inspection findings, citations, or approval recommendations..."
                  value={overallRemarks}
                  onChange={(e) => setOverallRemarks(e.target.value)}
                  className="w-full px-3 py-2 text-xs rounded-lg border border-slate-300 dark:border-slate-700 bg-white dark:bg-slate-900 text-slate-900 dark:text-slate-100 outline-none focus:ring-2 focus:ring-teal-600"
                />
              </div>

              <button
                type="button"
                disabled={isPending}
                onClick={handleSaveScrutiny}
                className="w-full py-2.5 px-4 rounded-xl text-xs font-bold text-white bg-teal-700 hover:bg-teal-800 disabled:opacity-60 shadow-sm transition-colors flex items-center justify-center gap-2"
              >
                {isPending ? (
                  <>
                    <span className="h-3 w-3 rounded-full border-2 border-white border-t-transparent animate-spin" />
                    <span>Committing to Database...</span>
                  </>
                ) : (
                  <span>Commit Scrutiny Assessment & Update Model</span>
                )}
              </button>
            </div>
          </div>
        </div>
      </div>
    </div>
  );
}
