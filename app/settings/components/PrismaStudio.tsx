"use client";

import { useSession } from "next-auth/react";
import { Database, ExternalLink } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { isAdmin } from "@/lib/permissions/client";

export function PrismaStudio() {
  const { data: session } = useSession();

  const user = session?.user
    ? {
        id: session.user.id,
        role: session.user.role,
        departmentId: session.user.departmentId,
      }
    : null;

  const canManage = user && isAdmin(user);

  if (!canManage) {
    return (
      <Card>
        <CardContent className="p-6">
          <p className="text-muted-foreground">
            Only administrators can access Prisma Studio.
          </p>
        </CardContent>
      </Card>
    );
  }

  return (
    <Card>
      <CardHeader>
        <div className="flex flex-col gap-3 lg:flex-row lg:items-start lg:justify-between">
          <div className="space-y-1">
            <CardTitle className="flex items-center gap-2">
              <Database className="h-5 w-5" />
              Prisma Studio
            </CardTitle>
            <CardDescription>
              Direct database management for administrators.
            </CardDescription>
          </div>
          <Button asChild variant="outline">
            <a href="/admin/prisma-studio/" target="_blank" rel="noreferrer">
              <ExternalLink className="mr-2 h-4 w-4" />
              Open in New Tab
            </a>
          </Button>
        </div>
      </CardHeader>
      <CardContent className="space-y-4">
        <div className="rounded-md border border-amber-200 bg-amber-50 p-3 text-sm text-amber-900">
          Prisma Studio can edit production database records directly. Review changes carefully before saving.
        </div>
        <div className="h-[75vh] min-h-[640px] overflow-hidden rounded-md border bg-background">
          <iframe
            src="/admin/prisma-studio/"
            title="Prisma Studio"
            className="h-full w-full"
          />
        </div>
      </CardContent>
    </Card>
  );
}
