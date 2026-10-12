import { ChevronLeft, ChevronRight } from 'lucide-react';
import { Button } from '@/components/ui/button';

export function ListPagination({ page, total, pageSize, onChange }: {
  page: number; total: number; pageSize: number; onChange: (page: number) => void;
}) {
  if (total <= pageSize) return null;
  const pages = Math.ceil(total / pageSize);
  return <nav aria-label="Páginas da lista" className="flex items-center justify-between gap-2 py-2">
    <Button type="button" variant="outline" size="icon" aria-label="Página anterior" disabled={page === 0} onClick={() => onChange(page - 1)}><ChevronLeft /></Button>
    <span className="text-sm text-muted-foreground">{page + 1} / {pages} · {total} itens</span>
    <Button type="button" variant="outline" size="icon" aria-label="Próxima página" disabled={page + 1 >= pages} onClick={() => onChange(page + 1)}><ChevronRight /></Button>
  </nav>;
}