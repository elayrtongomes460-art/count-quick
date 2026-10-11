import { Link, useNavigate } from '@tanstack/react-router';
import { useQuery, useQueryClient, useSuspenseQuery } from '@tanstack/react-query';
import { useServerFn } from '@tanstack/react-start';
import { useState } from 'react';
import { CheckCircle2, FileDown, History, ListChecks, Play, Plus } from 'lucide-react';
import { toast } from 'sonner';
import { Button } from '@/components/ui/button';
import { Dialog, DialogContent, DialogDescription, DialogTitle } from '@/components/ui/dialog';
import { SignaturePad } from '@/components/SignaturePad';
import { weightInventoriesOptions, weightInventoryOptions } from '@/lib/weight-inventory.queries';
import { finishWeightInventory } from '@/lib/weight-inventory.functions';
import { gerarPdfInventario } from '@/lib/pdf-inventario';
import { brl, num } from '@/lib/format';
import { InventorySetup } from '@/components/InventorySetup';

const inputClass = 'w-full h-11 rounded-md border border-input bg-card px-3 text-base';

export function WeightInventoryPanel({ inventoryId, onChange }: { inventoryId: string; onChange: (id: string) => void }) {
  const { data } = useSuspenseQuery(weightInventoriesOptions);
  const selected = useQuery(weightInventoryOptions(inventoryId));
  const queryClient = useQueryClient();
  const navigate = useNavigate();
  const finish = useServerFn(finishWeightInventory);
  const [dialog, setDialog] = useState<'start' | 'list' | null>(null);
  const [saving, setSaving] = useState(false);
  const [showSignatures, setShowSignatures] = useState(false);
  const inventory = selected.data?.inventory;

  const finalize = async (signatures: string[]) => {
    try {
      await finish({ data: { id: inventoryId, signatures } });
      setShowSignatures(false);
      await queryClient.invalidateQueries({ queryKey: ['weight-inventory'] });
      await queryClient.invalidateQueries({ queryKey: weightInventoriesOptions.queryKey });
      toast.success('Inventário finalizado e salvo no histórico.');
      navigate({ to: '/inventario/$id', params: { id: inventoryId } });
    } catch (error) { toast.error(error instanceof Error ? error.message : 'Não foi possível finalizar.'); }
  };

  const download = async () => {
    if (!selected.data) return;
    setSaving(true);
    try { await gerarPdfInventario(selected.data.inventory, selected.data.items); }
    catch { toast.error('Não foi possível gerar o PDF.'); }
    finally { setSaving(false); }
  };

  return <>
    <div className="flex items-center gap-2 mb-2 min-w-0">
      <label className="min-w-0 flex-1"><span className="sr-only">Inventário da pesagem</span><select className={`${inputClass} min-w-0`} value={inventoryId} onChange={event => onChange(event.target.value)}>
        <option value="">Selecionar inventário</option>
        {inventory && !data.inventories.some(i => i.id === inventory.id) && <option value={inventory.id}>{inventory.nome_inventario} · {inventory.status}</option>}
        {data.inventories.map(i => <option key={i.id} value={i.id}>{i.nome_inventario}</option>)}
      </select></label>
      <Button variant={inventoryId ? 'outline' : 'default'} className="h-11 shrink-0 px-3" onClick={() => setDialog('start')} aria-label="Iniciar inventário" title="Iniciar inventário">{inventoryId ? <Plus /> : <><Play />Iniciar</>}</Button>
      {inventoryId && <Button variant="outline" size="icon" className="h-11 w-11 shrink-0" disabled={!selected.data} onClick={() => setDialog('list')} aria-label="Listagem da contagem" title="Listagem da contagem"><ListChecks /></Button>}
      {!inventoryId && <Button asChild variant="outline" size="icon" className="h-11 w-11 shrink-0" title="Histórico"><Link to="/historico" aria-label="Histórico"><History /></Link></Button>}
    </div>
    {selected.isError && <p role="alert" className="text-xs text-destructive mb-2">Não foi possível carregar este inventário.</p>}
    {inventory && <p className="text-xs text-muted-foreground mb-2" role="status">{inventory.status} · {selected.data?.items.filter(i => i.contado).length ?? 0} produto(s) contado(s)</p>}
    <Dialog open={dialog !== null} onOpenChange={open => { if (!open && !saving) setDialog(null); }}>
      <DialogContent className="max-w-lg w-[calc(100%-24px)] rounded-lg max-h-[90dvh] overflow-y-auto">
        <DialogTitle>{dialog === 'start' ? 'Iniciar inventário' : 'Listagem da contagem'}</DialogTitle>
        <DialogDescription>{dialog === 'start' ? 'Identificação do inventário' : `${inventory?.nome_inventario ?? ''} · ${selected.data?.items.filter(i => i.contado).length ?? 0} produto(s)`}</DialogDescription>
        {dialog === 'start' ? <InventorySetup onCreated={id => { onChange(id); setDialog(null); }} /> : <>
          <ul className="space-y-2 max-h-[42dvh] overflow-y-auto">
            {selected.data?.items.map(i => <li key={i.id} className="border border-border rounded-md p-3 text-sm">
              <p className="font-semibold text-primary break-words">{i.produto}</p><p className="break-words">{i.designacao}</p>
              {i.observacao && <p className="text-xs text-muted-foreground break-words">{i.observacao}</p>}
              <div className="flex flex-wrap gap-x-3 mt-1 text-xs text-muted-foreground"><span>Sistema: {num(i.quantidade_un_sistema, 0)} {i.unidade_un}</span><span>{i.contado ? `Contada: ${num(i.quantidade_contada, 0)}` : 'Pendente'}</span><span className={Number(i.diferenca) !== 0 ? 'text-destructive' : 'text-success'}>Diferença: {num(i.diferenca, 0)}</span><span>{brl(i.valor_divergencia)}</span></div>
            </li>)}
            {!selected.data?.items.length && <li className="py-6 text-center text-sm text-muted-foreground">Nenhum item contado.</li>}
          </ul>
          <div className="grid grid-cols-2 gap-2"><Button variant="outline" className="h-11" disabled={saving} onClick={download}><FileDown />PDF</Button><Button asChild variant="outline" className="h-11"><Link to="/historico"><History />Histórico</Link></Button></div>
          {inventory?.status === 'Em andamento' && <Button className="h-12 w-full" disabled={!selected.data?.items.length} onClick={() => { setDialog(null); setShowSignatures(true); }}><CheckCircle2 />Finalizar inventário</Button>}
        </>}
      </DialogContent>
    </Dialog>
    <SignaturePad open={showSignatures} steps={['Assinatura do responsável pelo inventário', 'Assinatura do supervisor / conferente']} onCancel={() => setShowSignatures(false)} onConfirm={finalize} />
  </>;
}