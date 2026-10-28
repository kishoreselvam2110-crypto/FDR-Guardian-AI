import React from "react";

export interface Column<T> {
  key: string;
  header: string;
  render?: (item: T) => React.ReactNode;
  align?: "left" | "center" | "right";
  className?: string;
}

interface DataTableProps<T> {
  columns: Column<T>[];
  data: T[];
  keyExtractor: (item: T) => string;
  emptyMessage?: string;
  isLoading?: boolean;
  onRowClick?: (item: T) => void;
  selectedId?: string | null;
  tableAriaLabel?: string;
  stickyHeader?: boolean;
  className?: string;
}

export function DataTable<T>({
  columns,
  data,
  keyExtractor,
  emptyMessage = "No records found matching regulatory query.",
  isLoading = false,
  onRowClick,
  selectedId,
  tableAriaLabel = "Regulatory Ledger Table",
  stickyHeader = true,
  className = "",
}: DataTableProps<T>) {
  if (isLoading) {
    return (
      <div className="w-full p-8 text-center bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-800 rounded-xl space-y-3">
        <span className="inline-block h-6 w-6 rounded-full border-2 border-teal-600 border-t-transparent animate-spin" />
        <p className="text-xs font-semibold text-slate-500">Retrieving ledger records...</p>
      </div>
    );
  }

  if (data.length === 0) {
    return (
      <div className="w-full py-12 px-4 text-center bg-white dark:bg-slate-900 border border-dashed border-slate-200 dark:border-slate-800 rounded-xl">
        <p className="text-xs text-slate-500 dark:text-slate-400">{emptyMessage}</p>
      </div>
    );
  }

  return (
    <div
      className={`w-full overflow-x-auto rounded-xl border border-slate-200 dark:border-slate-800 bg-white dark:bg-slate-900 ${className}`}
    >
      <table
        aria-label={tableAriaLabel}
        className="w-full text-left text-xs border-collapse min-w-[640px]"
      >
        <thead>
          <tr
            className={`bg-slate-50/95 dark:bg-slate-800/90 border-b border-slate-200 dark:border-slate-800 text-slate-600 dark:text-slate-400 font-semibold uppercase tracking-wider text-[11px] ${
              stickyHeader ? "sticky top-0 z-10 backdrop-blur-xs" : ""
            }`}
          >
            {columns.map((col) => (
              <th
                key={col.key}
                className={`py-3 px-4 ${
                  col.align === "right"
                    ? "text-right"
                    : col.align === "center"
                    ? "text-center"
                    : "text-left"
                } ${col.className || ""}`}
              >
                {col.header}
              </th>
            ))}
          </tr>
        </thead>
        <tbody className="divide-y divide-slate-100 dark:divide-slate-800/70 font-mono text-slate-800 dark:text-slate-200">
          {data.map((item) => {
            const id = keyExtractor(item);
            const isSelected = selectedId === id;

            return (
              <tr
                key={id}
                onClick={() => onRowClick?.(item)}
                className={`transition-colors duration-150 motion-reduce:transition-none ${
                  isSelected
                    ? "bg-teal-50/80 dark:bg-teal-950/40 ring-1 ring-inset ring-teal-500"
                    : onRowClick
                    ? "cursor-pointer hover:bg-slate-50/80 dark:hover:bg-slate-800/40"
                    : "hover:bg-slate-50/40 dark:hover:bg-slate-800/20"
                }`}
              >
                {columns.map((col) => (
                  <td
                    key={col.key}
                    className={`py-3 px-4 ${
                      col.align === "right"
                        ? "text-right tabular-nums font-mono"
                        : col.align === "center"
                        ? "text-center"
                        : "text-left"
                    } ${col.className || ""}`}
                  >
                    {col.render
                      ? col.render(item)
                      : ((item as Record<string, unknown>)[col.key] as React.ReactNode) ?? "-"}
                  </td>
                ))}
              </tr>
            );
          })}
        </tbody>
      </table>
    </div>
  );
}
