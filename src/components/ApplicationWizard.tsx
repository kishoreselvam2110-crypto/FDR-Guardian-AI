"use client";

import React, { useState, useMemo } from "react";
import {
  calculateFacultyStudentRatio,
  validateBuiltUpArea,
  Facility,
} from "@/lib/compliance";

// Data types for the form wizard
export interface InstitutionProfile {
  name: string;
  trustName: string;
  landAreaAcres: number;
  contactEmail: string;
  institutionType: string;
  totalIntake: number;
}

export interface FacilityItem extends Facility {
  id: string;
}

export interface FacultyItem {
  id: string;
  panNumber: string;
  fullName: string;
  cadre: string;
  qualification: string;
}

const ROOM_TYPE_OPTIONS = [
  { value: "Classroom", label: "Classroom (Instructional)" },
  { value: "Laboratory", label: "Laboratory (Instructional)" },
  { value: "Seminar Hall", label: "Seminar Hall (Instructional)" },
  { value: "Computer Center", label: "Computer Center (Instructional)" },
  { value: "Library", label: "Library / Reading Room (Instructional)" },
  { value: "Workshop", label: "Workshop (Instructional)" },
  { value: "Admin Office", label: "Admin Office (Administrative)" },
  { value: "Principal Office", label: "Principal / Director Office (Administrative)" },
  { value: "Faculty Room", label: "Faculty / Staff Room (Administrative)" },
  { value: "Board Room", label: "Board Room (Administrative)" },
  { value: "Cafeteria", label: "Cafeteria (Amenities - Excluded)" },
  { value: "Sports Complex", label: "Sports Complex (Amenities - Excluded)" },
];

const CADRE_OPTIONS = [
  "Professor",
  "Associate Professor",
  "Assistant Professor",
  "Adjunct Faculty",
];

const QUALIFICATION_OPTIONS = [
  "Ph.D / Doctorate",
  "M.Tech / M.E",
  "M.Sc / M.Phil",
  "MBA / PGDM",
  "B.Tech / B.E",
];

const INITIAL_PROFILE: InstitutionProfile = {
  name: "Apex Institute of Science & Technology",
  trustName: "Shri Vidya Educational Trust",
  landAreaAcres: 12.5,
  contactEmail: "admin@apexinstitute.edu.in",
  institutionType: "Engineering & Technology",
  totalIntake: 240,
};

const INITIAL_FACILITIES: FacilityItem[] = [
  { id: "fac-1", roomType: "Classroom", areaSqM: 200, seatingCapacity: 60, isBarrierFree: true },
  { id: "fac-2", roomType: "Classroom", areaSqM: 200, seatingCapacity: 60, isBarrierFree: true },
  { id: "fac-3", roomType: "Laboratory", areaSqM: 250, seatingCapacity: 35, isBarrierFree: true },
  { id: "fac-4", roomType: "Seminar Hall", areaSqM: 180, seatingCapacity: 150, isBarrierFree: false },
  { id: "fac-5", roomType: "Admin Office", areaSqM: 90, seatingCapacity: 15, isBarrierFree: true },
  { id: "fac-6", roomType: "Faculty Room", areaSqM: 140, seatingCapacity: 25, isBarrierFree: true },
];

const INITIAL_FACULTY: FacultyItem[] = [
  { id: "fac-m1", panNumber: "ABCDE1234F", fullName: "Dr. R. Ramanathan", cadre: "Professor", qualification: "Ph.D / Doctorate" },
  { id: "fac-m2", panNumber: "BCDEF2345G", fullName: "Dr. S. Kulkarni", cadre: "Professor", qualification: "Ph.D / Doctorate" },
  { id: "fac-m3", panNumber: "CDEFG3456H", fullName: "A. Sengupta", cadre: "Associate Professor", qualification: "M.Tech / M.E" },
  { id: "fac-m4", panNumber: "DEFGH4567J", fullName: "M. Jayaraman", cadre: "Associate Professor", qualification: "Ph.D / Doctorate" },
  { id: "fac-m5", panNumber: "EFGHI5678K", fullName: "P. Deshmukh", cadre: "Assistant Professor", qualification: "M.Tech / M.E" },
  { id: "fac-m6", panNumber: "FGHIJ6789L", fullName: "V. Sharma", cadre: "Assistant Professor", qualification: "M.Tech / M.E" },
  { id: "fac-m7", panNumber: "GHIJK7890M", fullName: "K. Narayanan", cadre: "Assistant Professor", qualification: "M.Tech / M.E" },
  { id: "fac-m8", panNumber: "HIJKL8901N", fullName: "R. Agarwal", cadre: "Assistant Professor", qualification: "M.Tech / M.E" },
  { id: "fac-m9", panNumber: "IJKLM9012P", fullName: "N. Banerjee", cadre: "Assistant Professor", qualification: "M.Tech / M.E" },
  { id: "fac-m10", panNumber: "JKLMN0123Q", fullName: "T. Swaminathan", cadre: "Assistant Professor", qualification: "M.Tech / M.E" },
  { id: "fac-m11", panNumber: "KLMNO1234R", fullName: "H. Patel", cadre: "Assistant Professor", qualification: "M.Tech / M.E" },
  { id: "fac-m12", panNumber: "LMNOP2345S", fullName: "S. Venkatesh", cadre: "Assistant Professor", qualification: "Ph.D / Doctorate" },
];

