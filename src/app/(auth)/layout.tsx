import { Wordmark } from "@/components/ui/wordmark";

export default function AuthLayout({ children }: { children: React.ReactNode }) {
  return (
    <div className="flex flex-1 flex-col items-center justify-center gap-8 p-6">
      <Wordmark />
      <div className="w-full max-w-sm rounded-xl border-2 border-ink bg-white p-6 shadow-[5px_5px_0_var(--ink)]">
        {children}
      </div>
    </div>
  );
}
