// A template remounts on every tab change, so each page plays a short entrance.
export default function Template({ children }: { children: React.ReactNode }) {
  return <div className="page-enter screen flex flex-col gap-6">{children}</div>;
}
