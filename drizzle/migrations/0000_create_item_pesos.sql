CREATE TABLE public.item_pesos (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  item_id uuid NOT NULL REFERENCES public.itens(id) ON DELETE CASCADE,
  user_id uuid NOT NULL,
  tipo text NOT NULL CHECK (tipo IN ('parafuso', 'porca', 'arruela')),
  peso_unitario_g numeric NOT NULL CHECK (peso_unitario_g > 0),
  tara_recipiente_g numeric NOT NULL DEFAULT 0 CHECK (tara_recipiente_g >= 0),
  updated_at timestamptz NOT NULL DEFAULT now(),
  UNIQUE (user_id, item_id)
);
GRANT SELECT, INSERT, UPDATE, DELETE ON public.item_pesos TO authenticated;
GRANT ALL ON public.item_pesos TO service_role;
ALTER TABLE public.item_pesos ENABLE ROW LEVEL SECURITY;
CREATE POLICY "own item pesos" ON public.item_pesos FOR ALL TO authenticated USING (auth.uid() = user_id) WITH CHECK (auth.uid() = user_id);
CREATE TRIGGER item_pesos_updated_at BEFORE UPDATE ON public.item_pesos FOR EACH ROW EXECUTE FUNCTION public.tg_updated_at();