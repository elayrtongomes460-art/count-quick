DROP POLICY IF EXISTS "auth update itens" ON public.itens;
DROP POLICY IF EXISTS "auth delete itens" ON public.itens;

CREATE POLICY "authenticated users can update itens"
  ON public.itens
  FOR UPDATE
  TO authenticated
  USING (auth.uid() IS NOT NULL)
  WITH CHECK (auth.uid() IS NOT NULL);

CREATE POLICY "authenticated users can delete itens"
  ON public.itens
  FOR DELETE
  TO authenticated
  USING (auth.uid() IS NOT NULL);