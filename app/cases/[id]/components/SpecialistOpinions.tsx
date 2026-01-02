"use client";

import { useState, useEffect } from "react";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import { Textarea } from "@/components/ui/textarea";
import { Label } from "@/components/ui/label";
import { format } from "date-fns";
import { Plus, Edit, Loader2 } from "lucide-react";
import { useSession } from "next-auth/react";
import { canAddOpinion, isCoordinator } from "@/lib/permissions/client";

interface Opinion {
  id: string;
  consultant: {
    id: string;
    name: string;
    loginId?: string;
  };
  department: {
    id: string;
    name: string;
  };
  opinionText: string;
  createdAt: string;
  updatedAt: string;
}

interface SpecialistOpinionsProps {
  caseId: string;
  opinions: Opinion[];
  onRefresh?: () => void;
}

export function SpecialistOpinions({
  caseId,
  opinions,
  onRefresh,
}: SpecialistOpinionsProps) {
  const { data: session } = useSession();
  const [groupedOpinions, setGroupedOpinions] = useState<
    Record<string, Opinion[]>
  >({});
  const [isAddDialogOpen, setIsAddDialogOpen] = useState(false);
  const [isEditDialogOpen, setIsEditDialogOpen] = useState(false);
  const [editingOpinion, setEditingOpinion] = useState<Opinion | null>(null);
  const [opinionText, setOpinionText] = useState("");
  const [submitting, setSubmitting] = useState(false);
  const [editableOpinions, setEditableOpinions] = useState<Set<string>>(
    new Set()
  );

  useEffect(() => {
    // Group opinions by department
    const grouped: Record<string, Opinion[]> = {};
    opinions.forEach((opinion) => {
      const deptName = opinion.department.name;
      if (!grouped[deptName]) {
        grouped[deptName] = [];
      }
      grouped[deptName].push(opinion);
    });
    setGroupedOpinions(grouped);
  }, [opinions]);

  useEffect(() => {
    // Check which opinions can be edited by the current user
    const checkEditPermissions = async () => {
      if (!session?.user) return;

      const editableIds = new Set<string>();
      const user = {
        id: session.user.id,
        role: session.user.role,
        departmentId: session.user.departmentId,
      };

      // Coordinators can edit all opinions
      if (isCoordinator(user)) {
        opinions.forEach((opinion) => editableIds.add(opinion.id));
      } else {
        // Consultants can only edit their own opinions
        opinions.forEach((opinion) => {
          if (opinion.consultant.id === user.id) {
            editableIds.add(opinion.id);
          }
        });
      }

      setEditableOpinions(editableIds);
    };

    checkEditPermissions();
  }, [opinions, session?.user]);

  const user = session?.user
    ? {
        id: session.user.id,
        role: session.user.role,
        departmentId: session.user.departmentId,
      }
    : null;

  const canAdd = user && canAddOpinion(user);

  const handleOpenAddDialog = () => {
    setOpinionText("");
    setIsAddDialogOpen(true);
  };

  const handleCloseAddDialog = () => {
    setIsAddDialogOpen(false);
    setOpinionText("");
  };

  const handleOpenEditDialog = (opinion: Opinion) => {
    setEditingOpinion(opinion);
    setOpinionText(opinion.opinionText);
    setIsEditDialogOpen(true);
  };

  const handleCloseEditDialog = () => {
    setIsEditDialogOpen(false);
    setEditingOpinion(null);
    setOpinionText("");
  };

  const handleAddOpinion = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!opinionText.trim()) return;

    setSubmitting(true);
    try {
      const response = await fetch(`/api/opinions/${caseId}`, {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
        },
        body: JSON.stringify({
          opinionText: opinionText.trim(),
        }),
      });

      if (response.ok) {
        handleCloseAddDialog();
        onRefresh?.();
      } else {
        const error = await response.json();
        alert(error.error || "Failed to add opinion");
      }
    } catch (error) {
      console.error("Error adding opinion:", error);
      alert("An error occurred. Please try again.");
    } finally {
      setSubmitting(false);
    }
  };

  const handleEditOpinion = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!editingOpinion || !opinionText.trim()) return;

    setSubmitting(true);
    try {
      const response = await fetch(`/api/opinions/edit/${editingOpinion.id}`, {
        method: "PATCH",
        headers: {
          "Content-Type": "application/json",
        },
        body: JSON.stringify({
          opinionText: opinionText.trim(),
        }),
      });

      if (response.ok) {
        handleCloseEditDialog();
        onRefresh?.();
      } else {
        const error = await response.json();
        alert(error.error || "Failed to update opinion");
      }
    } catch (error) {
      console.error("Error updating opinion:", error);
      alert("An error occurred. Please try again.");
    } finally {
      setSubmitting(false);
    }
  };

  return (
    <>
      <Card>
        <CardHeader className="pt-3 pb-2">
          <div className="flex items-center justify-between">
            <CardTitle>Specialist Opinions</CardTitle>
            {canAdd && (
              <Button size="sm" onClick={handleOpenAddDialog}>
                <Plus className="mr-2 h-4 w-4" />
                Add Opinion
              </Button>
            )}
          </div>
        </CardHeader>
        <CardContent className="pt-2 pb-3 space-y-6">
          {Object.keys(groupedOpinions).length === 0 ? (
            <p className="text-muted-foreground text-center py-4">
              No specialist opinions yet
            </p>
          ) : (
            Object.entries(groupedOpinions).map(([department, deptOpinions]) => (
              <div key={department} className="space-y-3">
                <h3 className="font-semibold text-lg">{department}</h3>
                {deptOpinions.map((opinion) => (
                  <div
                    key={opinion.id}
                    className="border rounded-lg p-4 space-y-2"
                  >
                    <div className="flex items-center justify-between">
                      <div className="flex items-center gap-2">
                        <span className="font-medium">
                          {opinion.consultant.name}
                        </span>
                        <Badge variant="outline">
                          {opinion.department.name}
                        </Badge>
                      </div>
                      <div className="text-sm text-muted-foreground">
                        {format(
                          new Date(opinion.createdAt),
                          "MMM dd, yyyy HH:mm"
                        )}
                        {opinion.updatedAt !== opinion.createdAt && (
                          <span className="ml-2 text-xs">
                            (edited{" "}
                            {format(
                              new Date(opinion.updatedAt),
                              "MMM dd, yyyy HH:mm"
                            )}
                            )
                          </span>
                        )}
                      </div>
                    </div>
                    <p className="whitespace-pre-wrap text-sm">
                      {opinion.opinionText}
                    </p>
                    {editableOpinions.has(opinion.id) && (
                      <div className="flex justify-end">
                        <Button
                          variant="ghost"
                          size="sm"
                          onClick={() => handleOpenEditDialog(opinion)}
                        >
                          <Edit className="mr-2 h-4 w-4" />
                          Edit
                        </Button>
                      </div>
                    )}
                  </div>
                ))}
              </div>
            ))
          )}
        </CardContent>
      </Card>

      {/* Add Opinion Dialog */}
      <Dialog open={isAddDialogOpen} onOpenChange={setIsAddDialogOpen}>
        <DialogContent>
          <form onSubmit={handleAddOpinion}>
            <DialogHeader>
              <DialogTitle>Add Specialist Opinion</DialogTitle>
              <DialogDescription>
                Add your specialist opinion for this case. Your department will
                be automatically associated with this opinion.
              </DialogDescription>
            </DialogHeader>
            <div className="space-y-4 py-4">
              <div className="space-y-2">
                <Label htmlFor="opinion-text">Opinion</Label>
                <Textarea
                  id="opinion-text"
                  value={opinionText}
                  onChange={(e) => setOpinionText(e.target.value)}
                  placeholder="Enter your specialist opinion..."
                  rows={8}
                  required
                  disabled={submitting}
                />
              </div>
            </div>
            <DialogFooter>
              <Button
                type="button"
                variant="outline"
                onClick={handleCloseAddDialog}
                disabled={submitting}
              >
                Cancel
              </Button>
              <Button type="submit" disabled={submitting || !opinionText.trim()}>
                {submitting ? (
                  <>
                    <Loader2 className="mr-2 h-4 w-4 animate-spin" />
                    Adding...
                  </>
                ) : (
                  "Add Opinion"
                )}
              </Button>
            </DialogFooter>
          </form>
        </DialogContent>
      </Dialog>

      {/* Edit Opinion Dialog */}
      <Dialog open={isEditDialogOpen} onOpenChange={setIsEditDialogOpen}>
        <DialogContent>
          <form onSubmit={handleEditOpinion}>
            <DialogHeader>
              <DialogTitle>Edit Specialist Opinion</DialogTitle>
              <DialogDescription>
                Update the specialist opinion. Only the author, coordinators,
                and admins can edit opinions.
              </DialogDescription>
            </DialogHeader>
            <div className="space-y-4 py-4">
              {editingOpinion && (
                <div className="space-y-2">
                  <div className="text-sm text-muted-foreground">
                    <span className="font-medium">Consultant:</span>{" "}
                    {editingOpinion.consultant.name}
                  </div>
                  <div className="text-sm text-muted-foreground">
                    <span className="font-medium">Department:</span>{" "}
                    {editingOpinion.department.name}
                  </div>
                </div>
              )}
              <div className="space-y-2">
                <Label htmlFor="edit-opinion-text">Opinion</Label>
                <Textarea
                  id="edit-opinion-text"
                  value={opinionText}
                  onChange={(e) => setOpinionText(e.target.value)}
                  placeholder="Enter your specialist opinion..."
                  rows={8}
                  required
                  disabled={submitting}
                />
              </div>
            </div>
            <DialogFooter>
              <Button
                type="button"
                variant="outline"
                onClick={handleCloseEditDialog}
                disabled={submitting}
              >
                Cancel
              </Button>
              <Button
                type="submit"
                disabled={submitting || !opinionText.trim()}
              >
                {submitting ? (
                  <>
                    <Loader2 className="mr-2 h-4 w-4 animate-spin" />
                    Updating...
                  </>
                ) : (
                  "Update Opinion"
                )}
              </Button>
            </DialogFooter>
          </form>
        </DialogContent>
      </Dialog>
    </>
  );
}

