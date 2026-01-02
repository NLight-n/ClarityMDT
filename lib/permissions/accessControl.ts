import { Role, CaseStatus } from "@prisma/client";
import { prisma } from "@/lib/prisma";

// User type based on session
export interface User {
  id: string;
  role: Role;
  departmentId: string | null;
}

// Extended user type for database operations
export interface UserWithPreviousRole extends User {
  previousRole: Role | null;
}

/**
 * Check if user is an Admin
 */
export function isAdmin(user: User | null | undefined): boolean {
  return user?.role === Role.Admin;
}

/**
 * Check if user is a Coordinator (includes Admin as they have coordinator permissions)
 */
export function isCoordinator(user: User | null | undefined): boolean {
  return user?.role === Role.Coordinator || user?.role === Role.Admin;
}

/**
 * Check if user is a Consultant
 */
export function isConsultant(user: User | null | undefined): boolean {
  return user?.role === Role.Consultant;
}

/**
 * Check if user is a Viewer
 */
export function isViewer(user: User | null | undefined): boolean {
  return user?.role === Role.Viewer;
}

/**
 * Assign Coordinator role to a user
 * Stores the user's current role in previousRole field
 */
export async function assignCoordinator(userId: string): Promise<void> {
  const user = await prisma.user.findUnique({
    where: { id: userId },
  });

  if (!user) {
    throw new Error("User not found");
  }

  // Only Consultant or Viewer can be promoted to Coordinator
  if (user.role !== Role.Consultant && user.role !== Role.Viewer) {
    throw new Error("Only Consultant or Viewer can be promoted to Coordinator");
  }

  await prisma.user.update({
    where: { id: userId },
    data: {
      previousRole: user.role,
      role: Role.Coordinator,
    },
  });
}

/**
 * Revoke Coordinator role from a user
 * Restores the user's previousRole
 */
export async function revokeCoordinator(userId: string): Promise<void> {
  const user = await prisma.user.findUnique({
    where: { id: userId },
  });

  if (!user) {
    throw new Error("User not found");
  }

  if (user.role !== Role.Coordinator) {
    throw new Error("User is not a Coordinator");
  }

  if (!user.previousRole) {
    throw new Error("Previous role not found. Cannot revoke coordinator role.");
  }

  // Only restore Consultant or Viewer roles
  if (user.previousRole !== Role.Consultant && user.previousRole !== Role.Viewer) {
    throw new Error("Invalid previous role");
  }

  await prisma.user.update({
    where: { id: userId },
    data: {
      role: user.previousRole,
      previousRole: null,
    },
  });
}

/**
 * Check if user can edit a case
 * - Admin: can edit all cases
 * - Coordinator: can edit all cases
 * - Consultant: can edit cases in their own department or cases they created
 * - Viewer: cannot edit cases
 */
export async function canEditCase(
  user: User | null | undefined,
  caseId: string
): Promise<boolean> {
  if (!user) return false;

  // Admin and Coordinator can edit all cases
  if (isCoordinator(user)) {
    return true;
  }

  // Viewer cannot edit cases
  if (isViewer(user)) {
    return false;
  }

  // Consultant can edit cases in their own department or cases they created
  if (isConsultant(user)) {
    const caseRecord = await prisma.case.findUnique({
      where: { id: caseId },
      select: {
        presentingDepartmentId: true,
        createdById: true,
      },
    });

    if (!caseRecord) return false;

    // Can edit if they created it or it's in their department
    return (
      caseRecord.createdById === user.id ||
      (!!user.departmentId && caseRecord.presentingDepartmentId === user.departmentId)
    );
  }

  return false;
}

/**
 * Check if user can edit a specialist opinion
 * - Admin: can edit any opinion
 * - Coordinator: can edit any opinion
 * - Consultant: can edit their own opinions only
 * - Viewer: cannot edit opinions
 */
export async function canEditOpinion(
  user: User | null | undefined,
  opinionId: string
): Promise<boolean> {
  if (!user) return false;

  // Admin and Coordinator can edit any opinion
  if (isCoordinator(user)) {
    return true;
  }

  // Viewer cannot edit opinions
  if (isViewer(user)) {
    return false;
  }

  // Consultant can only edit their own opinions
  if (isConsultant(user)) {
    const opinion = await prisma.specialistsOpinion.findUnique({
      where: { id: opinionId },
      select: {
        consultantId: true,
      },
    });

    return opinion?.consultantId === user.id;
  }

  return false;
}

