"use client";

import { Card, CardContent, CardHeader, CardTitle, CardDescription } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Heart, Users, Calendar, FileText, MessageSquare, Shield, Bot, User } from "lucide-react";

export function About() {
  return (
    <div className="space-y-6">
      <Card>
        <CardHeader>
          <CardTitle className="flex items-center gap-2">
            <Heart className="h-5 w-5 text-primary" />
            About This Application
          </CardTitle>
          <CardDescription>
            ClarityMDT - A comprehensive platform for managing Multi-Disciplinary Team meetings
          </CardDescription>
        </CardHeader>
        <CardContent className="space-y-6">
          <div className="space-y-4">
            <div>
              <h3 className="text-lg font-semibold mb-2">What is this application?</h3>
              <p className="text-muted-foreground">
                This is a digital system designed to help healthcare teams manage and coordinate Multi-Disciplinary Team (MDT) meetings. 
                MDT meetings bring together doctors and specialists from different departments to discuss patient cases and make 
                collaborative treatment decisions.
              </p>
            </div>

            <div>
              <h3 className="text-lg font-semibold mb-2">What can you do with this system?</h3>
              <div className="grid gap-4 md:grid-cols-2 mt-4">
                <div className="flex items-start gap-3 p-4 border rounded-lg">
                  <Calendar className="h-5 w-5 text-primary mt-0.5" />
                  <div>
                    <h4 className="font-medium mb-1">Schedule Meetings</h4>
                    <p className="text-sm text-muted-foreground">
                      Plan and organize MDT meetings with dates, times, and locations. All team members are automatically notified.
                    </p>
                  </div>
                </div>
                <div className="flex items-start gap-3 p-4 border rounded-lg">
                  <FileText className="h-5 w-5 text-primary mt-0.5" />
                  <div>
                    <h4 className="font-medium mb-1">Manage Patient Cases</h4>
                    <p className="text-sm text-muted-foreground">
                      Submit patient cases for MDT review, track their status, and access complete case histories.
                    </p>
                  </div>
                </div>
                <div className="flex items-start gap-3 p-4 border rounded-lg">
                  <Users className="h-5 w-5 text-primary mt-0.5" />
                  <div>
                    <h4 className="font-medium mb-1">Collaborate</h4>
                    <p className="text-sm text-muted-foreground">
                      Share specialist opinions, radiology findings, and pathology reports with your team members.
                    </p>
                  </div>
                </div>
                <div className="flex items-start gap-3 p-4 border rounded-lg">
                  <MessageSquare className="h-5 w-5 text-primary mt-0.5" />
                  <div>
                    <h4 className="font-medium mb-1">Stay Informed</h4>
                    <p className="text-sm text-muted-foreground">
                      Receive notifications about meetings, case submissions, and important updates via email or Telegram.
                    </p>
                  </div>
                </div>
              </div>
            </div>

            <div>
              <h3 className="text-lg font-semibold mb-2">Key Features</h3>
              <ul className="space-y-2 text-muted-foreground">
                <li className="flex items-start gap-2">
                  <span className="text-primary mt-1">•</span>
                  <span>Digital case submission and tracking system</span>
                </li>
                <li className="flex items-start gap-2">
                  <span className="text-primary mt-1">•</span>
                  <span>Automated notifications for all team members</span>
                </li>
                <li className="flex items-start gap-2">
                  <span className="text-primary mt-1">•</span>
                  <span>Secure document storage and sharing</span>
                </li>
                <li className="flex items-start gap-2">
                  <span className="text-primary mt-1">•</span>
                  <span>MDT consensus report generation</span>
                </li>
                <li className="flex items-start gap-2">
                  <span className="text-primary mt-1">•</span>
                  <span>Role-based access control for different user types</span>
                </li>
                <li className="flex items-start gap-2">
                  <span className="text-primary mt-1">•</span>
                  <span>Digital signature support for authentication</span>
                </li>
              </ul>
            </div>

            <div className="pt-4 border-t">
              <h3 className="text-lg font-semibold mb-2">Who can use this system?</h3>
              <div className="flex flex-wrap gap-2">
                <Badge variant="outline" className="flex items-center gap-1">
                  <Shield className="h-3 w-3" />
                  Administrators
                </Badge>
                <Badge variant="outline" className="flex items-center gap-1">
                  <Users className="h-3 w-3" />
                  Coordinators
                </Badge>
                <Badge variant="outline" className="flex items-center gap-1">
                  <User className="h-3 w-3" />
                  Consultants
                </Badge>
                <Badge variant="outline" className="flex items-center gap-1">
                  <FileText className="h-3 w-3" />
                  Viewers
                </Badge>
              </div>
              <p className="text-sm text-muted-foreground mt-3">
                Each user type has specific permissions tailored to their role in the MDT process. 
                Administrators manage the system, Coordinators organize meetings, Consultants provide expertise, 
                and Viewers can access information for reference.
              </p>
            </div>
          </div>
        </CardContent>
      </Card>

      <div className="grid gap-6 md:grid-cols-2">
        <Card>
          <CardHeader>
            <CardTitle className="flex items-center gap-2">
              <User className="h-5 w-5 text-primary" />
              About the Creator
            </CardTitle>
          </CardHeader>
          <CardContent className="space-y-4">
            <div>
              <h4 className="font-semibold text-lg mb-1">Dr. Nishanth Gopal</h4>
              <p className="text-muted-foreground mb-3">Interventional Radiologist</p>
              <p className="text-sm text-muted-foreground">
                This application was conceptualized and developed under the guidance of Dr. Nishanth Gopal, 
                an Interventional Radiologist dedicated to improving healthcare workflows through digital innovation. 
                The system was designed to streamline MDT meeting processes and enhance collaboration among 
                healthcare professionals.
              </p>
            </div>
            <div className="pt-2 border-t">
              <p className="text-xs text-muted-foreground">
                The application reflects real-world needs and workflows from clinical practice, ensuring 
                it serves healthcare teams effectively in their daily operations.
              </p>
            </div>
          </CardContent>
        </Card>

        <Card>
          <CardHeader>
            <CardTitle className="flex items-center gap-2">
              <Bot className="h-5 w-5 text-primary" />
              About the AI Assistant
            </CardTitle>
          </CardHeader>
          <CardContent className="space-y-4">
            <div>
              <h4 className="font-semibold text-lg mb-1">AI Development Partner</h4>
              <p className="text-muted-foreground mb-3">Powered by Advanced AI Technology</p>
              <p className="text-sm text-muted-foreground">
                This application was built with the assistance of an advanced AI coding assistant. The AI helped 
                translate the vision into a fully functional web application, writing code, implementing features, 
                and ensuring the system meets healthcare industry standards for security and usability.
              </p>
            </div>
            <div className="pt-2 border-t">
              <p className="text-xs text-muted-foreground">
                The AI assistant worked collaboratively throughout the development process, providing technical 
                expertise while maintaining focus on creating an intuitive and user-friendly experience for 
                healthcare professionals.
              </p>
            </div>
          </CardContent>
        </Card>
      </div>

      <Card className="bg-muted/50">
        <CardContent className="pt-6">
          <div className="text-center space-y-2">
            <p className="text-sm font-medium">ClarityMDT</p>
            <p className="text-xs text-muted-foreground">
              Designed to enhance collaboration and efficiency in Multi-Disciplinary Team meetings
            </p>
            <p className="text-xs text-muted-foreground pt-2">
              © {new Date().getFullYear()} All rights reserved
            </p>
          </div>
        </CardContent>
      </Card>
    </div>
  );
}

