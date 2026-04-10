// Auth pages override the root layout — no sidebar, full screen
export default function AuthLayout({ children }: { children: React.ReactNode }) {
  return <>{children}</>;
}
