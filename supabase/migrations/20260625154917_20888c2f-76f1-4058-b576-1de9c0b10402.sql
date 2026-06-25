
CREATE TABLE public.contagens_camera (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  inventario_id uuid REFERENCES public.inventarios(id) ON DELETE SET NULL,
  user_id uuid NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  produto text,
  part_number text,
  observacao text,
  imagem_url text NOT NULL,
  quantidade_parafusos integer NOT NULL DEFAULT 0,
  quantidade_porcas integer NOT NULL DEFAULT 0,
  quantidade_arruelas integer NOT NULL DEFAULT 0,
  total_itens integer NOT NULL DEFAULT 0,
  resultado_json jsonb,
  status_confirmacao boolean NOT NULL DEFAULT false,
  origem text NOT NULL DEFAULT 'camera_home',
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);
GRANT SELECT, INSERT, UPDATE, DELETE ON public.contagens_camera TO authenticated;
GRANT ALL ON public.contagens_camera TO service_role;
ALTER TABLE public.contagens_camera ENABLE ROW LEVEL SECURITY;
CREATE POLICY "own contagens camera" ON public.contagens_camera FOR ALL TO authenticated
  USING (auth.uid() = user_id) WITH CHECK (auth.uid() = user_id);
CREATE TRIGGER tg_contagens_camera_updated BEFORE UPDATE ON public.contagens_camera
  FOR EACH ROW EXECUTE FUNCTION public.tg_updated_at();
CREATE INDEX idx_contagens_camera_user ON public.contagens_camera(user_id, created_at DESC);
CREATE INDEX idx_contagens_camera_inv ON public.contagens_camera(inventario_id);

CREATE POLICY "contagens camera read own" ON storage.objects FOR SELECT TO authenticated
  USING (bucket_id = 'contagens-camera' AND (storage.foldername(name))[1] = auth.uid()::text);
CREATE POLICY "contagens camera insert own" ON storage.objects FOR INSERT TO authenticated
  WITH CHECK (bucket_id = 'contagens-camera' AND (storage.foldername(name))[1] = auth.uid()::text);
CREATE POLICY "contagens camera update own" ON storage.objects FOR UPDATE TO authenticated
  USING (bucket_id = 'contagens-camera' AND (storage.foldername(name))[1] = auth.uid()::text);
CREATE POLICY "contagens camera delete own" ON storage.objects FOR DELETE TO authenticated
  USING (bucket_id = 'contagens-camera' AND (storage.foldername(name))[1] = auth.uid()::text);
