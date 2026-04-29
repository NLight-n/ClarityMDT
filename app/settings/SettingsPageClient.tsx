"use client";

import { useSession } from "next-auth/react";
import { useSearchParams, useRouter } from "next/navigation";
import { useEffect } from "react";
import { Tabs, TabsList, TabsTrigger, TabsContent } from "@/components/ui/tabs";
import { UserProfile } from "./components/UserProfile";
import { UserManagement } from "./components/UserManagement";
import { DepartmentManagement } from "./components/DepartmentManagement";
import { HospitalSettings } from "./components/HospitalSettings";
import { TelegramSettings } from "./components/TelegramSettings";
import { WhatsappSettings } from "./components/WhatsappSettings";
import { EmailSettings } from "./components/EmailSettings";
import { AuditLogging } from "./components/AuditLogging";
import { Backup } from "./components/Backup";
import { NotificationSettings } from "./components/NotificationSettings";
import { StorageManagement } from "./components/StorageManagement";
import { About } from "./components/About";
import { PrismaStudio } from "./components/PrismaStudio";
import { isAdmin, isCoordinator } from "@/lib/permissions/client";

export function SettingsPageClient() {
  const { data: session } = useSession();
  const searchParams = useSearchParams();
  const router = useRouter();
  
  const user = session?.user
    ? {
        id: session.user.id,
        role: session.user.role,
        departmentId: session.user.departmentId,
      }
    : null;

  const isUserAdmin = user && isAdmin(user);
  const isUserCoordinator = user && isCoordinator(user);
  
  // Get active tab from URL or default to profile
  const activeTab = searchParams.get("tab") || "profile";

  // Handle tab change
  const handleTabChange = (value: string) => {
    const params = new URLSearchParams(searchParams.toString());
    params.set("tab", value);
    router.push(`/settings?${params.toString()}`);
  };

  // Validate tab access and redirect if needed
  useEffect(() => {
    const validTabs = ["profile", "notifications", "about"];
    if (isUserAdmin) {
      validTabs.push("users", "admin", "audit", "backup", "storage");
    }
    if (isUserCoordinator) {
      validTabs.push("users", "departments", "audit", "storage");
    }

    if (activeTab && !validTabs.includes(activeTab)) {
      router.push("/settings?tab=profile");
    }
  }, [activeTab, isUserAdmin, isUserCoordinator, router]);
  
  // Get admin sub-tab from URL or default to hospital
  const adminSubTab = searchParams.get("adminTab") || "hospital";

  return (
    <div className="container mx-auto p-6 space-y-6">
      <div>
        <h1 className="text-3xl font-bold">Settings</h1>
        <p className="text-muted-foreground">Manage your profile and application settings</p>
      </div>

      <Tabs value={activeTab} onValueChange={handleTabChange} className="w-full">
        <TabsList className="inline-flex w-full lg:w-auto flex-wrap">
          <TabsTrigger value="profile">User Profile</TabsTrigger>
          <TabsTrigger value="notifications">Notifications</TabsTrigger>
          <TabsTrigger value="about">About</TabsTrigger>
          {(isUserAdmin || isUserCoordinator) && <TabsTrigger value="users">User Management</TabsTrigger>}
          {isUserCoordinator && <TabsTrigger value="departments">Department Management</TabsTrigger>}
          {isUserAdmin && <TabsTrigger value="admin">Admin</TabsTrigger>}
          {(isUserAdmin || isUserCoordinator) && <TabsTrigger value="audit">Audit Logging</TabsTrigger>}
          {(isUserAdmin || isUserCoordinator) && <TabsTrigger value="storage">Storage</TabsTrigger>}
          {isUserAdmin && <TabsTrigger value="backup">Backup</TabsTrigger>}
        </TabsList>

        <TabsContent value="profile" className="mt-6">
          <UserProfile />
        </TabsContent>

        <TabsContent value="notifications" className="mt-6">
          <NotificationSettings />
        </TabsContent>

        <TabsContent value="about" className="mt-6">
          <About />
        </TabsContent>

        {(isUserAdmin || isUserCoordinator) && (
          <TabsContent value="users" className="mt-6">
            <UserManagement />
          </TabsContent>
        )}

        {isUserCoordinator && (
          <TabsContent value="departments" className="mt-6">
            <DepartmentManagement />
          </TabsContent>
        )}

        {isUserAdmin && (
          <TabsContent value="admin" className="mt-6">
            <Tabs value={adminSubTab} onValueChange={(value) => {
              const params = new URLSearchParams(searchParams.toString());
              params.set("adminTab", value);
              router.push(`/settings?tab=admin&${params.toString()}`);
            }} className="w-full">
              <TabsList className="inline-flex w-full lg:w-auto flex-wrap">
                <TabsTrigger value="hospital">Hospital Settings</TabsTrigger>
                <TabsTrigger value="telegram">Telegram Settings</TabsTrigger>
                <TabsTrigger value="whatsapp">WhatsApp Settings</TabsTrigger>
                <TabsTrigger value="email">Email Settings</TabsTrigger>
                <TabsTrigger value="database">Database</TabsTrigger>
              </TabsList>
              
              <TabsContent value="hospital" className="mt-6">
                <HospitalSettings />
              </TabsContent>
              
              <TabsContent value="telegram" className="mt-6">
                <TelegramSettings />
              </TabsContent>

              <TabsContent value="whatsapp" className="mt-6">
                <WhatsappSettings />
              </TabsContent>
              
              <TabsContent value="email" className="mt-6">
                <EmailSettings />
              </TabsContent>

              <TabsContent value="database" className="mt-6">
                <PrismaStudio />
              </TabsContent>

            </Tabs>
          </TabsContent>
        )}

        {(isUserAdmin || isUserCoordinator) && (
          <TabsContent value="audit" className="mt-6">
            <AuditLogging />
          </TabsContent>
        )}

        {(isUserAdmin || isUserCoordinator) && (
          <TabsContent value="storage" className="mt-6">
            <StorageManagement />
          </TabsContent>
        )}

        {isUserAdmin && (
          <TabsContent value="backup" className="mt-6">
            <Backup />
          </TabsContent>
        )}
      </Tabs>
    </div>
  );
}