export function ApplicationWizard() {
  const [currentStep, setCurrentStep] = useState<number>(1);
  const [profile, setProfile] = useState<InstitutionProfile>(INITIAL_PROFILE);
  const [facilities, setFacilities] = useState<FacilityItem[]>(INITIAL_FACILITIES);
  const [facultyList, setFacultyList] = useState<FacultyItem[]>(INITIAL_FACULTY);
  const [isSubmitted, setIsSubmitted] = useState<boolean>(false);

  // Compliance calculations in real-time
  const AREA_THRESHOLD = 1000; // 1,000 sq.m mock threshold
  const fsrResult = useMemo(() => {
    return calculateFacultyStudentRatio(Number(profile.totalIntake) || 0, facultyList.length);
  }, [profile.totalIntake, facultyList.length]);

  const areaResult = useMemo(() => {
    return validateBuiltUpArea(facilities, AREA_THRESHOLD);
  }, [facilities]);

  const isAllCompliant = fsrResult.isCompliant && areaResult.isCompliant;

  // Handlers for Step 1
  const updateProfile = (field: keyof InstitutionProfile, value: string | number) => {
    setProfile((prev) => ({ ...prev, [field]: value }));
  };

  // Handlers for Step 2: Facilities
  const addFacility = () => {
    const newFacility: FacilityItem = {
      id: `fac-${Date.now()}`,
      roomType: "Classroom",
      areaSqM: 100,
      seatingCapacity: 40,
      isBarrierFree: true,
    };
    setFacilities((prev) => [...prev, newFacility]);
  };

  const updateFacility = (id: string, field: keyof FacilityItem, value: string | number | boolean) => {
    setFacilities((prev) =>
      prev.map((item) => (item.id === id ? { ...item, [field]: value } : item))
    );
  };

  const removeFacility = (id: string) => {
    setFacilities((prev) => prev.filter((item) => item.id !== id));
  };

  // Handlers for Step 3: Faculty
  const addFaculty = () => {
    const newMember: FacultyItem = {
      id: `fac-m${Date.now()}`,
      panNumber: `ABCDE${Math.floor(1000 + Math.random() * 9000)}Z`,
      fullName: "",
      cadre: "Assistant Professor",
      qualification: "M.Tech / M.E",
    };
    setFacultyList((prev) => [...prev, newMember]);
  };

  const updateFaculty = (id: string, field: keyof FacultyItem, value: string) => {
    setFacultyList((prev) =>
      prev.map((item) => (item.id === id ? { ...item, [field]: value } : item))
    );
  };

  const removeFaculty = (id: string) => {
    setFacultyList((prev) => prev.filter((item) => item.id !== id));
  };

  const steps = [
    { number: 1, title: "Institutional Profile", desc: "Basic details & student intake" },
    { number: 2, title: "Infrastructure Metrics", desc: "Rooms, labs & built-up areas" },
    { number: 3, title: "Faculty Inventory", desc: "Staff appointments & cadre" },
    { number: 4, title: "Review & Submission", desc: "Compliance check & submit" },
  ];

  return (
    <div className="w-full max-w-7xl mx-auto space-y-6">
      {/* Step Progress Bar */}
      <nav aria-label="Application Progress" className="bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-800 rounded-2xl p-4 shadow-sm">
        <ol className="grid grid-cols-1 md:grid-cols-4 gap-4">
          {steps.map((step) => {
            const isActive = currentStep === step.number;
            const isCompleted = currentStep > step.number;
            return (
              <li
                key={step.number}
                onClick={() => setCurrentStep(step.number)}
                className={`cursor-pointer flex items-center gap-3 p-3 rounded-xl transition-all ${
                  isActive
                    ? "bg-slate-100 dark:bg-slate-800 border-l-4 border-teal-700"
                    : isCompleted
                    ? "opacity-90 hover:bg-slate-50 dark:hover:bg-slate-800/50"
                    : "opacity-60 hover:opacity-100"
                }`}
              >
                <div
                  className={`w-8 h-8 rounded-full flex items-center justify-center text-xs font-bold transition-colors ${
                    isCompleted
                      ? "bg-emerald-600 text-white"
                      : isActive
                      ? "bg-teal-700 text-white shadow-sm"
                      : "bg-slate-200 dark:bg-slate-700 text-slate-700 dark:text-slate-300"
                  }`}
                >
                  {isCompleted ? "✓" : step.number}
                </div>
                <div className="min-w-0">
                  <p className="text-xs font-semibold text-slate-900 dark:text-slate-100 truncate">
                    {step.title}
                  </p>
                  <p className="text-[11px] text-slate-500 dark:text-slate-400 truncate">
                    {step.desc}
                  </p>
                </div>
              </li>
            );
          })}
        </ol>
      </nav>

      {/* Main Grid: Form on Left, Live Compliance Sidebar on Right */}
      <div className="grid grid-cols-1 lg:grid-cols-12 gap-6 items-start">
        {/* Form Body (8 cols) */}
        <div className="lg:col-span-8 bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-800 rounded-2xl p-6 md:p-8 shadow-sm">
          {/* STEP 1: Institutional Profile */}
          {currentStep === 1 && (
            <div className="space-y-6">
              <div className="border-b border-slate-200 dark:border-slate-800 pb-4">
                <h2 className="text-xl font-bold text-slate-900 dark:text-slate-50">
                  Step 1: Institutional Profile Details
                </h2>
                <p className="text-sm text-slate-500 dark:text-slate-400 mt-1">
                  Specify your college foundation, managing trust, and total approved student intake.
                </p>
              </div>

              <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                <div>
                  <label className="block text-xs font-semibold text-slate-700 dark:text-slate-300 mb-1">
                    Institution Name
                  </label>
                  <input
                    type="text"
                    value={profile.name}
                    onChange={(e) => updateProfile("name", e.target.value)}
                    placeholder="e.g. Apex Institute of Science & Technology"
                    className="w-full px-3.5 py-2.5 text-sm rounded-lg border border-slate-300 dark:border-slate-700 bg-white dark:bg-slate-800 text-slate-900 dark:text-slate-100 focus:ring-2 focus:ring-teal-600 outline-none"
                  />
                </div>

                <div>
                  <label className="block text-xs font-semibold text-slate-700 dark:text-slate-300 mb-1">
                    Managing Trust / Society Name
                  </label>
                  <input
                    type="text"
                    value={profile.trustName}
                    onChange={(e) => updateProfile("trustName", e.target.value)}
                    placeholder="e.g. Vidya Educational Trust"
                    className="w-full px-3.5 py-2.5 text-sm rounded-lg border border-slate-300 dark:border-slate-700 bg-white dark:bg-slate-800 text-slate-900 dark:text-slate-100 focus:ring-2 focus:ring-teal-600 outline-none"
                  />
                </div>

                <div>
                  <label className="block text-xs font-semibold text-slate-700 dark:text-slate-300 mb-1">
                    Land Area (Acres)
                  </label>
                  <input
                    type="number"
                    step="0.1"
                    min="1"
                    value={profile.landAreaAcres}
                    onChange={(e) => updateProfile("landAreaAcres", parseFloat(e.target.value) || 0)}
                    className="w-full px-3.5 py-2.5 text-sm rounded-lg border border-slate-300 dark:border-slate-700 bg-white dark:bg-slate-800 text-slate-900 dark:text-slate-100 focus:ring-2 focus:ring-teal-600 outline-none"
                  />
                </div>

                <div>
                  <label className="block text-xs font-semibold text-slate-700 dark:text-slate-300 mb-1">
                    Contact Email
                  </label>
                  <input
                    type="email"
                    value={profile.contactEmail}
                    onChange={(e) => updateProfile("contactEmail", e.target.value)}
                    className="w-full px-3.5 py-2.5 text-sm rounded-lg border border-slate-300 dark:border-slate-700 bg-white dark:bg-slate-800 text-slate-900 dark:text-slate-100 focus:ring-2 focus:ring-teal-600 outline-none"
                  />
                </div>

                <div>
                  <label className="block text-xs font-semibold text-slate-700 dark:text-slate-300 mb-1">
                    Institution Category
                  </label>
                  <select
                    value={profile.institutionType}
                    onChange={(e) => updateProfile("institutionType", e.target.value)}
                    className="w-full px-3.5 py-2.5 text-sm rounded-lg border border-slate-300 dark:border-slate-700 bg-white dark:bg-slate-800 text-slate-900 dark:text-slate-100 focus:ring-2 focus:ring-teal-600 outline-none"
                  >
                    <option value="Engineering & Technology">Engineering & Technology</option>
                    <option value="Management Studies">Management Studies</option>
                    <option value="Pharmacy">Pharmacy</option>
                    <option value="Architecture & Planning">Architecture & Planning</option>
                  </select>
                </div>

                <div className="bg-teal-50/60 dark:bg-teal-950/30 p-3.5 rounded-xl border border-teal-100 dark:border-teal-900/50">
                  <div className="flex items-center justify-between mb-1">
                    <label className="block text-xs font-bold text-teal-900 dark:text-teal-200">
                      Total Student Intake (Enrollment)
                    </label>
                    <span className="text-[10px] font-mono uppercase bg-teal-100 dark:bg-teal-900 text-teal-800 dark:text-teal-300 px-1.5 py-0.5 rounded">
                      FSR Key Driver
                    </span>
                  </div>
                  <input
                    type="number"
                    min="1"
                    step="10"
                    value={profile.totalIntake}
                    onChange={(e) => updateProfile("totalIntake", parseInt(e.target.value, 10) || 0)}
                    className="w-full px-3.5 py-2 text-sm font-semibold rounded-lg border border-teal-200 dark:border-indigo-800 bg-white dark:bg-slate-900 text-slate-900 dark:text-slate-100 focus:ring-2 focus:ring-teal-600 outline-none"
                  />
                  <p className="text-[11px] text-teal-800 dark:text-teal-300 mt-1">
                    Current intake requires at least {Math.ceil(profile.totalIntake / 20)} qualified faculty members for 1:20 compliance.
                  </p>
                </div>
              </div>
            </div>
          )}

          {/* STEP 2: Infrastructure Metrics */}
          {currentStep === 2 && (
            <div className="space-y-6">
              <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-3 border-b border-slate-200 dark:border-slate-800 pb-4">
                <div>
                  <h2 className="text-xl font-bold text-slate-900 dark:text-slate-50">
                    Step 2: Infrastructure Metrics & Room Inventory
                  </h2>
                  <p className="text-sm text-slate-500 dark:text-slate-400 mt-1">
                    Input room counts and area sizes. Real-time engine computes instructional and administrative areas.
                  </p>
                </div>
                <button
                  type="button"
                  onClick={addFacility}
                  className="inline-flex items-center gap-1.5 px-3.5 py-2 text-xs font-semibold text-white bg-teal-700 hover:bg-teal-800 rounded-lg shadow-sm transition-colors shrink-0"
                >
                  <span>+ Add Facility Room</span>
                </button>
              </div>

              {facilities.length === 0 ? (
                <div className="text-center py-12 border-2 border-dashed border-slate-200 dark:border-slate-800 rounded-xl">
                  <p className="text-sm text-slate-500">No rooms added yet. Click &quot;Add Facility Room&quot; to begin.</p>
                </div>
              ) : (
                <div className="space-y-3">
                  {facilities.map((fac, idx) => (
                    <div
                      key={fac.id}
                      className="p-4 rounded-xl border border-slate-200 dark:border-slate-800 bg-slate-50/50 dark:bg-slate-800/40 flex flex-col md:flex-row md:items-center gap-3 transition-colors hover:border-slate-300 dark:hover:border-slate-700"
                    >
                      <div className="flex items-center gap-2 md:w-8 text-xs font-mono text-slate-400">
                        #{idx + 1}
                      </div>

                      <div className="flex-1 grid grid-cols-1 sm:grid-cols-2 md:grid-cols-4 gap-3">
                        <div>
                          <label className="block text-[11px] font-semibold text-slate-600 dark:text-slate-400 mb-1">
                            Room Type
                          </label>
                          <select
                            value={fac.roomType}
                            onChange={(e) => updateFacility(fac.id, "roomType", e.target.value)}
                            className="w-full px-2.5 py-1.5 text-xs rounded-md border border-slate-300 dark:border-slate-700 bg-white dark:bg-slate-900 text-slate-900 dark:text-slate-100"
                          >
                            {ROOM_TYPE_OPTIONS.map((opt) => (
                              <option key={opt.value} value={opt.value}>
                                {opt.label}
                              </option>
                            ))}
                          </select>
                        </div>

                        <div>
                          <label className="block text-[11px] font-semibold text-slate-600 dark:text-slate-400 mb-1">
                            Area (Sq. Meters)
                          </label>
                          <input
                            type="number"
                            min="0"
                            step="5"
                            value={fac.areaSqM}
                            onChange={(e) => updateFacility(fac.id, "areaSqM", parseFloat(e.target.value) || 0)}
                            className="w-full px-2.5 py-1.5 text-xs rounded-md border border-slate-300 dark:border-slate-700 bg-white dark:bg-slate-900 text-slate-900 dark:text-slate-100"
                          />
                        </div>

                        <div>
                          <label className="block text-[11px] font-semibold text-slate-600 dark:text-slate-400 mb-1">
                            Seating Capacity
                          </label>
                          <input
                            type="number"
                            min="0"
                            value={fac.seatingCapacity ?? 0}
                            onChange={(e) => updateFacility(fac.id, "seatingCapacity", parseInt(e.target.value, 10) || 0)}
                            className="w-full px-2.5 py-1.5 text-xs rounded-md border border-slate-300 dark:border-slate-700 bg-white dark:bg-slate-900 text-slate-900 dark:text-slate-100"
                          />
                        </div>

                        <div className="flex items-center sm:pt-4">
                          <label className="inline-flex items-center gap-2 cursor-pointer text-xs text-slate-700 dark:text-slate-300">
                            <input
                              type="checkbox"
                              checked={fac.isBarrierFree}
                              onChange={(e) => updateFacility(fac.id, "isBarrierFree", e.target.checked)}
                              className="rounded border-slate-300 text-teal-700 focus:ring-teal-600 h-4 w-4"
                            />
                            <span>Barrier-Free Access</span>
                          </label>
                        </div>
                      </div>

                      <button
                        type="button"
                        onClick={() => removeFacility(fac.id)}
                        className="self-end md:self-center text-xs text-rose-500 hover:text-rose-700 hover:bg-rose-50 dark:hover:bg-rose-950/30 px-2 py-1.5 rounded transition-colors"
                        title="Remove facility"
                      >
                        ✕ Remove
                      </button>
                    </div>
                  ))}
                </div>
              )}
            </div>
          )}

          {/* STEP 3: Faculty Inventory */}
          {currentStep === 3 && (
            <div className="space-y-6">
              <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-3 border-b border-slate-200 dark:border-slate-800 pb-4">
                <div>
                  <h2 className="text-xl font-bold text-slate-900 dark:text-slate-50">
                    Step 3: Faculty Inventory
                  </h2>
                  <p className="text-sm text-slate-500 dark:text-slate-400 mt-1">
                    Record full-time teaching faculty. The FSR engine validates counts against intake ({profile.totalIntake} students).
                  </p>
                </div>
                <button
                  type="button"
                  onClick={addFaculty}
                  className="inline-flex items-center gap-1.5 px-3.5 py-2 text-xs font-semibold text-white bg-teal-700 hover:bg-teal-800 rounded-lg shadow-sm transition-colors shrink-0"
                >
                  <span>+ Add Faculty Member</span>
                </button>
              </div>

              {facultyList.length === 0 ? (
                <div className="text-center py-12 border-2 border-dashed border-slate-200 dark:border-slate-800 rounded-xl">
                  <p className="text-sm text-slate-500">No faculty members added yet. Click &quot;Add Faculty Member&quot; to begin.</p>
                </div>
              ) : (
                <div className="space-y-3">
                  {facultyList.map((faculty, idx) => (
                    <div
                      key={faculty.id}
                      className="p-4 rounded-xl border border-slate-200 dark:border-slate-800 bg-slate-50/50 dark:bg-slate-800/40 flex flex-col md:flex-row md:items-center gap-3 transition-colors hover:border-slate-300 dark:hover:border-slate-700"
                    >
                      <div className="flex items-center gap-2 md:w-8 text-xs font-mono text-slate-400">
                        #{idx + 1}
                      </div>

                      <div className="flex-1 grid grid-cols-1 sm:grid-cols-2 md:grid-cols-4 gap-3">
                        <div>
                          <label className="block text-[11px] font-semibold text-slate-600 dark:text-slate-400 mb-1">
                            Full Name
                          </label>
                          <input
                            type="text"
                            value={faculty.fullName}
                            onChange={(e) => updateFaculty(faculty.id, "fullName", e.target.value)}
                            placeholder="e.g. Dr. A. Kumar"
                            className="w-full px-2.5 py-1.5 text-xs rounded-md border border-slate-300 dark:border-slate-700 bg-white dark:bg-slate-900 text-slate-900 dark:text-slate-100"
                          />
                        </div>

                        <div>
                          <label className="block text-[11px] font-semibold text-slate-600 dark:text-slate-400 mb-1">
                            PAN Number
                          </label>
                          <input
                            type="text"
                            maxLength={10}
                            value={faculty.panNumber}
                            onChange={(e) => updateFaculty(faculty.id, "panNumber", e.target.value.toUpperCase())}
                            placeholder="ABCDE1234F"
                            className="w-full font-mono uppercase px-2.5 py-1.5 text-xs rounded-md border border-slate-300 dark:border-slate-700 bg-white dark:bg-slate-900 text-slate-900 dark:text-slate-100"
                          />
                        </div>

                        <div>
                          <label className="block text-[11px] font-semibold text-slate-600 dark:text-slate-400 mb-1">
                            Cadre Designation
                          </label>
                          <select
                            value={faculty.cadre}
                            onChange={(e) => updateFaculty(faculty.id, "cadre", e.target.value)}
                            className="w-full px-2.5 py-1.5 text-xs rounded-md border border-slate-300 dark:border-slate-700 bg-white dark:bg-slate-900 text-slate-900 dark:text-slate-100"
                          >
                            {CADRE_OPTIONS.map((cadre) => (
                              <option key={cadre} value={cadre}>
                                {cadre}
                              </option>
                            ))}
                          </select>
                        </div>

                        <div>
                          <label className="block text-[11px] font-semibold text-slate-600 dark:text-slate-400 mb-1">
                            Qualification
                          </label>
                          <select
                            value={faculty.qualification}
                            onChange={(e) => updateFaculty(faculty.id, "qualification", e.target.value)}
                            className="w-full px-2.5 py-1.5 text-xs rounded-md border border-slate-300 dark:border-slate-700 bg-white dark:bg-slate-900 text-slate-900 dark:text-slate-100"
                          >
                            {QUALIFICATION_OPTIONS.map((qual) => (
                              <option key={qual} value={qual}>
                                {qual}
                              </option>
                            ))}
                          </select>
                        </div>
                      </div>

                      <button
                        type="button"
                        onClick={() => removeFaculty(faculty.id)}
                        className="self-end md:self-center text-xs text-rose-500 hover:text-rose-700 hover:bg-rose-50 dark:hover:bg-rose-950/30 px-2 py-1.5 rounded transition-colors"
                        title="Remove faculty"
                      >
                        ✕ Remove
                      </button>
                    </div>
                  ))}
                </div>
              )}
            </div>
          )}

          {/* STEP 4: Review & Final Submission */}
          {currentStep === 4 && (
            <div className="space-y-6">
              <div className="border-b border-slate-200 dark:border-slate-800 pb-4">
                <h2 className="text-xl font-bold text-slate-900 dark:text-slate-50">
                  Step 4: Application Review & Submission
                </h2>
                <p className="text-sm text-slate-500 dark:text-slate-400 mt-1">
                  Inspect your compiled application metrics and regulatory compliance checks before formal submission.
                </p>
              </div>

              {isSubmitted ? (
                <div className="p-6 rounded-2xl bg-emerald-50 dark:bg-emerald-950/30 border border-emerald-200 dark:border-emerald-800 text-center space-y-3">
                  <div className="w-12 h-12 bg-emerald-600 text-white rounded-full flex items-center justify-center mx-auto text-xl font-bold">
                    ✓
                  </div>
                  <h3 className="text-lg font-bold text-emerald-900 dark:text-emerald-100">
                    Application Successfully Submitted!
                  </h3>
                  <p className="text-sm text-emerald-700 dark:text-emerald-300 max-w-md mx-auto">
                    Your institutional affiliation dossier for {profile.name} has been processed with all compliance validations cleared.
                  </p>
                  <div className="pt-2">
                    <button
                      type="button"
                      onClick={() => setIsSubmitted(false)}
                      className="px-4 py-2 text-xs font-semibold text-emerald-800 dark:text-emerald-200 bg-emerald-100 dark:bg-emerald-900/60 rounded-lg hover:bg-emerald-200 transition-colors"
                    >
                      Edit Application Details
                    </button>
                  </div>
                </div>
              ) : (
                <div className="space-y-4">
                  <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                    <div className="p-4 rounded-xl border border-slate-200 dark:border-slate-800 bg-slate-50/50 dark:bg-slate-800/40">
                      <h4 className="text-xs font-bold uppercase tracking-wider text-slate-500 mb-2">
                        Institution Overview
                      </h4>
                      <dl className="text-xs space-y-1.5">
                        <div className="flex justify-between">
                          <dt className="text-slate-500">Name:</dt>
                          <dd className="font-semibold text-slate-800 dark:text-slate-200">{profile.name}</dd>
                        </div>
                        <div className="flex justify-between">
                          <dt className="text-slate-500">Trust:</dt>
                          <dd className="text-slate-800 dark:text-slate-200">{profile.trustName}</dd>
                        </div>
                        <div className="flex justify-between">
                          <dt className="text-slate-500">Student Intake:</dt>
                          <dd className="font-bold text-slate-900 dark:text-slate-100">{profile.totalIntake}</dd>
                        </div>
                      </dl>
                    </div>

                    <div className="p-4 rounded-xl border border-slate-200 dark:border-slate-800 bg-slate-50/50 dark:bg-slate-800/40">
                      <h4 className="text-xs font-bold uppercase tracking-wider text-slate-500 mb-2">
                        Inventory Counts
                      </h4>
                      <dl className="text-xs space-y-1.5">
                        <div className="flex justify-between">
                          <dt className="text-slate-500">Total Rooms Registered:</dt>
                          <dd className="font-semibold text-slate-800 dark:text-slate-200">{facilities.length} rooms</dd>
                        </div>
                        <div className="flex justify-between">
                          <dt className="text-slate-500">Total Faculty Members:</dt>
                          <dd className="font-semibold text-slate-800 dark:text-slate-200">{facultyList.length} faculty</dd>
                        </div>
                        <div className="flex justify-between">
                          <dt className="text-slate-500">Total Valid Built-Up Area:</dt>
                          <dd className="font-bold text-slate-900 dark:text-slate-100">{areaResult.totalValidArea} sq.m</dd>
                        </div>
                      </dl>
                    </div>
                  </div>

                  {!isAllCompliant && (
                    <div className="p-4 rounded-xl bg-amber-50 dark:bg-amber-950/40 border border-amber-200 dark:border-amber-800 text-xs text-amber-800 dark:text-amber-200">
                      ⚠️ <strong>Compliance Warning:</strong> One or more regulatory rules are currently failing (FSR or Built-Up Area). You can still review, but resolving non-compliant criteria is recommended prior to formal scrutiny.
                    </div>
                  )}

                  <div className="pt-2">
                    <button
                      type="button"
                      onClick={() => setIsSubmitted(true)}
                      className={`w-full py-3 px-4 rounded-xl text-sm font-semibold text-white shadow-sm transition-colors ${
                        isAllCompliant
                          ? "bg-emerald-600 hover:bg-emerald-700"
                          : "bg-teal-700 hover:bg-teal-800"
                      }`}
                    >
                      {isAllCompliant ? "Submit Application (All Norms Satisfied)" : "Submit Application with Deficiencies"}
                    </button>
                  </div>
                </div>
              )}
            </div>
          )}

          {/* Form Action Controls (Back / Next) */}
          <div className="flex items-center justify-between pt-6 border-t border-slate-200 dark:border-slate-800 mt-6">
            <button
              type="button"
              disabled={currentStep === 1}
              onClick={() => setCurrentStep((prev) => Math.max(1, prev - 1))}
              className="px-4 py-2 text-xs font-semibold rounded-lg border border-slate-300 dark:border-slate-700 text-slate-700 dark:text-slate-300 hover:bg-slate-50 dark:hover:bg-slate-800 disabled:opacity-40 disabled:cursor-not-allowed transition-colors"
            >
              ← Previous Step
            </button>

            <span className="text-xs text-slate-400">
              Step {currentStep} of {steps.length}
            </span>

            {currentStep < steps.length ? (
              <button
                type="button"
                onClick={() => setCurrentStep((prev) => Math.min(steps.length, prev + 1))}
                className="px-4 py-2 text-xs font-semibold rounded-lg bg-teal-700 hover:bg-teal-800 text-white transition-colors"
              >
                Next Step →
              </button>
            ) : (
              <button
                type="button"
                onClick={() => setCurrentStep(1)}
                className="px-4 py-2 text-xs font-semibold rounded-lg border border-slate-300 dark:border-slate-700 text-slate-700 dark:text-slate-300 hover:bg-slate-50 dark:hover:bg-slate-800 transition-colors"
              >
                Restart Wizard ↺
              </button>
            )}
          </div>
        </div>

        {/* Dynamic Live Compliance Feedback Sidebar Widget (4 cols) */}
        <aside className="lg:col-span-4 space-y-4 lg:sticky lg:top-6">
          {/* Header Card: Overall Status */}
          <div className="bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-800 rounded-2xl p-5 shadow-sm">
            <div className="flex items-center justify-between mb-3">
              <span className="text-xs font-mono font-bold tracking-wider uppercase text-slate-500">
                Live Compliance Engine
              </span>
              <span className="inline-flex items-center gap-1.5 px-2 py-0.5 rounded-full text-[10px] font-bold uppercase bg-slate-100 dark:bg-slate-800 text-slate-700 dark:text-slate-300">
                <span className="h-1.5 w-1.5 rounded-full bg-emerald-500 animate-ping" />
                Active
              </span>
            </div>

            <div
              className={`p-4 rounded-xl border flex items-center justify-between ${
                isAllCompliant
                  ? "bg-emerald-500/10 border-emerald-500/30 text-emerald-800 dark:text-emerald-300"
                  : "bg-rose-500/10 border-rose-500/30 text-rose-800 dark:text-rose-300"
              }`}
            >
              <div>
                <p className="text-xs font-semibold uppercase tracking-wider">
                  Overall Status
                </p>
                <p className="text-xl font-black mt-0.5">
                  {isAllCompliant ? "PASS • COMPLIANT" : "FAIL • ACTION REQUIRED"}
                </p>
              </div>
              <div
                className={`w-10 h-10 rounded-full flex items-center justify-center font-bold text-lg ${
                  isAllCompliant ? "bg-emerald-600 text-white" : "bg-rose-600 text-white"
                }`}
              >
                {isAllCompliant ? "✓" : "!"}
              </div>
            </div>
          </div>

          {/* Card 1: Faculty Student Ratio (FSR) Validation */}
          <div className="bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-800 rounded-2xl p-5 shadow-sm space-y-3">
            <div className="flex items-center justify-between">
              <div>
                <h3 className="text-sm font-bold text-slate-900 dark:text-slate-100">
                  Faculty-Student Ratio
                </h3>
                <p className="text-[11px] text-slate-500">Regulatory Norm: 1:20 (0.05)</p>
              </div>
              <span
                className={`text-[11px] font-bold px-2.5 py-1 rounded-full uppercase tracking-wider ${
                  fsrResult.isCompliant
                    ? "bg-emerald-100 dark:bg-emerald-950/60 text-emerald-700 dark:text-emerald-300 border border-emerald-200 dark:border-emerald-800"
                    : "bg-rose-100 dark:bg-rose-950/60 text-rose-700 dark:text-rose-300 border border-rose-200 dark:border-rose-800"
                }`}
              >
                {fsrResult.isCompliant ? "PASS" : "FAIL"}
              </span>
            </div>

            {/* FSR Metric Meter */}
            <div className="bg-slate-50 dark:bg-slate-800/60 rounded-xl p-3 border border-slate-100 dark:border-slate-800">
              <div className="flex items-baseline justify-between">
                <span className="text-xs text-slate-500">Calculated Ratio:</span>
                <span className="font-mono text-base font-bold text-slate-900 dark:text-slate-100">
                  {fsrResult.studentToFacultyRatio !== undefined && isFinite(fsrResult.studentToFacultyRatio)
                    ? `1 : ${fsrResult.studentToFacultyRatio}`
                    : "0"}
                  <span className="text-xs font-normal text-slate-400 ml-1">
                    ({fsrResult.ratio})
                  </span>
                </span>
              </div>

              {/* Visual Progress bar */}
              <div className="w-full bg-slate-200 dark:bg-slate-700 h-2 rounded-full overflow-hidden mt-2">
                <div
                  className={`h-full transition-all duration-300 ${
                    fsrResult.isCompliant ? "bg-emerald-500" : "bg-rose-500"
                  }`}
                  style={{
                    width: `${Math.min(100, (fsrResult.ratio / 0.05) * 100)}%`,
                  }}
                />
              </div>

              <div className="mt-3 pt-2 border-t border-slate-200/60 dark:border-slate-700/60 grid grid-cols-2 gap-2 text-[11px]">
                <div>
                  <span className="text-slate-500">Intake:</span>{" "}
                  <strong className="text-slate-800 dark:text-slate-200">{profile.totalIntake}</strong>
                </div>
                <div>
                  <span className="text-slate-500">Faculty Count:</span>{" "}
                  <strong className="text-slate-800 dark:text-slate-200">{facultyList.length}</strong>
                </div>
                <div className="col-span-2 text-[11px] text-slate-500">
                  Minimum Faculty Needed:{" "}
                  <strong className="text-teal-700 dark:text-teal-400">
                    {Math.ceil(profile.totalIntake * 0.05)} members
                  </strong>
                </div>
              </div>
            </div>
          </div>

          {/* Card 2: Built-Up Area Validation */}
          <div className="bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-800 rounded-2xl p-5 shadow-sm space-y-3">
            <div className="flex items-center justify-between">
              <div>
                <h3 className="text-sm font-bold text-slate-900 dark:text-slate-100">
                  Built-Up Area Norm
                </h3>
                <p className="text-[11px] text-slate-500">Threshold: {areaResult.requiredThreshold} sq.m</p>
              </div>
              <span
                className={`text-[11px] font-bold px-2.5 py-1 rounded-full uppercase tracking-wider ${
                  areaResult.isCompliant
                    ? "bg-emerald-100 dark:bg-emerald-950/60 text-emerald-700 dark:text-emerald-300 border border-emerald-200 dark:border-emerald-800"
                    : "bg-rose-100 dark:bg-rose-950/60 text-rose-700 dark:text-rose-300 border border-rose-200 dark:border-rose-800"
                }`}
              >
                {areaResult.isCompliant ? "PASS" : "FAIL"}
              </span>
            </div>

            {/* Area Metrics */}
            <div className="bg-slate-50 dark:bg-slate-800/60 rounded-xl p-3 border border-slate-100 dark:border-slate-800">
              <div className="flex items-baseline justify-between">
                <span className="text-xs text-slate-500">Valid Area:</span>
                <span className="font-mono text-base font-bold text-slate-900 dark:text-slate-100">
                  {areaResult.totalValidArea}{" "}
                  <span className="text-xs font-normal text-slate-400">sq.m</span>
                </span>
              </div>

              {/* Progress Bar */}
              <div className="w-full bg-slate-200 dark:bg-slate-700 h-2 rounded-full overflow-hidden mt-2">
                <div
                  className={`h-full transition-all duration-300 ${
                    areaResult.isCompliant ? "bg-emerald-500" : "bg-rose-500"
                  }`}
                  style={{
                    width: `${Math.min(100, (areaResult.totalValidArea / areaResult.requiredThreshold) * 100)}%`,
                  }}
                />
              </div>

              <div className="mt-3 pt-2 border-t border-slate-200/60 dark:border-slate-700/60 space-y-1.5 text-[11px]">
                <div className="flex justify-between">
                  <span className="text-slate-500">Instructional Area:</span>
                  <span className="font-semibold text-slate-800 dark:text-slate-200">
                    {areaResult.totalInstructionalArea} sq.m ({areaResult.breakdown.instructional.length} rooms)
                  </span>
                </div>
                <div className="flex justify-between">
                  <span className="text-slate-500">Administrative Area:</span>
                  <span className="font-semibold text-slate-800 dark:text-slate-200">
                    {areaResult.totalAdministrativeArea} sq.m ({areaResult.breakdown.administrative.length} rooms)
                  </span>
                </div>
                {areaResult.breakdown.other.length > 0 && (
                  <div className="flex justify-between text-slate-400">
                    <span>Other Areas (Excluded):</span>
                    <span>{areaResult.breakdown.other.length} rooms</span>
                  </div>
                )}
                <div className="flex justify-between pt-1 border-t border-dashed border-slate-200 dark:border-slate-700 font-semibold">
                  <span className="text-slate-500">Margin:</span>
                  <span
                    className={
                      areaResult.deficitOrSurplus >= 0
                        ? "text-emerald-600 dark:text-emerald-400"
                        : "text-rose-600 dark:text-rose-400"
                    }
                  >
                    {areaResult.deficitOrSurplus >= 0
                      ? `+${areaResult.deficitOrSurplus} sq.m (Surplus)`
                      : `${areaResult.deficitOrSurplus} sq.m (Deficit)`}
                  </span>
                </div>
              </div>
            </div>
          </div>
        </aside>
      </div>
    </div>
  );
}
