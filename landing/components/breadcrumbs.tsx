import Link from "next/link"

export function Breadcrumbs({ items }: { items: { name: string; path: string }[] }) {
  return (
    <nav className="breadcrumbs" aria-label="Breadcrumb">
      <ol>
        <li><Link href="/">Home</Link></li>
        {items.map((item, i) => (
          <li key={item.path} aria-current={i === items.length - 1 ? "page" : undefined}>
            {i === items.length - 1 ? <span>{item.name}</span> : <a href={item.path}>{item.name}</a>}
          </li>
        ))}
      </ol>
    </nav>
  )
}
