import { Role } from "@prisma/client";

// Client-safe permission checks (no database access)
// These can be used in client components

export interface User {
  id: string;
  role: Role;
  departmentId: string | null;
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

