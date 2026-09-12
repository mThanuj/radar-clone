export default function AuthLayout({ children }: LayoutProps<"/">) {
  return (
    <div className="flex min-h-dvh flex-col items-center justify-center px-4 py-12">
      <div className="w-full max-w-sm">
        <div className="mb-8 flex flex-col items-center gap-2">
          <div className="bg-primary text-primary-foreground flex size-9 items-center justify-center rounded-lg font-semibold">
            R
          </div>
          <h1 className="text-xl font-semibold tracking-tight">Radar</h1>
        </div>
        {children}
      </div>
    </div>
  );
}