/**
 * Check if user can edit radiology findings
 * - Admin: can edit radiology findings
 * - Coordinator: can edit radiology findings
 * - Consultant: can edit if they are from Radiology department
 * - Viewer: cannot edit radiology findings
 */
export async function canEditRadiologyFindings(
  user: User | null | undefined,
  caseId: string
): Promise<boolean> {
  if (!user) return false;

  // Admin and Coordinator can edit
  if (isCoordinator(user)) {
    return true;
  }

  // Viewer cannot edit
  if (isViewer(user)) {
    return false;
  }

  // Consultant can edit if they are from Radiology department
  if (isConsultant(user) && user.departmentId) {
    const department = await prisma.department.findUnique({
      where: { id: user.departmentId },
      select: { name: true },
    });

    // Check if department name contains "Radiology" (case-insensitive)
    return department?.name.toLowerCase().includes("radiology") ?? false;
  }

  return false;
}

/**
 * Check if user can edit pathology findings
 * - Admin: can edit pathology findings
 * - Coordinator: can edit pathology findings
 * - Consultant: can edit if they are from Pathology department
 * - Viewer: cannot edit pathology findings
 */
export async function canEditPathologyFindings(
  user: User | null | undefined,
  caseId: string
): Promise<boolean> {
  if (!user) return false;

  // Admin and Coordinator can edit
  if (isCoordinator(user)) {
    return true;
  }

  // Viewer cannot edit
  if (isViewer(user)) {
    return false;
  }

  // Consultant can edit if they are from Pathology department
  if (isConsultant(user) && user.departmentId) {
    const department = await prisma.department.findUnique({
      where: { id: user.departmentId },
      select: { name: true },
    });

    // Check if department name contains "Pathology" (case-insensitive)
    return department?.name.toLowerCase().includes("pathology") ?? false;
  }

  return false;
}

/**
 * Check if user can add/edit consensus report
 * - Admin: can add/edit consensus reports
 * - Coordinator: can add/edit consensus reports
 * - Consultant: cannot add/edit consensus reports
 * - Viewer: cannot add/edit consensus reports
 */
export function canEditConsensusReport(user: User | null | undefined): boolean {
  if (!user) return false;
  return isCoordinator(user);
}

/**
 * Check if user can view a case
 * - Admin: can view all cases
 * - Coordinator: can view all cases
 * - Viewer: can view all cases
 * - Consultant: 
 *   - Can view cases assigned to a meeting (all cases in meetings are viewable by everyone)
 *   - Can view draft cases only if they are in their own department
 */
export async function canViewCase(
  user: User | null | undefined,
  caseId: string
): Promise<boolean> {
  if (!user) return false;

  // Admin, Coordinator, and Viewer can view all cases
  if (isAdmin(user) || isCoordinator(user) || isViewer(user)) {
    return true;
  }

  // Consultant: check case details
  if (isConsultant(user)) {
    const caseRecord = await prisma.case.findUnique({
      where: { id: caseId },
      select: {
        status: true,
        presentingDepartmentId: true,
        assignedMeetingId: true,
      },
    });

    if (!caseRecord) return false;

    // If case is assigned to a meeting, everyone can view it
    if (caseRecord.assignedMeetingId) {
      return true;
    }

    // For draft cases (not assigned to meeting), only same department can view
    if (caseRecord.status === CaseStatus.DRAFT && user.departmentId) {
      return caseRecord.presentingDepartmentId === user.departmentId;
    }

    // For submitted/reviewed cases not assigned to meeting, check department
    if (user.departmentId) {
      return caseRecord.presentingDepartmentId === user.departmentId;
    }
  }

  return false;
}

/**
 * Check if user can add a specialist opinion
 * - Admin: can add opinions (but typically won't)
 * - Coordinator: can add opinions (but typically won't)
 * - Consultant: can add opinions
 * - Viewer: cannot add opinions
 */
export function canAddOpinion(user: User | null | undefined): boolean {
  if (!user) return false;
  return isConsultant(user) || isCoordinator(user);
}

