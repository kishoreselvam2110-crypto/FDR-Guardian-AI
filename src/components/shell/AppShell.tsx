"use client";

import React, { useState } from "react";
import { Sidebar } from "./Sidebar";
import { TopHeader } from "./TopHeader";
import { ToastProvider } from "../ui/Toast";

interface AppShellProps {
  children: React.ReactNode;
  pageTitle?: string;
  pageSubtitle?: string;
  contextualActions?: React.ReactNode;
}

export function AppShell({
  children,
  pageTitle,
  pageSubtitle,
  contextualActions,
}: AppShellProps) {
  const [sidebarOpen, setSidebarOpen] = useState(false);
  const [currentRole, setCurrentRole] = useState("Regulatory Scrutiny Officer");

  return (
    <ToastProvider>
      <div className="min-h-screen bg-slate-50 dark:bg-slate-950 text-slate-900 dark:text-slate-100 flex">
        {/* Accessible keyboard skip link */}
        <a
          href="#main-content"
          className="sr-only focus:not-sr-only focus:absolute focus:top-2 focus:left-2 focus:z-50 px-4 py-2 bg-teal-700 text-white rounded-md text-xs font-bold"
        >
          Skip to main content
        </a>

        {/* Left Responsive Navigation Sidebar */}
        <Sidebar
          isOpen={sidebarOpen}
          onClose={() => setSidebarOpen(false)}
          currentRole={currentRole}
          onRoleChange={setCurrentRole}
        />

        {/* Main Operational Canvas */}
        <div className="flex-1 flex flex-col min-w-0 lg:pl-64">
          <TopHeader
            onToggleSidebar={() => setSidebarOpen((prev) => !prev)}
            currentRole={currentRole}
          />

          {/* Optional Page Title & Contextual Action Bar */}
          {(pageTitle || contextualActions) && (
            <div className="bg-white dark:bg-slate-900 border-b border-slate-200 dark:border-slate-800 px-4 sm:px-8 py-5">
              <div className="max-w-7xl mx-auto flex flex-col sm:flex-row sm:items-center justify-between gap-4">
                <div>
                  {pageTitle && (
                    <h1 className="text-xl sm:text-2xl font-black tracking-tight text-slate-900 dark:text-slate-50">
                      {pageTitle}
                    </h1>
                  )}
                  {pageSubtitle && (
                    <p className="text-xs sm:text-sm text-slate-500 dark:text-slate-400 mt-1">
                      {pageSubtitle}
                    </p>
                  )}
                </div>

                {contextualActions && (
                  <div className="flex items-center gap-2.5 shrink-0">
                    {contextualActions}
                  </div>
                )}
              </div>
            </div>
          )}

          {/* Main Content Area */}
          <main id="main-content" className="flex-1 p-4 sm:p-6 lg:p-8 max-w-7xl w-full mx-auto">
            {children}
          </main>
        </div>
      </div>
    </ToastProvider>
  );
}
