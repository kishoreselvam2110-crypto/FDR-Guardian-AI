import { describe, it } from "node:test";
import assert from "node:assert/strict";
import {
  calculateFacultyStudentRatio,
  validateBuiltUpArea,
} from "../compliance.ts";
import type { Facility } from "../compliance.ts";

describe("Compliance Module - Faculty-Student Ratio (FSR)", () => {
  it("should validate exact 1:20 (0.05) threshold as compliant", () => {
    const result = calculateFacultyStudentRatio(100, 5);
    assert.strictEqual(result.ratio, 0.05);
    assert.strictEqual(result.isCompliant, true);
    assert.strictEqual(result.threshold, 0.05);
    assert.strictEqual(result.studentToFacultyRatio, 20);
  });

  it("should validate better than 1:20 ratio (> 0.05) as compliant", () => {
    // 10 faculty for 100 students = 1:10 (0.10)
    const result = calculateFacultyStudentRatio(100, 10);
    assert.strictEqual(result.ratio, 0.1);
    assert.strictEqual(result.isCompliant, true);
    assert.strictEqual(result.studentToFacultyRatio, 10);
  });

  it("should flag ratio below 1:20 (< 0.05) as non-compliant", () => {
    // 4 faculty for 100 students = 1:25 (0.04)
    const result = calculateFacultyStudentRatio(100, 4);
    assert.strictEqual(result.ratio, 0.04);
    assert.strictEqual(result.isCompliant, false);
    assert.strictEqual(result.studentToFacultyRatio, 25);
  });

  it("should accurately test realistic college intake scenario (1200 students)", () => {
    // 60 faculty for 1200 students is exactly 1:20
    const compliant = calculateFacultyStudentRatio(1200, 60);
    assert.strictEqual(compliant.isCompliant, true);
    assert.strictEqual(compliant.ratio, 0.05);

    // 59 faculty for 1200 students is 1:20.34 (0.0492) -> non-compliant
    const nonCompliant = calculateFacultyStudentRatio(1200, 59);
    assert.strictEqual(nonCompliant.isCompliant, false);
    assert.strictEqual(nonCompliant.ratio < 0.05, true);
  });

  it("should handle zero faculty gracefully", () => {
    const result = calculateFacultyStudentRatio(200, 0);
    assert.strictEqual(result.ratio, 0);
    assert.strictEqual(result.isCompliant, false);
  });

  it("should handle zero intake gracefully", () => {
    const result = calculateFacultyStudentRatio(0, 5);
    assert.strictEqual(result.isCompliant, true);
    assert.strictEqual(result.ratio, 1);
  });

  it("should reject negative inputs gracefully", () => {
    const result = calculateFacultyStudentRatio(-100, 5);
    assert.strictEqual(result.isCompliant, false);
    assert.strictEqual(result.ratio, 0);
  });
});

describe("Compliance Module - Built-Up Area Validation", () => {
  const sampleFacilities: Facility[] = [
    { roomType: "Classroom", areaSqM: 400, seatingCapacity: 60 },
    { roomType: "Laboratory", areaSqM: 350, seatingCapacity: 30 },
    { roomType: "Seminar Hall", areaSqM: 150, seatingCapacity: 120 },
    { roomType: "Principal Office", areaSqM: 50 },
    { roomType: "Department Office", areaSqM: 80 },
    { roomType: "Faculty Room", areaSqM: 120 },
    { roomType: "Cafeteria", areaSqM: 200 }, // amenities - should not count as instructional/admin
    { roomType: "Corridor", areaSqM: 300 }, // circulation - should not count
  ];

  it("should correctly sum instructional and administrative areas while ignoring other areas", () => {
    const result = validateBuiltUpArea(sampleFacilities, 1000);

    // Instructional: Classroom (400) + Laboratory (350) + Seminar Hall (150) = 900
    assert.strictEqual(result.totalInstructionalArea, 900);

    // Administrative: Principal Office (50) + Department Office (80) + Faculty Room (120) = 250
    assert.strictEqual(result.totalAdministrativeArea, 250);

    // Total Valid: 900 + 250 = 1150
    assert.strictEqual(result.totalValidArea, 1150);
  });

  it("should validate compliance when total valid area meets or exceeds threshold", () => {
    const result = validateBuiltUpArea(sampleFacilities, 1100);
    assert.strictEqual(result.isCompliant, true);
    assert.strictEqual(result.requiredThreshold, 1100);
    assert.strictEqual(result.deficitOrSurplus, 50); // 1150 - 1100 = +50
  });

  it("should flag non-compliance when total valid area is below threshold", () => {
    const result = validateBuiltUpArea(sampleFacilities, 1500);
    assert.strictEqual(result.isCompliant, false);
    assert.strictEqual(result.requiredThreshold, 1500);
    assert.strictEqual(result.deficitOrSurplus, -350); // 1150 - 1500 = -350
  });

  it("should categorize facilities properly in the breakdown", () => {
    const result = validateBuiltUpArea(sampleFacilities, 1000);
    assert.strictEqual(result.breakdown.instructional.length, 3);
    assert.strictEqual(result.breakdown.administrative.length, 3);
    assert.strictEqual(result.breakdown.other.length, 2);
  });

  it("should normalize room type casing, hyphens, and whitespace", () => {
    const facilities: Facility[] = [
      { roomType: "CLASS_ROOM", areaSqM: 100 },
      { roomType: "computer-center", areaSqM: 150 },
      { roomType: "  director office  ", areaSqM: 60 },
    ];
    const result = validateBuiltUpArea(facilities, 300);
    assert.strictEqual(result.totalInstructionalArea, 250);
    assert.strictEqual(result.totalAdministrativeArea, 60);
    assert.strictEqual(result.totalValidArea, 310);
    assert.strictEqual(result.isCompliant, true);
  });

  it("should handle empty facilities array", () => {
    const result = validateBuiltUpArea([], 500);
    assert.strictEqual(result.totalInstructionalArea, 0);
    assert.strictEqual(result.totalAdministrativeArea, 0);
    assert.strictEqual(result.totalValidArea, 0);
    assert.strictEqual(result.isCompliant, false);
    assert.strictEqual(result.deficitOrSurplus, -500);
  });
});
