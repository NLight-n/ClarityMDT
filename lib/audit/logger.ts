import { prisma } from "@/lib/prisma";

export enum AuditAction {
  LOGIN = "LOGIN",
  CASE_SUBMIT = "CASE_SUBMIT",
  CASE_UPDATE = "CASE_UPDATE",
  CASE_DELETE = "CASE_DELETE",
  CONSENSUS_CREATE = "CONSENSUS_CREATE",
  CONSENSUS_EDIT = "CONSENSUS_EDIT",
  COORDINATOR_ASSIGN = "COORDINATOR_ASSIGN",
  COORDINATOR_REVOKE = "COORDINATOR_REVOKE",
  // User CRUD operations
  USER_CREATE = "USER_CREATE",
  USER_UPDATE = "USER_UPDATE",
  USER_DELETE = "USER_DELETE",
  // Department CRUD operations
  DEPARTMENT_CREATE = "DEPARTMENT_CREATE",
  DEPARTMENT_UPDATE = "DEPARTMENT_UPDATE",
  DEPARTMENT_DELETE = "DEPARTMENT_DELETE",
  // Hospital Settings operations
  HOSPITAL_SETTINGS_UPDATE = "HOSPITAL_SETTINGS_UPDATE",
}

interface AuditLogData {
  action: AuditAction;
  userId: string;
  caseId?: string;
  targetUserId?: string;
  details?: Record<string, any>;
  ipAddress?: string;
}

/**
 * Create an audit log entry
 */
export async function createAuditLog(data: AuditLogData): Promise<void> {
  try {
    await prisma.auditLog.create({
      data: {
        action: data.action,
        userId: data.userId,
        caseId: data.caseId || null,
        targetUserId: data.targetUserId || null,
        details: data.details ? JSON.stringify(data.details) : null,
        ipAddress: data.ipAddress || null,
      },
    });
  } catch (error) {
    // Log error but don't throw - audit logging should not break the main flow
    console.error("Error creating audit log:", error);
  }
}

/**
 * Get IP address from request headers
 */
export function getIpAddress(headers: Headers): string | undefined {
  // Check various headers for IP address
  const forwarded = headers.get("x-forwarded-for");
  if (forwarded) {
    return forwarded.split(",")[0].trim();
  }

  const realIp = headers.get("x-real-ip");
  if (realIp) {
    return realIp;
  }

  return undefined;
}

