/**
 * Compliance validation utilities for educational institutions.
 * Standard norms follow regulatory accreditation benchmarks (e.g., 1:20 FSR, minimum built-up area thresholds).
 */

export interface Facility {
  id?: string;
  institutionId?: string;
  roomType: string;
  areaSqM: number;
  seatingCapacity?: number;
  isBarrierFree?: boolean;
}

export interface FacultyStudentRatioResult {
  ratio: number;
  isCompliant: boolean;
  threshold: number;
  studentToFacultyRatio?: number;
}

export interface BuiltUpAreaValidationResult {
  totalInstructionalArea: number;
  totalAdministrativeArea: number;
  totalValidArea: number;
  requiredThreshold: number;
  isCompliant: boolean;
  deficitOrSurplus: number;
  breakdown: {
    instructional: Facility[];
    administrative: Facility[];
    other: Facility[];
  };
}

const INSTRUCTIONAL_ROOM_TYPES = new Set([
  "classroom",
  "class_room",
  "tutorial_room",
  "laboratory",
  "lab",
  "workshop",
  "drawing_hall",
  "seminar_hall",
  "computer_center",
  "computer_centre",
  "library",
  "instructional",
]);

const ADMINISTRATIVE_ROOM_TYPES = new Set([
  "principal_office",
  "director_office",
  "board_room",
  "admin_office",
  "administrative_office",
  "office",
  "faculty_room",
  "hod_cabin",
  "department_office",
  "central_store",
  "store",
  "examination_control_office",
  "administrative",
]);

function normalizeRoomType(roomType: string): string {
  return roomType
    .trim()
    .toLowerCase()
    .replace(/[\s-]+/g, "_");
}

/**
 * 1. calculateFacultyStudentRatio
 * Calculates faculty to student ratio and checks against 1:20 (0.05) threshold.
 *
 * @param totalIntake Total approved student intake / enrollment
 * @param facultyCount Number of qualified full-time faculty members
 * @returns { ratio: number, isCompliant: boolean }
 */
export function calculateFacultyStudentRatio(
  totalIntake: number,
  facultyCount: number
): FacultyStudentRatioResult {
  const THRESHOLD = 0.05; // 1 faculty per 20 students (1:20)

  if (totalIntake < 0 || facultyCount < 0) {
    return {
      ratio: 0,
      isCompliant: false,
      threshold: THRESHOLD,
    };
  }

  if (totalIntake === 0) {
    return {
      ratio: facultyCount > 0 ? 1 : 0,
      isCompliant: true,
      threshold: THRESHOLD,
      studentToFacultyRatio: 0,
    };
  }

  const rawRatio = facultyCount / totalIntake;
  // Round to 4 decimal places for precision display
  const roundedRatio = Math.round(rawRatio * 10000) / 10000;
  const isCompliant = rawRatio >= THRESHOLD - 1e-9;
  const studentToFacultyRatio = facultyCount > 0 ? Math.round((totalIntake / facultyCount) * 100) / 100 : Infinity;

  return {
    ratio: roundedRatio,
    isCompliant,
    threshold: THRESHOLD,
    studentToFacultyRatio,
  };
}

/**
 * 2. validateBuiltUpArea
 * Calculates total instructional and administrative area and compares against a threshold parameter.
 *
 * @param facilities List of institution facilities
 * @param mockThreshold Mock required area threshold in square meters (default 1000 sq.m)
 * @returns BuiltUpAreaValidationResult
 */
export function validateBuiltUpArea(
  facilities: Facility[],
  mockThreshold: number = 1000
): BuiltUpAreaValidationResult {
  const breakdown: BuiltUpAreaValidationResult["breakdown"] = {
    instructional: [],
    administrative: [],
    other: [],
  };

  let totalInstructionalArea = 0;
  let totalAdministrativeArea = 0;

  for (const facility of facilities) {
    const area = Number(facility.areaSqM) || 0;
    const normalizedType = normalizeRoomType(facility.roomType);

    if (INSTRUCTIONAL_ROOM_TYPES.has(normalizedType)) {
      totalInstructionalArea += area;
      breakdown.instructional.push(facility);
    } else if (ADMINISTRATIVE_ROOM_TYPES.has(normalizedType)) {
      totalAdministrativeArea += area;
      breakdown.administrative.push(facility);
    } else {
      breakdown.other.push(facility);
    }
  }

  // Round values to 2 decimal places to avoid floating point imprecision
  totalInstructionalArea = Math.round(totalInstructionalArea * 100) / 100;
  totalAdministrativeArea = Math.round(totalAdministrativeArea * 100) / 100;
  const totalValidArea = Math.round((totalInstructionalArea + totalAdministrativeArea) * 100) / 100;

  const isCompliant = totalValidArea >= mockThreshold;
  const deficitOrSurplus = Math.round((totalValidArea - mockThreshold) * 100) / 100;

  return {
    totalInstructionalArea,
    totalAdministrativeArea,
    totalValidArea,
    requiredThreshold: mockThreshold,
    isCompliant,
    deficitOrSurplus,
    breakdown,
  };
}
