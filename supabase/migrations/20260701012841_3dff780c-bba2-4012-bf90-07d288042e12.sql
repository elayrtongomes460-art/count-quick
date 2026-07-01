ALTER TABLE public.inventario_itens
  DROP CONSTRAINT IF EXISTS inventario_itens_item_id_fkey;

ALTER TABLE public.inventario_itens
  ADD CONSTRAINT inventario_itens_item_id_fkey
  FOREIGN KEY (item_id)
  REFERENCES public.itens(id)
  ON DELETE SET NULL;